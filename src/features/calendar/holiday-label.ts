const HOLIDAY_SHORT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  "Neujahr": "Neujahr",
  "Heilige Drei Könige": "Hl. 3 Könige",
  "Internationaler Frauentag": "Frauentag",
  "Karfreitag": "Karfreitag",
  "Ostersonntag": "Ostersonntag",
  "Ostermontag": "Ostermontag",
  "Tag der Arbeit": "Tag d. Arbeit",
  "Christi Himmelfahrt": "Chr. Himm.",
  "Pfingstsonntag": "Pfingstso.",
  "Pfingstmontag": "Pfingstmo.",
  "Fronleichnam": "Fronleichnam",
  "Mariä Himmelfahrt": "Mariä Himm.",
  "Weltkindertag": "Weltkindertag",
  "Tag der Deutschen Einheit": "Tag d. Einheit",
  "Reformationstag": "Reformation",
  "Allerheiligen": "Allerheiligen",
  "Buß- und Bettag": "Buß-/Bettag",
  "1. Weihnachtstag": "1. Weihn.",
  "2. Weihnachtstag": "2. Weihn.",
  "Tag der Befreiung": "Befreiung",
  "75. Jahrestag des Volksaufstands vom 17. Juni 1953": "Volksaufst.",
});

export function holidayShortLabel(name: string): string {
  const known = HOLIDAY_SHORT_NAMES[name];
  if (known) return known;
  if (name.length <= 12) return name;
  return `${name.slice(0, 10).trimEnd()}…`;
}
