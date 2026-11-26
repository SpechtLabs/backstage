import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import {
  parseEntityRef,
  stringifyEntityRef,
  type Entity,
} from '@backstage/catalog-model';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import Router from 'express-promise-router';
import { accessFor } from './access';
import { compileAll, type Overview as Compiled } from './compile';
import { TAILSCALE_KIND } from './model';
import { publishPolicy, type PublishTarget } from './publish';
import { pullRequestBody, pullRequestTitle } from './report';

/** Where a policy is published, and how the last run went. */
export interface PublishStatus {
  repo: string;
  path: string;
  branch: string;
  last?: { at: string; outcome: string; url?: string; error?: string };
}

/** GET /overview */
export type Overview = Compiled & {
  /** By policy entity ref. */
  publish: Record<string, PublishStatus>;
};

/** What the plugin reads from catalog entities; nothing else is fetched. */
export const CATALOG_FIELDS = [
  'apiVersion',
  'kind',
  'metadata.name',
  'metadata.namespace',
  'metadata.title',
  'metadata.description',
  'metadata.annotations',
  'spec',
  'relations',
];

/**
 * Tailscale policies from the catalog: kind Tailscale entities, the
 * catalog's Users and Groups, and (with catalogGrants) the APIs Components
 * consume across the tailnet. See model.ts for the entities.
 *
 *   GET /api/tailscale/overview                         every policy
 *   GET /api/tailscale/policies/:namespace/:name/file   one policy file
 *   GET /api/tailscale/access?entity=<ref>              one entity's view
 *
 * tailscale.publish keeps a pull request open with a policy's file.
 */
export const tailscalePlugin = createBackendPlugin({
  pluginId: 'tailscale',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        auth: coreServices.auth,
        scheduler: coreServices.scheduler,
        httpRouter: coreServices.httpRouter,
        catalog: catalogServiceRef,
      },
      async init({ config, logger, auth, scheduler, httpRouter, catalog }) {
        const baseUrl = config.getOptionalString('app.baseUrl');
        const settings = config.getOptionalConfig('tailscale');

        const load = async () => {
          const credentials = await auth.getOwnServiceCredentials();
          const { items } = await catalog.getEntities(
            {
              filter: [
                { kind: TAILSCALE_KIND },
                { kind: 'Group' },
                { kind: 'User' },
                { kind: 'Component' },
                { kind: 'API' },
                { kind: 'Resource', 'spec.type': 'kubernetes-cluster' },
              ],
              fields: CATALOG_FIELDS,
            },
            { credentials },
          );
          const entities = items as Entity[];
          return {
            compiled: compileAll(entities, baseUrl),
            byRef: new Map(entities.map(e => [stringifyEntityRef(e), e])),
          };
        };

        // Pages and entity cards read this; keep the catalog out of every
        // request.
        type Snapshot = Awaited<ReturnType<typeof load>>;
        let cached: { at: number; snapshot: Promise<Snapshot> } | undefined;
        const current = (maxAgeMs = 60 * 1000) => {
          if (!cached || Date.now() - cached.at > maxAgeMs) {
            const snapshot = load();
            cached = { at: Date.now(), snapshot };
            snapshot.catch(() => {
              if (cached?.snapshot === snapshot) cached = undefined;
            });
          }
          return cached.snapshot;
        };

        const targets = new Map<string, PublishTarget>();
        for (const entry of settings?.getOptionalConfigArray('publish') ?? []) {
          const policy = stringifyEntityRef(
            parseEntityRef(entry.getString('policy'), {
              defaultKind: TAILSCALE_KIND,
              defaultNamespace: 'default',
            }),
          );
          targets.set(policy, {
            repo: entry.getString('repo'),
            path: entry.getOptionalString('path') ?? 'policy.hujson',
            branch: entry.getOptionalString('branch') ?? 'backstage/tailscale',
          });
        }
        const lastPublish = new Map<string, PublishStatus['last']>();

        const router = Router();
        router.get('/overview', async (_req, res) => {
          const { compiled } = await current();
          const body: Overview = {
            ...compiled,
            publish: Object.fromEntries(
              [...targets].map(([ref, target]) => [
                ref,
                { ...target, last: lastPublish.get(ref) },
              ]),
            ),
          };
          res.json(body);
        });
        router.get('/policies/:namespace/:name/file', async (req, res) => {
          const { compiled } = await current();
          const ref = stringifyEntityRef({
            kind: TAILSCALE_KIND,
            namespace: req.params.namespace,
            name: req.params.name,
          });
          const policy = compiled.policies.find(p => p.entityRef === ref);
          if (!policy) {
            res.status(404).json({ error: `No Tailscale policy ${ref}` });
            return;
          }
          res
            .type('text/plain')
            .setHeader(
              'content-disposition',
              `inline; filename="${policy.name}.hujson"`,
            )
            .send(policy.text);
        });
        router.get('/access', async (req, res) => {
          let ref: string;
          try {
            ref = stringifyEntityRef(parseEntityRef(String(req.query.entity)));
          } catch {
            res.status(400).json({ error: 'entity must be an entity ref' });
            return;
          }
          const { compiled, byRef } = await current();
          const credentials = await auth.getOwnServiceCredentials();
          const entity =
            byRef.get(ref) ??
            (await catalog.getEntityByRef(ref, { credentials }));
          if (!entity) {
            res.status(404).json({ error: `No entity ${ref}` });
            return;
          }
          res.json(accessFor(entity, compiled, byRef));
        });
        httpRouter.use(router);

        if (!targets.size) return;
        const github = DefaultGithubCredentialsProvider.fromIntegrations(
          ScmIntegrations.fromConfig(config),
        );

        await scheduler.scheduleTask({
          id: 'tailscale-publish',
          frequency: { minutes: 60 },
          timeout: { minutes: 5 },
          // Let the catalog settle after a restart before reading it.
          initialDelay: { minutes: 3 },
          fn: async () => {
            const { compiled } = await current(0);
            for (const [ref, target] of targets) {
              const policy = compiled.policies.find(p => p.entityRef === ref);
              if (!policy) {
                logger.warn(`tailscale: no policy ${ref} in the catalog`);
                continue;
              }
              try {
                const result = await publishPolicy(
                  github,
                  target,
                  {
                    policyText: policy.text,
                    title: pullRequestTitle(policy),
                    body: pullRequestBody(policy, baseUrl),
                  },
                  logger,
                );
                lastPublish.set(ref, {
                  at: new Date().toISOString(),
                  outcome: result.outcome,
                  url: 'url' in result ? result.url : undefined,
                });
                logger.info(
                  `tailscale: ${ref} ${result.outcome}${
                    'url' in result ? ` ${result.url}` : ''
                  }`,
                );
              } catch (error) {
                lastPublish.set(ref, {
                  at: new Date().toISOString(),
                  outcome: 'failed',
                  error: String(error),
                });
                logger.error(
                  `tailscale: publishing ${ref} failed`,
                  error as Error,
                );
              }
            }
          },
        });
      },
    });
  },
});
