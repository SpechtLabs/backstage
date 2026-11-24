import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { ThemeBlueprint } from '@backstage/plugin-app-react';
import { UnifiedThemeProvider } from '@backstage/theme';
import LightIcon from '@material-ui/icons/WbSunny';
import DarkIcon from '@material-ui/icons/Brightness2';
import { spechtLabsDark, spechtLabsLight } from './themes';

/**
 * The SpechtLabs light and dark themes. Named `light` and `dark` so they
 * replace the app plugin's default themes (theme:app/light, theme:app/dark)
 * and keep their ids, which public/theme.js and stored choices rely on.
 * The Backstage UI tokens are in spechtlabs.css, imported in index.tsx.
 */
const light = ThemeBlueprint.make({
  name: 'light',
  params: {
    theme: {
      id: 'light',
      title: 'SpechtLabs Light',
      variant: 'light',
      icon: <LightIcon />,
      Provider: ({ children }) => (
        <UnifiedThemeProvider theme={spechtLabsLight} children={children} />
      ),
    },
  },
});

const dark = ThemeBlueprint.make({
  name: 'dark',
  params: {
    theme: {
      id: 'dark',
      title: 'SpechtLabs Dark',
      variant: 'dark',
      icon: <DarkIcon />,
      Provider: ({ children }) => (
        <UnifiedThemeProvider theme={spechtLabsDark} children={children} />
      ),
    },
  },
});

export const themeModule = createFrontendModule({
  pluginId: 'app',
  extensions: [light, dark],
});
