import { Text, View } from "react-native";

import type { TrainingTimeDay } from "@/engine/youth-types";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { SurfaceCard } from "@/ui/design-system";
import { checkDate } from "./compliance-issue-content";

function timeLabel(minutes: number | null): string {
  if (minutes === null) return "Nicht berechenbar";
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
}

function basisLabel(basis: TrainingTimeDay["basis"]): string {
  switch (basis) {
    case "JARBSCHG":
      return "JArbSchG · anrechenbare Zeit einschließlich Dienst";
    case "BBIG":
      return "BBiG · anrechenbare Zeit einschließlich Dienst";
    case "PFLBG":
      return "PflBG · dokumentierte Teilnahme, keine BBiG-Pauschale";
    case "UNKNOWN":
      return "Ausbildungsgrundlage ungeklärt";
  }
}

export function TrainingTimeCard({ days }: { readonly days: readonly TrainingTimeDay[] }) {
  const palette = usePalette();
  if (!days.length) return null;
  return (
    <SurfaceCard style={{ padding: SPACING.md, gap: SPACING.md }}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
      >
        Ausbildungszeit
      </Text>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
      >
        Rechtliche Prüfwerte für Schul- und Prüfungstage. Sie werden nicht zusätzlich zu Ist-Zeit,
        Zeitsaldo oder Gehalt gezählt.
      </Text>
      {days.map((day) => (
        <View
          key={day.date}
          style={{ borderTopWidth: 1, borderTopColor: palette.separator, paddingTop: SPACING.sm }}
        >
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.text, ...TYPOGRAPHY.label }}
          >
            {checkDate(day.date, false)} · {timeLabel(day.minutes)}
          </Text>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
          >
            {basisLabel(day.basis)}
          </Text>
        </View>
      ))}
    </SurfaceCard>
  );
}
