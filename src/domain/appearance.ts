export const THEME_IDS = ["standard", "mint", "lavender", "rose", "sea"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const APPEARANCE_MODES = ["light", "dark", "system"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];
export interface AppearancePreferences {
  readonly themeId: ThemeId;
  readonly mode: AppearanceMode;
}
export const DEFAULT_APPEARANCE: AppearancePreferences = Object.freeze({
  themeId: "standard",
  mode: "system",
});
export const APPEARANCE_KEYS = { themeId: "appearance_theme", mode: "appearance_mode" } as const;
export function isThemeId(value: unknown): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}
export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return APPEARANCE_MODES.includes(value as AppearanceMode);
}
