/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

import { createBackend } from '@backstage/backend-defaults';
import { authModuleTsidpProvider } from './modules/tsidpAuth';
import { techInsightsModuleSpechtLabs } from './modules/techInsights';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));

// scaffolder plugin
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(
  import('@backstage/plugin-scaffolder-backend-module-notifications'),
);

// techdocs plugin
backend.add(import('@backstage/plugin-techdocs-backend'));
// TechDocs editor: edit docs in the browser, submitted as a pull request
// through the GitHub integration. /alpha registers its GitHub provider.
backend.add(import('@estehsaan/backstage-plugin-techdocs-editor-backend'));
backend.add(
  import('@estehsaan/backstage-plugin-techdocs-editor-backend/alpha'),
);

// devtools: backend info, the merged config and scheduled tasks, under /devtools.
backend.add(import('@backstage/plugin-devtools-backend'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
// Guest sign-in, for local `yarn start` only: the guest provider refuses to
// run outside auth.environment `development`.
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// See https://backstage.io/docs/auth/guest/provider
// tsidp (Tailscale's OIDC IdP): auth.providers.oidc in app-config. The stock
// oidc module with tsidp's email trusted, see ./modules/tsidpAuth.
backend.add(authModuleTsidpProvider);
// GitHub, not for sign-in: the user's GitHub token for the GitHub insights
// and pull requests cards (auth.providers.github, in the cluster config).
backend.add(import('@backstage/plugin-auth-backend-module-github-provider'));

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// GitHub discovery: catalog-info.yaml from every SpechtLabs repo
// (catalog.providers.github, set by the cluster config along with the GitHub
// App credentials; without that config it registers no provider).
backend.add(import('@backstage/plugin-catalog-backend-module-github'));

// Unprocessed entities: why a catalog-info.yaml didn't make it into the
// catalog (the frontend page reads this).
backend.add(import('@backstage/plugin-catalog-backend-module-unprocessed'));

// Tech Insights: facts about entities and the scorecard checks over them
// (techInsights in app-config.yaml). The jsonfc module evaluates the checks;
// spechtLabsFactRetriever adds facts about SpechtLabs conventions.
backend.add(import('@backstage-community/plugin-tech-insights-backend'));
backend.add(
  import('@backstage-community/plugin-tech-insights-backend-module-jsonfc'),
);
backend.add(techInsightsModuleSpechtLabs);

// Tech Radar: tech-radar.json in this repo, read from GitHub (techRadar.url).
backend.add(import('@backstage-community/plugin-tech-radar-backend'));

// Explore: the tools in explore.tools, next to the catalog's domains/systems.
backend.add(import('@backstage-community/plugin-explore-backend'));

// permission plugin
backend.add(import('@backstage/plugin-permission-backend'));
// See https://backstage.io/docs/permissions/getting-started for how to create your own permission policy
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search engine
// See https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// kubernetes plugin
backend.add(import('@backstage/plugin-kubernetes-backend'));

// user settings plugin
backend.add(import('@backstage/plugin-user-settings-backend'));

// notifications and signals plugins
backend.add(import('@backstage/plugin-notifications-backend'));
backend.add(import('@backstage/plugin-signals-backend'));

// mcp actions plugin
backend.add(import('@backstage/plugin-mcp-actions-backend'));

// tailnet policy from the catalog's dependency graph (shadow mode)
backend.add(import('./plugins/tailnetPolicy'));

backend.start();
