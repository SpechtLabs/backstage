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
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import MoneyIcon from '@material-ui/icons/MonetizationOn';
import { SidebarSearchModal } from '@backstage/plugin-search';
import { UserSettingsSignInAvatar } from '@backstage/plugin-user-settings';
import { NotificationsSidebarItem } from '@backstage/plugin-notifications';

/**
 * The sidebar, top to bottom:
 *
 *   Search
 *   Home, Catalog, APIs, Create, Catalog Graph   the catalog
 *   Tailscale, Docs, Tech Insights               about what is in it
 *   Explore, Tech Radar                          around it
 *   OpenCost
 *   (space)
 *   Notifications, DevTools, Visualizer,
 *   Entity Validation, Unprocessed               running Backstage
 *   Settings
 *
 * Pages are placed by their nav item's id, page:<plugin id>. A page this
 * doesn't place still shows up, after OpenCost.
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
      // Placed by hand below, with its own icon.
      nav.take('page:catalog-unprocessed-entities');

      return (
        <Sidebar>
          <SidebarLogo />
          <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
            <SidebarSearchModal />
          </SidebarGroup>
          <Divider />
          <SidebarGroup label="Menu" icon={<MenuIcon />}>
            <SidebarScrollWrapper>
              {nav.take('page:home')}
              {nav.take('page:catalog')}
              {nav.take('page:api-docs')}
              {nav.take('page:scaffolder')}
              {nav.take('page:catalog-graph')}
              <Divider />
              {nav.take('page:tailscale')}
              {nav.take('page:techdocs')}
              {nav.take('page:tech-insights')}
              <Divider />
              {nav.take('page:explore')}
              {nav.take('page:tech-radar')}
              <Divider />
              {/* Converted from the classic frontend: no nav item of its own. */}
              <SidebarItem
                icon={() => <MoneyIcon />}
                to="/opencost"
                text="OpenCost"
              />
              {nav.rest({ sortBy: 'title' })}
            </SidebarScrollWrapper>
          </SidebarGroup>
          <SidebarSpace />
          <Divider />
          <NotificationsSidebarItem />
          {nav.take('page:devtools')}
          {nav.take('page:app-visualizer')}
          {nav.take('page:entity-validation')}
          <SidebarItem
            icon={() => <ErrorOutlineIcon />}
            to="/catalog-unprocessed-entities"
            text="Unprocessed"
          />
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
