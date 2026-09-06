export const SPACING = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const RADII = {
  small: 10,
  control: 12,
  card: 20,
  sheet: 24,
  large: 24,
  pill: 999,
} as const;

export const MINIMUM_TOUCH_TARGET = 44;

export const CONTROL_HEIGHT = {
  compact: MINIMUM_TOUCH_TARGET,
  regular: 48,
  large: 52,
} as const;

export const SCREEN_LAYOUT = {
  horizontalPadding: SPACING.xl,
  contentTopPadding: SPACING.md,
  contentBottomPadding: 48,
  contentGap: SPACING.xxl,
  sectionGap: SPACING.xl,
  headerMinHeight: 84,
  headerTopPadding: SPACING.sm,
  headerBottomPadding: SPACING.lg,
  headerAccessoryStackFontScale: 1.6,
} as const;

export const SHADOWS = {
  card: "0 1px 2px rgba(22, 34, 30, 0.04)",
  raised: "0 8px 24px rgba(22, 34, 30, 0.08)",
  overlay: "0 18px 42px rgba(12, 20, 17, 0.16)",
} as const;

export const CALENDAR_METRICS = {
  horizontalInset: 0,
  weekdayHeight: 30,
  weekdayFontSize: 12,
  weekNumberFontSize: 9,
  weekNumberInset: 1,
  dayNumberHeight: 38,
  dayNumberFontSize: 17,
  weekRowHeight: 118,
  entryRowHeight: 17,
  entryFontSize: 12,
  entryLineHeight: 15,
  cardRadius: 22,
  floatingActionSize: 40,
} as const;
