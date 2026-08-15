function channelToHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value * 255)))
    .toString(16)
    .padStart(2, "0");
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, saturation)) / 100;
  const l = Math.min(100, Math.max(0, lightness)) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = h / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const match = l - chroma / 2;
  return `#${channelToHex(red + match)}${channelToHex(green + match)}${channelToHex(blue + match)}`.toUpperCase();
}

const LIGHTNESS_STEPS = [97, 90, 81, 72, 63, 55, 47, 39, 31, 20] as const;
const COLOR_ROWS = [
  { hue: 0, saturation: 0 },
  { hue: 355, saturation: 82 },
  { hue: 338, saturation: 78 },
  { hue: 322, saturation: 76 },
  { hue: 288, saturation: 66 },
  { hue: 263, saturation: 58 },
  { hue: 233, saturation: 58 },
  { hue: 216, saturation: 64 },
  { hue: 202, saturation: 72 },
  { hue: 191, saturation: 70 },
  { hue: 176, saturation: 58 },
  { hue: 160, saturation: 54 },
  { hue: 132, saturation: 50 },
  { hue: 95, saturation: 58 },
  { hue: 62, saturation: 76 },
  { hue: 45, saturation: 92 },
  { hue: 28, saturation: 94 },
  { hue: 15, saturation: 35 },
] as const;

export const SHIFT_COLOR_GRID = Object.freeze(
  COLOR_ROWS.map((row) =>
    Object.freeze(LIGHTNESS_STEPS.map((lightness) => hslToHex(row.hue, row.saturation, lightness))),
  ),
);

const REFERENCE_COLORS = [
  "#4FCB68",
  "#F05C68",
  "#F2A93B",
  "#31A7C3",
  "#2F80ED",
  "#858A8E",
  "#F09A3E",
  "#D95F9A",
] as const;

export const SHIFT_COLOR_SWATCHES = Object.freeze([
  ...new Set([...REFERENCE_COLORS, ...SHIFT_COLOR_GRID.flat()]),
]);
