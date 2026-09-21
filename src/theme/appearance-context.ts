import { createContext } from "react";
import type { AppearanceMode, AppearancePreferences, ThemeId } from "@/domain/appearance";
export interface AppearanceValue extends AppearancePreferences {
  readonly ready: boolean;
  readonly error: string | null;
  readonly saving: boolean;
  readonly setTheme: (themeId: ThemeId) => void;
  readonly setMode: (mode: AppearanceMode) => void;
  readonly retry: () => void;
  readonly reset: () => void;
}
export const AppearanceContext = createContext<AppearanceValue | null>(null);
