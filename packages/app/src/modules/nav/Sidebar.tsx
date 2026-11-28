import {
  Sidebar,
  SidebarGroup,
  SidebarItem,
  SidebarScrollWrapper,
  SidebarSpace,
} from '@backstage/core-components';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { Divider } from './Divider';
import { SidebarLogo } from './SidebarLogo';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import { SidebarSearchModal } from '@backstage/plugin-search';
import { UserSettingsSignInAvatar } from '@backstage/plugin-user-settings';
import { NotificationsSidebarItem } from '@backstage/plugin-notifications';

/**
 * The sidebar, top to bottom:
 *
 *   Search
 *   Catalog, APIs                                the catalog
 *   Docs, Explore                                about what is in it
 *   Tailscale
 *   (space)
 *   Notifications, DevTools, Entity Validation   running Backstage
 *   Settings
 *
 * Pages are placed by their nav item's id, page:<plugin id>. A page this
 * doesn't place or skip still shows up, after Tailscale. Skipped pages keep
 * their routes, only their nav item goes.
 */
export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ navItems }) => {
      const nav = navItems.withComponent(item => (
        <SidebarItem icon={() => item.icon} to={item.href} text={item.title} />
      ));

      // Skipped items
      nav.take('page:search'); // Using search modal instead
      nav.take('page:notifications'); // Using NotificationsSidebarItem manually instead
      // Repos come in through GitHub discovery; registering by hand stays
      // reachable from the Create page.
      nav.take('page:catalog-import');
      // Not in the sidebar; the pages stay reachable by URL.
      nav.take('page:catalog-unprocessed-entities');
      nav.take('page:home');
      nav.take('page:scaffolder');
      nav.take('page:catalog-graph');
      nav.take('page:tech-insights');
      nav.take('page:app-visualizer');
      nav.take('page:tech-radar');

      return (
        <Sidebar>
          <SidebarLogo />
          <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
            <SidebarSearchModal />
          </SidebarGroup>
          <SidebarGroup label="Menu" icon={<MenuIcon />}>
            <SidebarScrollWrapper>
              <Divider />
              {nav.take('page:catalog')}
              {nav.take('page:api-docs')}
              <Divider />
              {nav.take('page:techdocs')}
              {nav.take('page:explore')}
              <Divider />
              {nav.take('page:tailscale')}
              <Divider />
              {nav.rest({ sortBy: 'title' })}
            </SidebarScrollWrapper>
          </SidebarGroup>
          <SidebarSpace />
          <Divider />
          <NotificationsSidebarItem />
          {nav.take('page:devtools')}
          {nav.take('page:entity-validation')}
          <Divider />
          <SidebarGroup
            label="Settings"
            icon={<UserSettingsSignInAvatar />}
            to="/settings"
          >
            {nav.take('page:user-settings')}
          </SidebarGroup>
        </Sidebar>
      );
    },
  },
});
