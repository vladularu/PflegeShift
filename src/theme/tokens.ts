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
  large: 24,
  pill: 999,
} as const;

export const CONTROL_HEIGHT = {
  compact: 44,
  regular: 48,
  large: 52,
} as const;

export const SHADOWS = {
  card: "0 1px 2px rgba(22, 34, 30, 0.04)",
  raised: "0 8px 24px rgba(22, 34, 30, 0.08)",
  overlay: "0 18px 42px rgba(12, 20, 17, 0.16)",
} as const;

export const CALENDAR_METRICS = {
  horizontalInset: 6,
  weekdayHeight: 28,
  weekdayFontSize: 15,
  weekNumberFontSize: 9,
  weekNumberInset: 1,
  dayNumberHeight: 28,
  dayNumberFontSize: 15,
  weekRowHeight: 114,
  entryRowHeight: 19,
  entryFontSize: 12,
  entryLineHeight: 16,
  cardRadius: 22,
  floatingActionSize: 40,
} as const;
