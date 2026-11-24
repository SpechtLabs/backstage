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
import { isTailscaleGrant } from './kind';
import { parsePolicy } from './policy';
import { publishPolicy, type PublishTarget } from './publish';
import { analyze, policyText, reportMarkdown, type Analysis } from './render';

/** The last publish run, for the UI. */
export interface PublishStatus {
  repo: string;
  path: string;
  branch: string;
  last?: { at: string; outcome: string; url?: string };
}

/** GET /overview: the analysis, and where it is published. */
export type Overview = Analysis & { publish?: PublishStatus };

/** What the analysis reads from catalog entities; nothing else is fetched. */
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
 * Renders Tailscale grants from the catalog's dependency graph and compares
 * them with the hand-written policy (shadow mode). See graph.ts for the
 * annotations it reads.
 *
 *   GET /api/tailnet-policy/overview the analysis as JSON, for the UI
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

        const analyzeNow = async (): Promise<Analysis> => {
          const credentials = await auth.getOwnServiceCredentials();
          const { items } = await catalog.getEntities(
            {
              filter: [
                { kind: 'Component' },
                { kind: 'API' },
                { kind: 'Resource', 'spec.type': 'kubernetes-cluster' },
                { kind: 'TailscaleGrant' },
              ],
              fields: CATALOG_FIELDS,
            },
            { credentials },
          );
          const base = await urlReader.readUrl(basePolicyUrl);
          const parsed = parsePolicy((await base.buffer()).toString('utf8'));
          const entities = items as Entity[];
          return analyze(
            buildTailnetGraph(entities),
            parsed,
            { basePolicyUrl, clusterTagOwners, defaultTagOwners },
            entities.filter(isTailscaleGrant),
          );
        };

        // Page views and entity cards read this; keep GitHub and the catalog
        // out of every request.
        let cached: { at: number; analysis: Promise<Analysis> } | undefined;
        const current = (maxAgeMs = 2 * 60 * 1000) => {
          if (!cached || Date.now() - cached.at > maxAgeMs) {
            const analysis = analyzeNow();
            cached = { at: Date.now(), analysis };
            analysis.catch(() => {
              if (cached?.analysis === analysis) cached = undefined;
            });
          }
          return cached.analysis;
        };

        const publish = settings.getOptionalConfig('publish');
        const target: PublishTarget | undefined = publish && {
          repo: publish.getString('repo'),
          path:
            publish.getOptionalString('path') ?? 'tailscale/generated.hujson',
          branch:
            publish.getOptionalString('branch') ?? 'backstage/tailnet-policy',
        };
        let lastPublish: PublishStatus['last'];

        const router = Router();
        router.get('/overview', async (_req, res) => {
          const body: Overview = {
            ...(await current()),
            publish: target && {
              repo: target.repo,
              path: target.path,
              branch: target.branch,
              last: lastPublish,
            },
          };
          res.json(body);
        });
        router.get('/policy', async (_req, res) => {
          res.type('text/plain').send(policyText(await current()));
        });
        router.get('/report', async (_req, res) => {
          res.type('text/markdown').send(reportMarkdown(await current()));
        });
        httpRouter.use(router);

        if (!target) return;
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
            const analysis = await current(0);
            const { match, broad, grants } = analysis.summary;
            const result = await publishPolicy(
              github,
              target,
              {
                policyText: policyText(analysis),
                title: `feat(tailscale): ${grants} grants from the catalog (${match} match, ${broad} broad, ${analysis.summary.new} new)`,
                body: reportMarkdown(analysis),
              },
              logger,
            );
            lastPublish = {
              at: new Date().toISOString(),
              outcome: result.outcome,
              url: 'url' in result ? result.url : undefined,
            };
            logger.info(
              `tailnet policy: ${result.outcome}${
                'url' in result ? ` ${result.url}` : ''
              }`,
              analysis.summary,
            );
          },
        });
      },
    });
  },
});
