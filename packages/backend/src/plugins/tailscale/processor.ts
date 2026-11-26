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
import {
  isTailscale,
  RELATION_APPLIED_BY,
  RELATION_APPLIES_TO,
  RELATION_HAS_POLICY_PART,
  RELATION_PART_OF_POLICY,
  TAILSCALE_KIND,
  validateTailscaleSpec,
} from './model';

/** Validates Tailscale entities and relates them to what they name. */
export class TailscaleEntityProcessor implements CatalogProcessor {
  getProcessorName() {
    return 'TailscaleEntityProcessor';
  }

  async validateEntityKind(entity: Entity): Promise<boolean> {
    if (!isTailscale(entity)) return false;
    const errors = validateTailscaleSpec(entity.spec);
    if (errors.length) {
      throw new Error(
        `Invalid Tailscale ${String(
          entity.spec?.type ?? 'entity',
        )}: ${errors.join('; ')}`,
      );
    }
    return true;
  }

  async postProcessEntity(
    entity: Entity,
    _location: LocationSpec,
    emit: CatalogProcessorEmit,
  ): Promise<Entity> {
    if (!isTailscale(entity)) return entity;
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

    const { spec } = entity;
    pair(ref(spec.owner, 'Group'), RELATION_OWNED_BY, RELATION_OWNER_OF);
    if (spec.system) {
      pair(ref(spec.system, 'System'), RELATION_PART_OF, RELATION_HAS_PART);
    }
    if (spec.target) {
      pair(
        ref(spec.target, TAILSCALE_KIND),
        RELATION_PART_OF_POLICY,
        RELATION_HAS_POLICY_PART,
      );
    }
    for (const target of spec.appliesTo ?? []) {
      pair(ref(target, 'Component'), RELATION_APPLIES_TO, RELATION_APPLIED_BY);
    }
    return entity;
  }
}

/** Registers kind: Tailscale with the catalog. */
export const catalogModuleTailscale = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'tailscale-kind',
  register(reg) {
    reg.registerInit({
      deps: { catalog: catalogProcessingExtensionPoint },
      async init({ catalog }) {
        catalog.addProcessor(new TailscaleEntityProcessor());
      },
    });
  },
});
