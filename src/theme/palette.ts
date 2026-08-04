import { useColorScheme } from "react-native";

import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from "@/theme/palette-values";

export {
  APPOINTMENT_COLOR,
  DEFAULT_TEMPLATE_COLOR,
  HOLIDAY_COLOR,
  SHIFT_COLORS,
  SHIFT_COLOR_PAIRS,
  SHIFT_TYPE_COLORS,
} from "@/theme/shift-colors";
export { DARK_PALETTE, LIGHT_PALETTE, type Palette } from "@/theme/palette-values";

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
}
