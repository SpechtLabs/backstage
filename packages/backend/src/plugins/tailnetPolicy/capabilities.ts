import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import type { Finding } from './graph';
import {
  isTailscaleGrant,
  validateTailscaleGrantSpec,
  type TailscaleGrantEntity,
} from './kind';
import type { Grant, ParsedPolicy } from './policy';

/** A hand-written grant, as the analysis points at it. */
export interface PolicyGrantRef {
  number: number;
  line?: number;
  text: string;
}

export type CapabilityStatus = 'match' | 'differs' | 'new';
export type HandWrittenCapabilityStatus =
  | 'declared'
  | 'differs'
  | 'missing'
  | 'hand-written';

type App = Record<string, unknown[]>;

/** A TailscaleGrant from the catalog, next to the hand-written policy. */
export interface CapabilityGrant {
  entity: string;
  title?: string;
  description?: string;
  targets: string[];
  src: string[];
  dst: string[];
  ip: string[];
  app: App;
  status: CapabilityStatus;
  /** The hand-written grant it matches, or the closest one it differs from. */
  counterpart?: PolicyGrantRef;
  differences: string[];
}

/** A hand-written grant with capabilities, next to the catalog. */
export interface HandWrittenCapability extends PolicyGrantRef {
  src: string[];
  dst: string[];
  ip: string[];
  app: App;
  status: HandWrittenCapabilityStatus;
  declaredBy?: string;
}

export interface CapabilitySummary {
  grants: number;
  match: number;
  differs: number;
  new: number;
  declared: number;
  missing: number;
  handWritten: number;
}

/** JSON with sorted keys and order-insensitive lists: equal means equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).sort().join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

const sameSet = (a: string[], b: string[]) => canonical(a) === canonical(b);

// Hand-written capability grants the catalog can't declare: autogroups,
// wildcards, users by name.
const expressible = (grant: Grant) =>
  grant.src.every(s => /^(group|tag):/.test(s)) &&
  grant.dst.every(d => /^(tag|svc):/.test(d));

function differences(catalog: CapabilityGrant, hand: Grant): string[] {
  const out: string[] = [];
  if (!sameSet(catalog.ip, hand.ip ?? [])) {
    out.push(
      `ports: hand-written ${(hand.ip ?? []).join(
        ', ',
      )}, catalog ${catalog.ip.join(', ')}`,
    );
  }
  const handApp = (hand.app ?? {}) as App;
  const names = [
    ...new Set([...Object.keys(catalog.app), ...Object.keys(handApp)]),
  ].sort();
  for (const name of names) {
    if (!(name in handApp)) out.push(`${name}: only in the catalog`);
    else if (!(name in catalog.app)) out.push(`${name}: only hand-written`);
    else if (canonical(handApp[name]) !== canonical(catalog.app[name])) {
      out.push(`${name}: different values`);
    }
  }
  return out;
}

/**
 * Compares the TailscaleGrant entities with the hand-written grants that
 * carry capabilities. Same src and dst, ports and capabilities: a match.
 * Same src and dst but something else differs: the closest one, with what
 * differs.
 */
export function compareCapabilities(
  entities: TailscaleGrantEntity[],
  parsed: ParsedPolicy,
  refOf: (grant: Grant) => PolicyGrantRef,
) {
  const invalid: Finding[] = [];
  const handGrants = (parsed.policy.grants ?? []).filter(g => g.app);

  const catalog: CapabilityGrant[] = entities
    .filter(e => {
      if (!isTailscaleGrant(e)) return false;
      const errors = validateTailscaleGrantSpec(e.spec);
      if (errors.length) {
        invalid.push({
          entity: stringifyEntityRef(e),
          message: errors.join('; '),
        });
      }
      return !errors.length;
    })
    .map(e => ({
      entity: stringifyEntityRef(e),
      title: e.metadata.title,
      description: e.metadata.description,
      // Full refs (component:default/tsidp), as the relations have them.
      targets: e.spec.targets.map(t =>
        stringifyEntityRef(
          parseEntityRef(t, {
            defaultKind: 'component',
            defaultNamespace: e.metadata.namespace ?? 'default',
          }),
        ),
      ),
      src: [...e.spec.src].sort(),
      dst: [...e.spec.dst].sort(),
      ip: [...e.spec.ip].sort(),
      app: e.spec.app,
      status: 'new' as CapabilityStatus,
      differences: [],
    }))
    .sort((a, b) => a.entity.localeCompare(b.entity));

  const pairedHand = new Map<
    Grant,
    { status: 'declared' | 'differs'; by: string }
  >();

  // Exact matches first, so a near miss can't take an exact match's partner.
  for (const grant of catalog) {
    const exact = handGrants.find(
      h =>
        !pairedHand.has(h) &&
        sameSet(h.src, grant.src) &&
        sameSet(h.dst, grant.dst) &&
        sameSet(h.ip ?? [], grant.ip) &&
        canonical(h.app) === canonical(grant.app),
    );
    if (exact) {
      grant.status = 'match';
      grant.counterpart = refOf(exact);
      pairedHand.set(exact, { status: 'declared', by: grant.entity });
    }
  }
  for (const grant of catalog.filter(g => g.status === 'new')) {
    const shared = (h: Grant) =>
      Object.keys(h.app ?? {}).filter(name => name in grant.app).length;
    const closest = handGrants
      .filter(
        h =>
          !pairedHand.has(h) &&
          sameSet(h.src, grant.src) &&
          sameSet(h.dst, grant.dst) &&
          shared(h) > 0,
      )
      .sort((a, b) => shared(b) - shared(a))[0];
    if (closest) {
      grant.status = 'differs';
      grant.counterpart = refOf(closest);
      grant.differences = differences(grant, closest);
      pairedHand.set(closest, { status: 'differs', by: grant.entity });
    }
  }

  const handWritten: HandWrittenCapability[] = handGrants.map(h => {
    const paired = pairedHand.get(h);
    let status: HandWrittenCapabilityStatus = 'missing';
    if (paired) status = paired.status;
    else if (!expressible(h)) status = 'hand-written';
    return {
      ...refOf(h),
      src: h.src,
      dst: h.dst,
      ip: h.ip ?? [],
      app: (h.app ?? {}) as App,
      status,
      declaredBy: paired?.by,
    };
  });

  const count = <T extends { status: string }>(list: T[], status: string) =>
    list.filter(x => x.status === status).length;
  const summary: CapabilitySummary = {
    grants: catalog.length,
    match: count(catalog, 'match'),
    differs: count(catalog, 'differs'),
    new: count(catalog, 'new'),
    declared: count(handWritten, 'declared'),
    missing: count(handWritten, 'missing'),
    handWritten: count(handWritten, 'hand-written'),
  };
  return { catalog, handWritten, summary, invalid };
}
