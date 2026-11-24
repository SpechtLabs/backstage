/**
 * SpechtLabs brand colours, as the SpechtLabs docs sites
 * (spechtlabs.github.io, sigil, ...) use them: the vuepress-theme-plume
 * palette (brand-1/2/3, backgrounds, text) and the four corner colours of
 * the woodpecker logo's gradient.
 *
 * Keep spechtlabs.css (the Backstage UI tokens) in step with these.
 */
export const brand = {
  logo: {
    teal: '#008080',
    brightTeal: '#00a2a2',
    blue: '#2862b8',
    navy: '#0a192f',
  },
  light: {
    brand1: '#5086a1',
    brand2: '#6aa1b7',
    brand3: '#8cccd5',
    brandSoft: 'rgba(131, 208, 218, 0.314)',
    bg: '#ffffff',
    bgAlt: '#f6f6f7',
    bgElv: '#ffffff',
    text1: 'rgb(60, 60, 67)',
    text2: 'rgba(60, 60, 67, 0.78)',
    text3: 'rgba(60, 60, 67, 0.56)',
    divider: '#e2e2e3',
  },
  dark: {
    brand1: '#8cccd5',
    brand2: '#6aa1b7',
    brand3: '#5086a1',
    brandSoft: 'rgba(131, 208, 218, 0.314)',
    bg: '#1b1b1f',
    bgAlt: '#161618',
    bgElv: '#202127',
    text1: 'rgba(255, 255, 245, 0.86)',
    text2: 'rgba(235, 235, 245, 0.6)',
    text3: 'rgba(235, 235, 245, 0.38)',
    divider: '#2e2e32',
  },
  font: "'Inter Variable', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  monoFont:
    "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
} as const;
