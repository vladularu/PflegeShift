const LIGHT_TEXT = "#FFFFFF";
const DARK_TEXT = "#171719";
export const MINIMUM_TEXT_CONTRAST = 4.5;
export const MINIMUM_UI_CONTRAST = 3;

function expandHex(value: string): string | null {
  const normalized = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return normalized
      .split("")
      .map((character) => `${character}${character}`)
      .join("");
  }
  return /^[0-9a-f]{6}$/i.test(normalized) ? normalized : null;
}

export function relativeLuminance(color: string): number | null {
  const hex = expandHex(color);
  if (hex === null) return null;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function luminanceContrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function colorContrastRatio(
  foregroundColor: string,
  backgroundColor: string,
): number | null {
  const foreground = relativeLuminance(foregroundColor);
  const background = relativeLuminance(backgroundColor);
  if (foreground === null || background === null) return null;
  return luminanceContrastRatio(foreground, background);
}

function mixHexColors(color: string, target: string, targetWeight: number): string {
  const sourceHex = expandHex(color);
  const targetHex = expandHex(target);
  if (sourceHex === null || targetHex === null) return color;
  const weight = Math.min(1, Math.max(0, targetWeight));
  const channels = [0, 2, 4].map((offset) => {
    const source = Number.parseInt(sourceHex.slice(offset, offset + 2), 16);
    const destination = Number.parseInt(targetHex.slice(offset, offset + 2), 16);
    return source * (1 - weight) + destination * weight;
  });
  return formatHex(channels[0], channels[1], channels[2]);
}

export function readableTextColor(backgroundColor: string): string {
  const lightContrast = colorContrastRatio(LIGHT_TEXT, backgroundColor) ?? 0;
  const darkContrast = colorContrastRatio(DARK_TEXT, backgroundColor) ?? 0;
  return lightContrast >= darkContrast ? LIGHT_TEXT : DARK_TEXT;
}

export function calendarChipPalette(backgroundColor: string, dark: boolean) {
  const main = accessibleChipBackgroundColor(backgroundColor);
  const detail = mixHexColors(backgroundColor, dark ? "#000000" : "#FFFFFF", dark ? 0.62 : 0.72);
  return Object.freeze({
    main,
    detail,
    onMain: LIGHT_TEXT,
    onDetail: readableTextColor(detail),
  });
}

function formatHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export const chipTextColor = LIGHT_TEXT;

export function accessibleChipBackgroundColor(backgroundColor: string): string {
  const hex = expandHex(backgroundColor);
  if (hex === null) return backgroundColor;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const light = relativeLuminance(LIGHT_TEXT) ?? 1;

  for (let factor = 1; factor >= 0.45; factor -= 0.025) {
    const candidate = formatHex(channels[0] * factor, channels[1] * factor, channels[2] * factor);
    const candidateLuminance = relativeLuminance(candidate);
    if (
      candidateLuminance !== null &&
      luminanceContrastRatio(candidateLuminance, light) >= MINIMUM_TEXT_CONTRAST
    ) {
      return candidate;
    }
  }

  return formatHex(channels[0] * 0.45, channels[1] * 0.45, channels[2] * 0.45);
}
