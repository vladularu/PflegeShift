import type { ShiftType } from "@/domain/types";

export const SHIFT_SYMBOLS = [
  { id: "coff", label: "Pause", icon: "coffee" },
  { id: "rise", label: "Sonnenaufgang", icon: "weather-sunset-up" },
  { id: "sun", label: "Sonne", icon: "white-balance-sunny" },
  { id: "moon", label: "Mond", icon: "weather-night" },
  { id: "home", label: "Zuhause", icon: "home" },
  { id: "call", label: "Telefon", icon: "phone" },
  { id: "case", label: "Koffer", icon: "briefcase" },
  { id: "book", label: "Buch", icon: "book-open-variant" },
  { id: "list", label: "Aufgaben", icon: "clipboard-check" },
  { id: "team", label: "Team", icon: "account-multiple" },
  { id: "time", label: "Uhr", icon: "clock-outline" },
  { id: "med", label: "Arztkoffer", icon: "medical-bag" },
  { id: "ambu", label: "Rettungswagen", icon: "ambulance" },
  { id: "cash", label: "Geld", icon: "currency-eur" },
  { id: "palm", label: "Urlaub", icon: "palm-tree" },
  { id: "hosp", label: "Krankenhaus", icon: "hospital-box" },
  { id: "tool", label: "Werkzeug", icon: "wrench" },
  { id: "star", label: "Stern", icon: "star" },
  { id: "smil", label: "Smiley", icon: "emoticon-happy-outline" },
] as const;

export type ShiftSymbolId = (typeof SHIFT_SYMBOLS)[number]["id"];

const SYMBOLS_BY_ID = new Map(SHIFT_SYMBOLS.map((symbol) => [symbol.id, symbol]));

export const DEFAULT_SHIFT_SYMBOLS: Readonly<Record<ShiftType, ShiftSymbolId>> = {
  EARLY: "rise",
  LATE: "sun",
  NIGHT: "moon",
  DAY: "home",
  TRAINING: "book",
  VACATION: "palm",
  SICK: "med",
  FREE: "star",
  CUSTOM: "time",
};

export function shiftSymbolDefinition(value: string) {
  return SYMBOLS_BY_ID.get(value as ShiftSymbolId) ?? null;
}

export function isShiftSymbolId(value: string): value is ShiftSymbolId {
  return SYMBOLS_BY_ID.has(value as ShiftSymbolId);
}
