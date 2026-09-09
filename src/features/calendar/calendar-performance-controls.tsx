import { File, Paths } from "expo-file-system";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Platform } from "react-native";
import { calendarPerformance } from "@/application/calendar-performance";
import { DEV_TOOLS_AVAILABLE } from "@/infrastructure/dev-tools-policy";
import { RowButton, SurfaceCard } from "@/ui/design-system";
import { shareCalendarPerformanceFile } from "./share-calendar-performance";

export function CalendarPerformanceControls() {
  const session = useSyncExternalStore(
    calendarPerformance.subscribe,
    calendarPerformance.getSnapshot,
    () => 0,
  );
  const [busy, setBusy] = useState(false);
  const sharing = useRef(false);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(calendarPerformance.stop, 600_000);
    return () => clearTimeout(timer);
  }, [session]);
  if (!DEV_TOOLS_AVAILABLE || Platform.OS !== "ios") return null;
  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    setBusy(true);
    calendarPerformance.stop();
    try {
      const report = JSON.stringify(
        {
          ...calendarPerformance.report(),
          updateId: Updates.updateId,
          runtime: Updates.runtimeVersion,
          embedded: Updates.isEmbeddedLaunch,
          appVersion: Constants.expoConfig?.version,
          os: Platform.Version,
        },
        null,
        2,
      );
      const file = new File(Paths.cache, `LUNA-Kalender-Diagnose-${Date.now()}.json`);
      await shareCalendarPerformanceFile(report, file);
    } catch {
      Alert.alert(
        "Diagnose nicht geteilt",
        "Die Datei konnte nicht erstellt, geteilt oder bereinigt werden. Der Bericht bleibt bis zum App-Neustart im Speicher. Bitte erneut versuchen.",
      );
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  };
  return (
    <SurfaceCard>
      <RowButton
        title="Kalender-Prototyp öffnen"
        subtitle="Phase 2: neue Animation mit Beispieldiensten. Der Hauptkalender und deine Daten bleiben unverändert."
        onPress={() => router.push("/calendar-prototype")}
      />
      <RowButton
        title={session ? "Kalenderdiagnose läuft – stoppen" : "Kalenderdiagnose starten"}
        subtitle="Nur lokale Zeiten und Anzahlen, keine Titel oder Gehälter. Maximal 10 Minuten; Neustart löscht den Bericht. Ein neuer Start ersetzt die vorige Messung."
        onPress={() =>
          session ? calendarPerformance.stop() : calendarPerformance.start(DEV_TOOLS_AVAILABLE)
        }
      />
      <RowButton
        title={busy ? "Diagnose wird geteilt …" : "Diagnosebericht teilen"}
        subtitle="Stoppt die Messung und öffnet das Teilen-Menü für eine JSON-Datei."
        onPress={() => {
          void share();
        }}
      />
      <RowButton title="Diagnosebericht verwerfen" onPress={calendarPerformance.clear} />
    </SurfaceCard>
  );
}
