import {
  createUnifiedTheme,
  pageTheme as defaultPageThemes,
  palettes,
  type PageTheme,
  type UnifiedThemeOptions,
} from '@backstage/theme';
import { brand } from './brand';

type Mode = 'light' | 'dark';

/**
 * Page headers: flat, with a faint wash of the logo's teal-to-blue gradient
 * instead of Backstage's coloured wave shapes. One look for every page type.
 */
function flatPageTheme(mode: Mode): PageTheme {
  const c = brand[mode];
  const strength = mode === 'light' ? [0.1, 0.07] : [0.16, 0.12];
  return {
    colors: [brand.logo.teal, brand.logo.blue],
    shape: 'none',
    backgroundImage: `linear-gradient(105deg, rgba(0, 128, 128, ${strength[0]}) 0%, rgba(40, 98, 184, ${strength[1]}) 55%, transparent 100%)`,
    fontColor: c.text1,
  };
}

function palette(mode: Mode): UnifiedThemeOptions['palette'] {
  const c = brand[mode];
  const base = mode === 'light' ? palettes.light : palettes.dark;
  const hover =
    mode === 'light' ? 'rgba(80, 134, 161, 0.08)' : 'rgba(140, 204, 213, 0.08)';
  return {
    ...base,
    primary: {
      main: c.brand1,
      light: c.brand3,
      dark: mode === 'light' ? '#3e6d85' : c.brand2,
      contrastText: mode === 'light' ? '#ffffff' : brand.logo.navy,
    },
    secondary: { main: brand.logo.blue },
    background: { default: c.bgAlt, paper: c.bgElv },
    text: { primary: c.text1, secondary: c.text2 },
    divider: c.divider,
    border: c.divider,
    textSubtle: c.text2,
    textVerySubtle: c.text3,
    link: c.brand1,
    linkHover: c.brand2,
    highlight: c.brandSoft,
    navigation: {
      background: mode === 'light' ? c.bg : c.bgAlt,
      indicator: c.brand1,
      color: c.text2,
      selectedColor: c.brand1,
      navItem: { hoverBackground: hover },
      submenu: { background: c.bgElv },
    },
    tabbar: { indicator: c.brand1 },
  } as UnifiedThemeOptions['palette'];
}

function components(mode: Mode): UnifiedThemeOptions['components'] {
  const c = brand[mode];
  const border = `1px solid ${c.divider}`;
  // Backstage's own components (BackstageHeader, ...) take overrides here
  // too, but the MUI v5 typings only know the Mui* names.
  const overrides: Record<string, { styleOverrides: Record<string, object> }> =
    {
      // Borders instead of shadows, rounder corners: the docs sites' look.
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          rounded: { borderRadius: 12 },
          elevation1: { boxShadow: 'none', border },
          elevation2: { boxShadow: 'none', border },
        },
      },
      MuiCard: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', borderRadius: 8, fontWeight: 600 },
          contained: { boxShadow: 'none' },
        },
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 500 } },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 6 } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8 } } },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 600 },
          root: { borderColor: c.divider },
        },
      },
      BackstageHeader: {
        styleOverrides: {
          header: {
            boxShadow: 'none',
            borderBottom: border,
            padding: '24px 32px',
          },
          title: { fontWeight: 700, letterSpacing: '-0.02em' },
          type: { textTransform: 'none', letterSpacing: 0, opacity: 0.75 },
        },
      },
      BackstageHeaderTabs: {
        styleOverrides: {
          tabsWrapper: {
            backgroundColor: c.bgElv,
            borderBottom: border,
            boxShadow: 'none',
            paddingLeft: 16,
          },
          defaultTab: { textTransform: 'none', fontSize: 14, fontWeight: 500 },
        },
      },
      BackstageInfoCard: {
        styleOverrides: { headerTitle: { fontWeight: 600 } },
      },
      BackstageSidebar: { styleOverrides: { drawer: { borderRight: border } } },
      // The catalog's Personal / SpechtLabs filter: a grey block
      // (rgba(0, 0, 0, .11)) upstream; a bordered panel here.
      CatalogReactUserListPicker: {
        styleOverrides: {
          root: {
            backgroundColor: c.bgElv,
            border,
            borderRadius: 12,
            boxShadow: 'none',
            margin: '8px 0',
          },
        },
      },
      // Template and Explore cards: the logo's gradient.
      BackstageItemCardHeader: {
        styleOverrides: {
          root: {
            backgroundImage: `linear-gradient(135deg, ${brand.logo.teal} 0%, ${brand.logo.blue} 100%)`,
          },
        },
      },
    };
  return overrides as UnifiedThemeOptions['components'];
}

function theme(mode: Mode) {
  const flat = flatPageTheme(mode);
  return createUnifiedTheme({
    palette: palette(mode),
    fontFamily: brand.font,
    defaultPageTheme: 'home',
    pageTheme: Object.fromEntries(
      Object.keys(defaultPageThemes).map(key => [key, flat]),
    ),
    components: components(mode),
  });
}

export const spechtLabsLight = theme('light');
export const spechtLabsDark = theme('dark');
