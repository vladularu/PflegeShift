const LIGHT_TEXT = "#FFFFFF";
const MINIMUM_CHIP_CONTRAST = 4.5;

function expandHex(value: string): string | null {
  const normalized = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return normalized.split("").map((character) => `${character}${character}`).join("");
  }
  return /^[0-9a-f]{6}$/i.test(normalized) ? normalized : null;
}

function relativeLuminance(color: string): number | null {
  const hex = expandHex(color);
  if (hex === null) return null;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
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
    const candidate = formatHex(
      channels[0] * factor,
      channels[1] * factor,
      channels[2] * factor,
    );
    const candidateLuminance = relativeLuminance(candidate);
    if (
      candidateLuminance !== null &&
      contrastRatio(candidateLuminance, light) >= MINIMUM_CHIP_CONTRAST
    ) {
      return candidate;
    }
  }

  return formatHex(channels[0] * 0.45, channels[1] * 0.45, channels[2] * 0.45);
}
