import { Text, View } from "react-native";

import { useCheckPreferences } from "./check-preferences";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { InlineNotice, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LabeledSwitch } from "@/ui/labeled-switch";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ScreenScrollView } from "@/ui/screen-layout";
import { InfoDisclosure } from "@/ui/info-disclosure";

export function CheckSettingsScreen() {
  const palette = usePalette();
  const { enabled, youthEnabled, error, saving, save, saveYouth, retry } = useCheckPreferences();

  if (enabled === null || youthEnabled === null)
    return error ? (
      <LoadFailureView message={error} onRetry={retry} />
    ) : (
      <LoadingView label="Prüfungseinstellungen werden geladen …" />
    );

  return (
    <ScreenScrollView surface="groupedBackground">
      <InlineNotice message="Gesetzliche Hinweise bleiben immer sichtbar." />
      <SectionHeader title="Gesetzliche Prüfung" />
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
            Jugendlichenprüfung
          </Text>
          <LabeledSwitch
            label="Jugendlichenprüfung"
            value={youthEnabled}
            disabled={saving}
            onValueChange={(value) => void saveYouth(value)}
          />
        </View>
        <View style={{ padding: SPACING.md, paddingTop: 0 }}>
          <InfoDisclosure
            summary="Für 15–17-Jährige ohne Vollzeitschulpflicht."
            details="Prüft die erfassten Dienstzeiten nach dem Jugendarbeitsschutzgesetz."
            label="Über die Jugendlichenprüfung"
          />
        </View>
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
        <View style={{ padding: SPACING.md, paddingTop: 0 }}>
          <InfoDisclosure
            summary="Dienstfolgen, Nächte, Wochenenden – freiwillige Hinweise."
            details="Zum Beispiel Hinweise zu Dienstfolgen, Nachtserien und aufeinanderfolgenden Wochenenden. Dies sind keine eigenständigen gesetzlichen Verstöße."
            label="Über die Planungshinweise"
          />
        </View>
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
