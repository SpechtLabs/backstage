import {
  convertLegacyPageExtension,
  convertLegacyPlugin,
} from '@backstage/core-compat-api';
import {
  OpenCostPage,
  openCostPlugin as legacyOpenCostPlugin,
} from '@backstage-community/plugin-opencost';

/**
 * OpenCost (cost per workload), converted by hand: the installed
 * @backstage-community/plugin-opencost (0.25.0) is classic-frontend only.
 * 0.25.1 adds a new-frontend export, but it is younger than .yarnrc.yml's
 * npmMinimalAgeGate. The package is excluded from feature discovery
 * (app.packages in app-config.yaml), so a later version's own `opencost`
 * plugin can't clash with this one; switch over by deleting this module,
 * the exclusion and the sidebar link (modules/nav/Sidebar.tsx).
 *
 * The page reads opencost.baseUrl: the proxy to the in-cluster OpenCost API.
 */
export const openCostPlugin = convertLegacyPlugin(legacyOpenCostPlugin, {
  extensions: [convertLegacyPageExtension(OpenCostPage, { path: '/opencost' })],
});
