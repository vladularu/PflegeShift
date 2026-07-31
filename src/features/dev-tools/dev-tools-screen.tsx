import { Temporal } from "@js-temporal/polyfill";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import {
  useMediShiftProfile,
  useMediShiftStatus,
} from "@/application/medishift-provider";
import type {
  TestBackupSummary,
  TestRange,
  TestRunPreview,
  TestScenario,
} from "@/domain/types";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import {
  acceptTestRun,
  generateTestRun,
  isDeveloperModeEnabled,
  listTestBackups,
  previewTestRun,
  restoreTestBackup,
  setDeveloperMode,
} from "@/infrastructure/database/dev-tools-repository";
import { usePalette } from "@/theme/palette";
import { PrimaryButton, SegmentedButton } from "@/ui/form-controls";
import { LoadingView } from "@/ui/loading-view";

const SCENARIOS: readonly { key: TestScenario; title: string; detail: string }[] = [
  { key: "NORMAL_ROTATION", title: "Normalbetrieb", detail: "Realistische Rotation mit Urlaub und Terminen" },
  { key: "PREMIUM_MONTH", title: "Zuschläge", detail: "Nacht, Wochenende, Feiertag und Überstunden" },
  { key: "COMPLIANCE_CASES", title: "ArbZG-Fälle", detail: "Gezielte Verstöße und Belastungshinweise" },
  { key: "UI_STRESS", title: "UI-Stresstest", detail: "Rund 150 Einträge pro Monat" },
];

export function DevToolsScreen() {
  const db = useSQLiteContext();
  const palette = usePalette();
  const { ready, reload } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [range, setRange] = useState<TestRange>(1);
  const [scenario, setScenario] = useState<TestScenario>("NORMAL_ROTATION");
  const [preview, setPreview] = useState<TestRunPreview | null>(null);
  const [backups, setBackups] = useState<readonly TestBackupSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile) return;
    const [nextPreview, nextBackups] = await Promise.all([
      previewTestRun(db, { startMonth, range, scenario }, profile),
      listTestBackups(db),
    ]);
    setPreview(nextPreview);
    setBackups(nextBackups);
  }, [db, profile, range, scenario, startMonth]);

  useEffect(() => {
    void isDeveloperModeEnabled(db).then(setAllowed);
  }, [db]);
  useEffect(() => {
    if (allowed) void refresh();
  }, [allowed, refresh]);

  const backupGroups = useMemo(() => {
    const groups = new Map<string, TestBackupSummary[]>();
    backups.forEach((item) => groups.set(item.runId, [...(groups.get(item.runId) ?? []), item]));
    return [...groups.entries()];
  }, [backups]);

  if (allowed === null || !ready) return <LoadingView />;
  if (!allowed) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: palette.background, padding: 28 }}>
        <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900" }}>Testlabor gesperrt</Text>
        <Text style={{ color: palette.textMuted, textAlign: "center" }}>Aktiviere es unter Mehr durch langes Drücken auf „MediShift 0.1“.</Text>
        <PrimaryButton onPress={() => router.back()}>Schließen</PrimaryButton>
      </View>
    );
  }
  if (profile === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: palette.background, padding: 28 }}>
        <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900" }}>Profil erforderlich</Text>
        <Text style={{ color: palette.textMuted, textAlign: "center" }}>Schließe das Testlabor und richte MediShift zuerst ein.</Text>
        <PrimaryButton onPress={() => router.replace("/onboarding")}>Einrichtung öffnen</PrimaryButton>
      </View>
    );
  }

  function moveMonth(delta: number) {
    setStartMonth(Temporal.PlainYearMonth.from(startMonth).add({ months: delta }).toString());
    setMessage(null);
  }

  function confirmGenerate() {
    if (!preview) return;
    const planned = preview.plannedShiftCount + preview.plannedAppointmentCount;
    Alert.alert(
      "Monatsdaten ersetzen?",
      `${preview.months.length} Monat(e) · ${preview.existingEntryCount} vorhandene Einträge · ${planned} neue Einträge.\n\nDie Originaldaten werden automatisch gesichert.`,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Sichern & ersetzen", style: "destructive", onPress: () => void runGenerate() },
      ],
    );
  }

  async function runGenerate() {
    if (!profile) return;
    try {
      setBusy(true);
      const result = await generateTestRun(db, { startMonth, range, scenario }, profile);
      await reload();
      await refresh();
      setMessage(`${result.shiftCount + result.appointmentCount} Testeinträge erzeugt.`);
      if (process.env.EXPO_OS === "ios") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Testlauf fehlgeschlagen", error instanceof Error ? error.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  function confirmBackupAction(items: readonly TestBackupSummary[], action: "restore" | "accept") {
    const months = items.map((item) => item.month);
    const restoring = action === "restore";
    Alert.alert(
      restoring ? "Original wiederherstellen?" : "Testdaten übernehmen?",
      restoring
        ? "Alle aktuellen Änderungen in diesen Testmonaten gehen verloren. Der vorherige Zustand wird exakt wiederhergestellt."
        : "Die aktuellen Testdaten werden zu normalen App-Daten. Das Original-Backup wird gelöscht.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: restoring ? "Wiederherstellen" : "Übernehmen",
          style: "destructive",
          onPress: () => void runBackupAction(months, action),
        },
      ],
    );
  }

  async function runBackupAction(months: readonly string[], action: "restore" | "accept") {
    try {
      setBusy(true);
      if (action === "restore") await restoreTestBackup(db, months);
      else await acceptTestRun(db, months);
      await reload();
      await refresh();
      setMessage(action === "restore" ? "Originaldaten wiederhergestellt." : "Testdaten übernommen.");
    } finally {
      setBusy(false);
    }
  }

  function deactivate() {
    Alert.alert("Testlabor deaktivieren?", "Vorhandene Backups und Testdaten bleiben erhalten.", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Deaktivieren",
        style: "destructive",
        onPress: () => void setDeveloperMode(db, false).then(() => router.back()),
      },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={{ gap: 18, padding: 16, paddingBottom: 48 }}>
      <View style={{ gap: 5 }}>
        <Text style={{ color: palette.text, fontSize: 28, fontWeight: "900" }}>Testlabor</Text>
        <Text style={{ color: palette.textMuted, lineHeight: 20 }}>Komplette Monate in wenigen Sekunden prüfen.</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 18, backgroundColor: palette.surface, padding: 12 }}>
        <Pressable accessibilityLabel="Vorheriger Monat" onPress={() => moveMonth(-1)} style={{ padding: 12 }}><Text style={{ color: palette.primary, fontSize: 24 }}>‹</Text></Pressable>
        <View style={{ alignItems: "center", gap: 2 }}><Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: "800" }}>STARTMONAT</Text><Text style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>{formatMonthTitle(startMonth)}</Text></View>
        <Pressable accessibilityLabel="Nächster Monat" onPress={() => moveMonth(1)} style={{ padding: 12 }}><Text style={{ color: palette.primary, fontSize: 24 }}>›</Text></Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {([1, 3, 12] as const).map((value) => <SegmentedButton key={value} label={`${value} ${value === 1 ? "Monat" : "Monate"}`} selected={range === value} onPress={() => setRange(value)} />)}
      </View>

      <View style={{ gap: 9 }}>
        {SCENARIOS.map((item) => {
          const selected = scenario === item.key;
          return (
            <Pressable key={item.key} onPress={() => setScenario(item.key)} style={{ gap: 4, borderWidth: 1, borderColor: selected ? palette.primary : palette.border, borderRadius: 17, backgroundColor: selected ? palette.primarySoft : palette.surface, padding: 15 }}>
              <Text style={{ color: selected ? palette.primary : palette.text, fontSize: 16, fontWeight: "900" }}>{item.title}</Text>
              <Text style={{ color: palette.textMuted, fontSize: 13 }}>{item.detail}</Text>
            </Pressable>
          );
        })}
      </View>

      {preview ? (
        <View style={{ gap: 12, borderRadius: 20, backgroundColor: palette.surface, padding: 17 }}>
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: "900" }}>Vorschau</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Metric label="Monate" value={String(preview.months.length)} />
            <Metric label="Vorhanden" value={String(preview.existingEntryCount)} />
            <Metric label="Geplant" value={String(preview.plannedShiftCount + preview.plannedAppointmentCount)} />
          </View>
          <Text style={{ color: palette.textMuted, fontSize: 12 }}>{preview.months.map(formatMonthTitle).join(" · ")}</Text>
          {preview.warnings.map((warning) => <Text key={warning} style={{ color: "#D97706", fontSize: 12 }}>● {warning}</Text>)}
        </View>
      ) : null}
      {message ? <Text accessibilityRole="alert" style={{ color: palette.primary, fontWeight: "800", textAlign: "center" }}>{message}</Text> : null}
      <PrimaryButton disabled={busy || preview === null} onPress={confirmGenerate}>{busy ? "Bitte warten …" : "Testdaten erzeugen"}</PrimaryButton>

      {backupGroups.length > 0 ? <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>Aktive Testläufe</Text> : null}
      {backupGroups.map(([runId, items]) => (
        <View key={runId} style={{ gap: 12, borderRadius: 18, backgroundColor: palette.surface, padding: 15 }}>
          <Text style={{ color: palette.text, fontWeight: "900" }}>{items.map((item) => formatMonthTitle(item.month)).join(" · ")}</Text>
          <Text style={{ color: palette.textMuted, fontSize: 12 }}>{items.reduce((sum, item) => sum + item.currentEntryCount, 0)} aktuelle Einträge</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SmallButton label="Original laden" onPress={() => confirmBackupAction(items, "restore")} />
            <SmallButton label="Übernehmen" onPress={() => confirmBackupAction(items, "accept")} />
          </View>
        </View>
      ))}

      {message ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SmallButton label="Im Kalender öffnen" onPress={() => router.replace({ pathname: "/" as never, params: { month: startMonth } })} />
          <SmallButton label="In Auswertung öffnen" onPress={() => router.replace({ pathname: "/analysis" as never, params: { month: startMonth } })} />
        </View>
      ) : null}
      <Pressable disabled={busy} onPress={deactivate} style={{ alignItems: "center", padding: 14 }}><Text style={{ color: palette.danger, fontWeight: "800" }}>Testlabor deaktivieren</Text></Pressable>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return <View style={{ gap: 2 }}><Text style={{ color: palette.text, fontSize: 22, fontWeight: "900" }}>{value}</Text><Text style={{ color: palette.textMuted, fontSize: 11 }}>{label}</Text></View>;
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  const palette = usePalette();
  return <Pressable onPress={onPress} style={{ minHeight: 42, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: palette.border, borderRadius: 12 }}><Text style={{ color: palette.primary, fontSize: 12, fontWeight: "900" }}>{label}</Text></Pressable>;
}
