import {
  ApiBlueprint,
  PageBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { EntityCardBlueprint } from '@backstage/plugin-catalog-react/alpha';
import VpnLockIcon from '@material-ui/icons/VpnLock';
import { TailnetPolicyClient, tailnetPolicyApiRef } from './api';
import { rootRouteRef } from './routes';

/**
 * The tailnet policy the catalog renders to (packages/backend's
 * tailnetPolicy plugin): a page with all of it at /tailnet-policy, and a
 * card on Component, API, Resource and TailscaleGrant pages with the
 * grants that entity causes or carries.
 */
export const tailnetPolicyPlugin = createFrontendPlugin({
  pluginId: 'tailnet-policy',
  routes: { root: rootRouteRef },
  extensions: [
    ApiBlueprint.make({
      params: defineParams =>
        defineParams({
          api: tailnetPolicyApiRef,
          deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
          factory: deps => new TailnetPolicyClient(deps),
        }),
    }),
    PageBlueprint.make({
      params: {
        path: '/tailnet-policy',
        title: 'Tailnet policy',
        icon: <VpnLockIcon />,
        routeRef: rootRouteRef,
        loader: () =>
          import('./components/TailnetPolicyPage').then(m => (
            <m.TailnetPolicyPage />
          )),
      },
    }),
    EntityCardBlueprint.make({
      name: 'tailnet-policy',
      params: {
        type: 'content',
        // The card renders nothing for entities off the tailnet.
        filter: entity =>
          ['component', 'api', 'resource', 'tailscalegrant'].includes(
            entity.kind.toLowerCase(),
          ),
        loader: () =>
          import('./components/EntityTailnetPolicyCard').then(m => (
            <m.EntityTailnetPolicyCard />
          )),
      },
    }),
  ],
});
