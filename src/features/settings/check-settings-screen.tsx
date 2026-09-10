import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import {
  loadPlanningHintsPreference,
  savePlanningHintsPreference,
} from "@/infrastructure/database/preferences-repository";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { InlineNotice, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LabeledSwitch } from "@/ui/labeled-switch";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ScreenScrollView } from "@/ui/screen-layout";

export function CheckSettingsScreen() {
  const db = useSQLiteContext();
  const palette = usePalette();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    setError(null);
    void loadPlanningHintsPreference(db).then(
      (value) => {
        if (active) setEnabled(value);
      },
      () => {
        if (active) setError("Prüfungseinstellungen konnten nicht geladen werden.");
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [db, retry]);

  async function save(value: boolean) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await savePlanningHintsPreference(db, value);
      if (mounted.current) setEnabled(value);
    } catch {
      if (mounted.current) setError("Nicht gespeichert. Bitte betätige den Schalter erneut.");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  if (enabled === null)
    return error ? (
      <LoadFailureView message={error} onRetry={() => setRetry((value) => value + 1)} />
    ) : (
      <LoadingView label="Prüfungseinstellungen werden geladen …" />
    );

  return (
    <ScreenScrollView surface="groupedBackground">
      <InlineNotice message="Vorbereitung: Deine Auswahl wird gespeichert. Die Auswertung berücksichtigt sie erst mit dem nächsten Teil von Arbeitspaket 9G. Bis dahin bleiben alle bisherigen Hinweise sichtbar." />
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
            : "Auswahl gespeichert · Wirkung in der Auswertung folgt mit 9G-B."}
      </Text>
      {error ? <InlineNotice message={error} /> : null}
    </ScreenScrollView>
  );
}
