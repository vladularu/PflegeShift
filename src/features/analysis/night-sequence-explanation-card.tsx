import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { CalendarEntry } from "@/domain/types";
import { explainNightSequence } from "@/features/analysis/night-sequence-explanation";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SurfaceCard } from "@/ui/design-system";

function dateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function Explanation({
  entries,
  month,
  timeZone,
}: {
  readonly entries: readonly CalendarEntry[];
  readonly month: string;
  readonly timeZone: string;
}) {
  const palette = usePalette();
  const result = useMemo(() => {
    try {
      return explainNightSequence(entries, month, timeZone);
    } catch {
      return null;
    }
  }, [entries, month, timeZone]);
  const lines = result
    ? [
        result.dates.length > 0
          ? `Eingetragene Dienste: ${result.dates.map(dateLabel).join(" · ")}. Zwei weitere Nachtdienste beginnen bis ${dateLabel(result.deadline!)}.`
          : "Die eingetragenen Dienste ergeben bisher keine eindeutige Folge. Fehlende oder noch geplante Dienste können die Einschätzung ändern.",
        "Die Pausendauer wird berücksichtigt. Eine genaue Pausenzeit musst du nicht eintragen; nur Grenzfälle bleiben offen.",
        ...(result.uncertain
          ? [
              "Einzelne Zeiten sind nicht eindeutig, überschneiden sich oder liegen nahe an der Nachtgrenze.",
            ]
          : []),
        ...(result.hasAbsence
          ? [
              "Urlaub oder Krankheit sind eingetragen. Daraus leiten wir hier keinen Wegfall der Zulage ab.",
            ]
          : []),
        "Dies erklärt nur die Nachtdienstfolge, nicht den vollständigen Monatsanspruch. Dein bisheriger Gehaltswert und eine manuelle Festlegung bleiben unverändert.",
      ]
    : [
        "Die Erklärung ist gerade nicht verfügbar. Dein Gehaltswert und deine Angaben bleiben unverändert.",
      ];
  return (
    <View style={{ padding: SPACING.lg, paddingTop: 0, gap: SPACING.sm }}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
      >
        {result?.title ?? "Einschätzung derzeit nicht verfügbar"}
      </Text>
      {lines.map((line) => (
        <Text
          key={line}
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

export function NightSequenceExplanationCard(props: {
  readonly entries: readonly CalendarEntry[];
  readonly month: string;
  readonly timeZone: string;
}) {
  const palette = usePalette();
  const [expanded, setExpanded] = useState(false);
  return (
    <SurfaceCard>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Einschätzung erklären"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => ({
          minHeight: 56,
          padding: SPACING.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ flex: 1, color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          Einschätzung erklären
        </Text>
        <Ionicons
          accessibilityElementsHidden
          name={expanded ? "chevron-up" : "chevron-down"}
          color={palette.textMuted}
          size={20}
        />
      </Pressable>
      {expanded ? <Explanation {...props} /> : null}
    </SurfaceCard>
  );
}
