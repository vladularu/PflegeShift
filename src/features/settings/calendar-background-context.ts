import { createContext, useContext } from "react";
import { Platform } from "react-native";
import {
  DEFAULT_CALENDAR_IMAGE_STRENGTH,
  type CalendarImageStrength,
} from "@/theme/calendar-image";
interface CalendarBackgroundValue {
  readonly uri: string | null;
  readonly strength: CalendarImageStrength;
  readonly setStrength: (strength: CalendarImageStrength) => Promise<void>;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly supported: boolean;
  readonly choose: () => Promise<void>;
  readonly remove: () => Promise<void>;
  readonly canUndoRemoval: boolean;
  readonly undoRemove: () => Promise<void>;
  readonly reset: () => Promise<boolean>;
  readonly retry: () => void;
}
const EMPTY: CalendarBackgroundValue = {
  uri: null,
  strength: DEFAULT_CALENDAR_IMAGE_STRENGTH,
  setStrength: async () => {},
  ready: false,
  busy: false,
  error: null,
  supported: Platform.OS !== "web",
  choose: async () => {},
  remove: async () => {},
  canUndoRemoval: false,
  undoRemove: async () => {},
  reset: async () => false,
  retry: () => {},
};
export const CalendarBackgroundContext = createContext<CalendarBackgroundValue>(EMPTY);
export const useCalendarBackground = () => useContext(CalendarBackgroundContext);
