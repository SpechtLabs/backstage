import { createBackendModule } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import type { Entity } from '@backstage/catalog-model';
import {
  techInsightsFactRetrieversExtensionPoint,
  type FactRetriever,
  type FactRetrieverContext,
} from '@backstage-community/plugin-tech-insights-node';
import { DateTime } from 'luxon';

const RENOVATE_CONFIGS = [
  'renovate.json',
  'renovate.json5',
  '.github/renovate.json',
  '.github/renovate.json5',
  '.renovaterc',
  '.renovaterc.json',
];

/** Whether the repo has a Renovate config on main (or master). */
async function hasRenovateConfig(
  ctx: FactRetrieverContext,
  slug: string,
): Promise<boolean> {
  for (const branch of ['main', 'master']) {
    for (const path of RENOVATE_CONFIGS) {
      try {
        await ctx.urlReader.readUrl(
          `https://github.com/${slug}/blob/${branch}/${path}`,
        );
        return true;
      } catch (error) {
        if ((error as Error).name !== 'NotFoundError') {
          ctx.logger.warn(
            `Renovate check for ${slug} (${branch}/${path}) failed: ${error}`,
          );
        }
      }
    }
  }
  return false;
}

/**
 * Facts about the SpechtLabs conventions a component follows: the
 * annotations that wire up the GitHub, ArgoCD and Kubernetes views, a
 * System, and Renovate in its repo. The scorecard checks
 * (techInsights.factChecker.checks in app-config.yaml) read these.
 */
export const spechtLabsFactRetriever: FactRetriever = {
  id: 'spechtLabsFactRetriever',
  version: '0.1.0',
  title: 'SpechtLabs conventions',
  description:
    'Annotations, system membership and Renovate setup of components',
  entityFilter: [{ kind: 'component' }],
  schema: {
    hasGithubSlug: {
      type: 'boolean',
      description: 'Annotated with github.com/project-slug',
    },
    hasArgocdApp: {
      type: 'boolean',
      description: 'Annotated with argocd/app-name or argocd/app-selector',
    },
    hasKubernetesWorkloads: {
      type: 'boolean',
      description:
        'Annotated with backstage.io/kubernetes-id or backstage.io/kubernetes-label-selector',
    },
    hasSystem: {
      type: 'boolean',
      description: 'Part of a System (spec.system)',
    },
    hasRenovate: {
      type: 'boolean',
      description: 'Its GitHub repo has a Renovate config',
    },
  },
  handler: async ctx => {
    const { discovery, auth, entityFilter } = ctx;
    const { token } = await auth.getPluginRequestToken({
      onBehalfOf: await auth.getOwnServiceCredentials(),
      targetPluginId: 'catalog',
    });
    const catalog = new CatalogClient({ discoveryApi: discovery });
    const { items } = await catalog.getEntities(
      { filter: entityFilter },
      { token },
    );

    // One Renovate lookup per repo, however many components share it.
    const renovate = new Map<string, Promise<boolean>>();
    const annotation = (entity: Entity, key: string) =>
      Boolean(entity.metadata.annotations?.[key]);

    return Promise.all(
      items.map(async entity => {
        const slug = entity.metadata.annotations?.['github.com/project-slug'];
        if (slug && !renovate.has(slug)) {
          renovate.set(slug, hasRenovateConfig(ctx, slug));
        }
        return {
          entity: {
            namespace: entity.metadata.namespace ?? 'default',
            kind: entity.kind,
            name: entity.metadata.name,
          },
          facts: {
            hasGithubSlug: Boolean(slug),
            hasArgocdApp:
              annotation(entity, 'argocd/app-name') ||
              annotation(entity, 'argocd/app-selector'),
            hasKubernetesWorkloads:
              annotation(entity, 'backstage.io/kubernetes-id') ||
              annotation(entity, 'backstage.io/kubernetes-label-selector'),
            hasSystem: Boolean(entity.spec?.system),
            hasRenovate: slug ? await renovate.get(slug)! : false,
          },
          timestamp: DateTime.now(),
        };
      }),
    );
  },
};

export const techInsightsModuleSpechtLabs = createBackendModule({
  pluginId: 'tech-insights',
  moduleId: 'spechtlabs-facts',
  register(reg) {
    reg.registerInit({
      deps: { providers: techInsightsFactRetrieversExtensionPoint },
      async init({ providers }) {
        providers.addFactRetrievers({
          spechtLabsFactRetriever,
        });
      },
    });
  },
});
