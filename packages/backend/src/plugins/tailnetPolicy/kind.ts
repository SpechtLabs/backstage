import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  getCompoundEntityRef,
  parseEntityRef,
  RELATION_HAS_PART,
  RELATION_OWNED_BY,
  RELATION_OWNER_OF,
  RELATION_PART_OF,
  type Entity,
} from '@backstage/catalog-model';
import {
  catalogProcessingExtensionPoint,
  processingResult,
  type CatalogProcessor,
  type CatalogProcessorEmit,
  type LocationSpec,
} from '@backstage/plugin-catalog-node';
import type { JsonObject } from '@backstage/types';
import { isWildcardPort, parsePort } from './ports';

/**
 * TailscaleGrant: one Tailscale grant with application capabilities, as a
 * catalog entity. Where a tailnet edge (tailnet-src -> tailnet-dst) can't
 * say what a grant carries, this can: the capability and its values, per
 * source. It names the catalog entities it is about (spec.targets), so they
 * show it and link to it.
 *
 *   apiVersion: specht-labs.de/v1alpha1
 *   kind: TailscaleGrant
 *   metadata:
 *     name: sre-argocd-login
 *   spec:
 *     owner: group:spechtlabs
 *     targets: [component:tsidp, component:argocd]
 *     src: [group:sre]
 *     dst: [tag:tsidp]
 *     ip: ['*']
 *     app:
 *       tailscale.com/cap/tsidp:
 *         - users: [group:sre]
 *           resources: [argocd]
 *
 * src, dst, ip and app are the grant's own fields, as in policy.hujson.
 * The catalog only accepts the kind from the locations catalog.rules allows.
 */
export const TAILSCALE_GRANT_API_VERSION = 'specht-labs.de/v1alpha1';
export const TAILSCALE_GRANT_KIND = 'TailscaleGrant';

/** The grant is "for" these entities; they list it as accessGrantedBy. */
export const RELATION_GRANTS_ACCESS_TO = 'grantsAccessTo';
export const RELATION_ACCESS_GRANTED_BY = 'accessGrantedBy';

export type TailscaleGrantSpec = {
  owner: string;
  system?: string;
  targets: string[];
  src: string[];
  dst: string[];
  ip: string[];
  app: { [capability: string]: JsonObject[] };
};

export interface TailscaleGrantEntity extends Entity {
  apiVersion: typeof TAILSCALE_GRANT_API_VERSION;
  kind: typeof TAILSCALE_GRANT_KIND;
  spec: TailscaleGrantSpec;
}

export function isTailscaleGrant(
  entity: Entity,
): entity is TailscaleGrantEntity {
  return (
    entity.apiVersion === TAILSCALE_GRANT_API_VERSION &&
    entity.kind === TAILSCALE_GRANT_KIND
  );
}

// People and devices by group or tag; no *, no autogroups: those grants
// stay hand-written.
const SRC = /^(group|tag):[a-z0-9-]+$/;
const DST = /^(tag|svc):[a-z0-9-]+$/;
const CAPABILITY = /^[a-z0-9.-]+\/cap\/[a-z0-9-]+$/;

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string');

/** What is wrong with a TailscaleGrant's spec; empty when it's valid. */
export function validateTailscaleGrantSpec(spec: unknown): string[] {
  const errors: string[] = [];
  if (!spec || typeof spec !== 'object') return ['spec is missing'];
  const s = spec as Record<string, unknown>;

  if (typeof s.owner !== 'string' || !s.owner)
    errors.push('spec.owner is required');
  if (s.system !== undefined && typeof s.system !== 'string') {
    errors.push('spec.system must be an entity reference');
  }
  if (!isStringArray(s.targets) || !s.targets.length) {
    errors.push('spec.targets needs at least one entity reference');
  }
  const selectors = (field: string, pattern: RegExp, allowed: string) => {
    const value = s[field];
    if (!isStringArray(value) || !value.length) {
      errors.push(`spec.${field} needs at least one selector`);
      return;
    }
    const bad = value.filter(v => !pattern.test(v));
    if (bad.length) {
      errors.push(`spec.${field}: only ${allowed}, not ${bad.join(', ')}`);
    }
  };
  selectors('src', SRC, 'group:… and tag:…');
  selectors('dst', DST, 'tag:… and svc:…');

  if (!isStringArray(s.ip) || !s.ip.length) {
    errors.push('spec.ip needs at least one port (or *)');
  } else {
    const bad = s.ip.filter(p => !parsePort(p));
    if (bad.length) errors.push(`spec.ip: not ports: ${bad.join(', ')}`);
  }

  const app = s.app as Record<string, unknown> | undefined;
  if (
    !app ||
    typeof app !== 'object' ||
    Array.isArray(app) ||
    !Object.keys(app).length
  ) {
    errors.push(
      'spec.app needs at least one capability: a grant without one is a tailnet edge (annotations), not a TailscaleGrant',
    );
  } else {
    for (const [name, values] of Object.entries(app)) {
      if (!CAPABILITY.test(name)) {
        errors.push(
          `spec.app: ${name} is not a capability name (<domain>/cap/<name>)`,
        );
      }
      if (
        !Array.isArray(values) ||
        !values.length ||
        !values.every(v => v && typeof v === 'object' && !Array.isArray(v))
      ) {
        errors.push(`spec.app.${name} must be a list of objects`);
      }
    }
  }
  return errors;
}

/** Whether a grant's ports are all concrete (no *). */
export function hasConcretePorts(ip: string[]) {
  return ip.every(p => {
    const range = parsePort(p);
    return range !== undefined && !isWildcardPort(range);
  });
}

/** Validates TailscaleGrant entities and adds their relations. */
export class TailscaleGrantProcessor implements CatalogProcessor {
  getProcessorName() {
    return 'TailscaleGrantProcessor';
  }

  async validateEntityKind(entity: Entity): Promise<boolean> {
    if (!isTailscaleGrant(entity)) return false;
    const errors = validateTailscaleGrantSpec(entity.spec);
    if (errors.length) {
      throw new Error(`Invalid TailscaleGrant: ${errors.join('; ')}`);
    }
    return true;
  }

  async postProcessEntity(
    entity: Entity,
    _location: LocationSpec,
    emit: CatalogProcessorEmit,
  ): Promise<Entity> {
    if (!isTailscaleGrant(entity)) return entity;
    const self = getCompoundEntityRef(entity);
    const ref = (value: string, defaultKind: string) =>
      parseEntityRef(value, { defaultKind, defaultNamespace: self.namespace });
    const pair = (
      target: ReturnType<typeof ref>,
      forward: string,
      backward: string,
    ) => {
      emit(processingResult.relation({ source: self, type: forward, target }));
      emit(
        processingResult.relation({
          source: target,
          type: backward,
          target: self,
        }),
      );
    };

    pair(ref(entity.spec.owner, 'Group'), RELATION_OWNED_BY, RELATION_OWNER_OF);
    if (entity.spec.system) {
      pair(
        ref(entity.spec.system, 'System'),
        RELATION_PART_OF,
        RELATION_HAS_PART,
      );
    }
    for (const target of entity.spec.targets) {
      pair(
        ref(target, 'Component'),
        RELATION_GRANTS_ACCESS_TO,
        RELATION_ACCESS_GRANTED_BY,
      );
    }
    return entity;
  }
}

/** Registers the TailscaleGrant kind with the catalog. */
export const catalogModuleTailscaleGrant = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'tailscale-grant-kind',
  register(reg) {
    reg.registerInit({
      deps: { catalog: catalogProcessingExtensionPoint },
      async init({ catalog }) {
        catalog.addProcessor(new TailscaleGrantProcessor());
      },
    });
  },
});
