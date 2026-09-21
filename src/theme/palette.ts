import { useColorScheme } from "react-native";
import { useContext } from "react";
import { AppearanceContext } from "./appearance-context";
import { resolvePalette } from "./theme-catalog";

import type { Palette } from "@/theme/palette-values";

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
  return useResolvedPalette(false);
}

export function useInversePalette(): Palette {
  return useResolvedPalette(true);
}

function useResolvedPalette(inverse: boolean): Palette {
  const appearance = useContext(AppearanceContext);
  const system = useColorScheme();
  const mode = appearance?.mode ?? "system";
  const dark = (mode === "system" ? system : mode) === "dark";
  return resolvePalette(appearance?.themeId ?? "standard", inverse ? !dark : dark);
}
