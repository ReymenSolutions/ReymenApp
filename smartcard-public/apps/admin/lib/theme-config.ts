// Reexporta desde `packages/lib` (Fase 11): la whitelist de tokens de theme
// pasó a vivir ahí porque, desde esa fase, apps/public también la necesita
// para resolver qué pintar de verdad -- tenerla duplicada en dos apps es
// justo el tipo de cosa que se desincroniza con el tiempo. Este archivo se
// queda solo para no tener que tocar los imports de `/settings` de Fase 10.
export {
  LAYOUT_OPTIONS,
  BORDER_RADIUS_OPTIONS,
  FONT_OPTIONS,
  parseThemeConfig,
  buildThemeConfig,
  type ThemeConfigFields,
} from '@reymen/lib/theme-tokens'
