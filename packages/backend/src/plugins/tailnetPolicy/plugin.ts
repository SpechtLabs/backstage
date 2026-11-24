import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import Router from 'express-promise-router';
import { buildTailnetGraph } from './graph';
import { parsePolicy } from './policy';
import { publishPolicy, type PublishTarget } from './publish';
import { renderPolicy, type Rendered } from './render';

/**
 * Renders Tailscale grants from the catalog's dependency graph and compares
 * them with the hand-written policy (shadow mode). See graph.ts for the
 * annotations it reads.
 *
 *   GET /api/tailnet-policy/policy   the generated policy fragment (HuJSON)
 *   GET /api/tailnet-policy/report   the comparison, as Markdown
 *
 * With tailnetPolicy.publish set, it also keeps a pull request with the
 * fragment open against that repo, refreshed on a schedule.
 */
export const tailnetPolicyPlugin = createBackendPlugin({
  pluginId: 'tailnet-policy',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        auth: coreServices.auth,
        scheduler: coreServices.scheduler,
        urlReader: coreServices.urlReader,
        httpRouter: coreServices.httpRouter,
        catalog: catalogServiceRef,
      },
      async init({
        config,
        logger,
        auth,
        scheduler,
        urlReader,
        httpRouter,
        catalog,
      }) {
        const settings = config.getOptionalConfig('tailnetPolicy');
        if (!settings) {
          logger.info('tailnetPolicy is not configured; plugin disabled');
          return;
        }
        const basePolicyUrl = settings.getString('basePolicyUrl');
        const clusterTagOwners = Object.fromEntries(
          Object.entries(
            settings.getOptional<Record<string, string>>('clusterTagOwners') ??
              {},
          ),
        );
        const defaultTagOwners = settings.getOptionalStringArray(
          'defaultTagOwners',
        ) ?? ['group:admins'];

        const render = async (): Promise<Rendered> => {
          const credentials = await auth.getOwnServiceCredentials();
          const { items } = await catalog.getEntities(
            {
              filter: [
                { kind: 'Component' },
                { kind: 'API' },
                { kind: 'Resource', 'spec.type': 'kubernetes-cluster' },
              ],
              fields: [
                'kind',
                'metadata.name',
                'metadata.namespace',
                'metadata.annotations',
                'spec.type',
                'relations',
              ],
            },
            { credentials },
          );
          const base = await urlReader.readUrl(basePolicyUrl);
          const policy = parsePolicy((await base.buffer()).toString('utf8'));
          return renderPolicy(buildTailnetGraph(items as Entity[]), policy, {
            basePolicyUrl,
            clusterTagOwners,
            defaultTagOwners,
          });
        };

        const router = Router();
        router.get('/policy', async (_req, res) => {
          res.type('text/plain').send((await render()).policyText);
        });
        router.get('/report', async (_req, res) => {
          res.type('text/markdown').send((await render()).report);
        });
        httpRouter.use(router);

        const publish = settings.getOptionalConfig('publish');
        if (!publish) return;
        const target: PublishTarget = {
          repo: publish.getString('repo'),
          path:
            publish.getOptionalString('path') ?? 'tailscale/generated.hujson',
          branch:
            publish.getOptionalString('branch') ?? 'backstage/tailnet-policy',
        };
        const github = DefaultGithubCredentialsProvider.fromIntegrations(
          ScmIntegrations.fromConfig(config),
        );

        await scheduler.scheduleTask({
          id: 'tailnet-policy-publish',
          frequency: { minutes: 60 },
          timeout: { minutes: 5 },
          // Let the catalog settle after a restart before reading it.
          initialDelay: { minutes: 3 },
          fn: async () => {
            const rendered = await render();
            const { match, broad, grants } = rendered.summary;
            const result = await publishPolicy(
              github,
              target,
              {
                policyText: rendered.policyText,
                title: `feat(tailscale): ${grants} grants from the catalog (${match} match, ${broad} broad, ${rendered.summary.new} new)`,
                body: rendered.report,
              },
              logger,
            );
            logger.info(
              `tailnet policy: ${result.outcome}${
                'url' in result ? ` ${result.url}` : ''
              }`,
              rendered.summary,
            );
          },
        });
      },
    });
  },
});
