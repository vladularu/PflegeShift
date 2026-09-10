import { Text, View } from "react-native";

import { useCheckPreferences } from "./check-preferences";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { InlineNotice, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LabeledSwitch } from "@/ui/labeled-switch";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ScreenScrollView } from "@/ui/screen-layout";

export function CheckSettingsScreen() {
  const palette = usePalette();
  const { enabled, error, saving, save, retry } = useCheckPreferences();

  if (enabled === null)
    return error ? (
      <LoadFailureView message={error} onRetry={retry} />
    ) : (
      <LoadingView label="Prüfungseinstellungen werden geladen …" />
    );

  return (
    <ScreenScrollView surface="groupedBackground">
      <InlineNotice message="Deine Auswahl gilt für Monats- und Jahresauswertung sowie die Prüfungsdetails. Gesetzliche Hinweise bleiben immer sichtbar." />
      <SectionHeader title="Gesetzliche Prüfung" />
      <SurfaceCard>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ ...TYPOGRAPHY.body, color: palette.text, padding: SPACING.md }}
        >
          Gesetzliche Hinweise bleiben unabhängig von dieser Auswahl sichtbar. Die Prüfung und die
          Gehaltsberechnung werden hier nicht verändert.
        </Text>
      </SurfaceCard>
      <SectionHeader title="Freiwillige Planung" />
      <SurfaceCard>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.md,
            padding: SPACING.md,
          }}
        >
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ ...TYPOGRAPHY.body, color: palette.text, flex: 1 }}
          >
            Planungshinweise
          </Text>
          <LabeledSwitch
            label="Planungshinweise"
            value={enabled}
            disabled={saving}
            onValueChange={(value) => void save(value)}
          />
        </View>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{
            ...TYPOGRAPHY.body,
            color: palette.textMuted,
            padding: SPACING.md,
            paddingTop: 0,
          }}
        >
          Zum Beispiel Hinweise zu Dienstfolgen, Nachtserien und aufeinanderfolgenden Wochenenden.
          Dies sind keine eigenständigen gesetzlichen Verstöße.
        </Text>
      </SurfaceCard>
      <Text
        accessibilityLiveRegion="polite"
        style={{ ...TYPOGRAPHY.body, color: palette.textMuted }}
      >
        {error
          ? "Die bisherige Auswahl bleibt erhalten."
          : saving
            ? "Wird gespeichert …"
            : "Auswahl gespeichert."}
      </Text>
      {error ? <InlineNotice message={error} /> : null}
    </ScreenScrollView>
  );
}
