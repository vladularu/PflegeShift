import { Temporal } from "@js-temporal/polyfill";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useMediShift } from "@/application/medishift-provider";
import {
  ALLOWANCE_STATUSES,
  type AllowanceStatus,
  type ShiftEntry,
} from "@/domain/types";
import { currentMonth, formatDateTitle, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { formatMinutes } from "@/engine/working-time";
import { usePalette } from "@/theme/palette";
import { LoadingView } from "@/ui/loading-view";

type Section = "OVERVIEW" | "ARBZG" | "SALARY";

const SECTION_LABELS: Readonly<Record<Section, string>> = {
  OVERVIEW: "Übersicht",
  ARBZG: "ArbZG",
  SALARY: "TVöD/Gehalt",
};

const ALLOWANCE_LABELS: Readonly<Record<AllowanceStatus, string>> = {
  NONE: "Keine Zulage",
  SHIFT_MONTHLY: "Ständige Schichtarbeit",
  SHIFT_HOURLY: "Nichtständige Schichtarbeit",
  ALTERNATING_MONTHLY: "Ständige Wechselschicht",
  ALTERNATING_HOURLY: "Nichtständige Wechselschicht",
};

function euro(value: number | null): string {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function shiftEntries(entries: ReturnType<typeof useMediShift>["entries"]): ShiftEntry[] {
  return entries.filter((entry): entry is ShiftEntry => entry.kind === "SHIFT");
}

export function AnalysisScreen() {
  const palette = usePalette();
  const {
    ready,
    profile,
    entries,
    tariffDecisions,
    upsertTariffDecision,
  } = useMediShift();
  const [month, setMonth] = useState(currentMonth);
  const [section, setSection] = useState<Section>("OVERVIEW");
  const [saving, setSaving] = useState(false);

  const shifts = useMemo(() => shiftEntries(entries), [entries]);
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
  const compliance = useMemo(
    () =>
      profile
        ? calculateMonthlyCompliance(month, shifts, profile.timeZone)
        : null,
    [month, profile, shifts],
  );
  const pay = useMemo(
    () =>
      profile
        ? calculateMonthlyPayEstimate(month, shifts, profile, decision)
        : null,
    [decision, month, profile, shifts],
  );

  if (!ready || profile === null || compliance === null || pay === null) {
    return <LoadingView />;
  }

  function moveMonth(delta: number) {
    setMonth(
      Temporal.PlainDate.from(`${month}-01`).add({ months: delta }).toString().slice(0, 7),
    );
  }

  async function confirmAllowance(status: AllowanceStatus) {
    try {
      setSaving(true);
      await upsertTariffDecision({
        month,
        allowanceStatus: status,
        expectedRevision: decision?.revision,
      });
      if (process.env.EXPO_OS === "ios") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setSaving(false);
    }
  }

  const workMinutes = pay.shiftBreakdowns.reduce((sum, item) => sum + item.netMinutes, 0);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 16, padding: 14, paddingBottom: 40 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <MonthButton label="‹" onPress={() => moveMonth(-1)} />
        <Text selectable style={{ color: palette.text, fontSize: 22, fontWeight: "900" }}>
          {formatMonthTitle(month)}
        </Text>
        <MonthButton label="›" onPress={() => moveMonth(1)} />
      </View>

      <View style={{ flexDirection: "row", gap: 4, borderRadius: 15, backgroundColor: palette.outsideMonth, padding: 4 }}>
        {(Object.keys(SECTION_LABELS) as Section[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: section === item }}
            onPress={() => setSection(item)}
            style={{
              minHeight: 42,
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: section === item ? palette.surface : "transparent",
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: section === item ? palette.text : palette.textMuted, fontSize: 11, fontWeight: "800" }}>
              {SECTION_LABELS[item]}
            </Text>
          </Pressable>
        ))}
      </View>

      {profile.tariff === null ? (
        <Card>
          <Text selectable style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>
            Tarifprofil ergänzen
          </Text>
          <Text selectable style={{ color: palette.textMuted, lineHeight: 20 }}>
            Wähle unter „Mehr“ TVöD-P-Gruppe, Stufe und Arbeitsbereich, um die Gehaltsschätzung zu aktivieren.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/more")}
            style={{ minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: palette.primary }}
          >
            <Text style={{ color: palette.dark ? "#10221D" : "#FFFFFF", fontWeight: "900" }}>Tarifprofil öffnen</Text>
          </Pressable>
        </Card>
      ) : section === "OVERVIEW" ? (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Metric label="Brutto-Schätzung" value={euro(pay.estimatedGrossAmount)} highlight />
            <Metric label="Zuschläge" value={euro(pay.timePremiumAmount + pay.overtimeAmount + pay.allowanceAmount)} />
            <Metric label="ArbZG kritisch" value={String(compliance.criticalCount)} danger={compliance.criticalCount > 0} />
          </View>
          <Card>
            <SectionTitle title="Monatscockpit" subtitle="Tarif, Arbeitszeit und Prüfstatus auf einen Blick" />
            <ValueRow label="Persönliches Grundentgelt" value={euro(pay.personalBaseAmount)} />
            <ValueRow label="Arbeitszeit" value={formatMinutes(workMinutes)} />
            <ValueRow label="Zeitzuschläge" value={euro(pay.timePremiumAmount)} />
            <ValueRow label="Überstunden" value={euro(pay.overtimeAmount)} />
            <ValueRow label="Schichtzulage" value={euro(pay.allowanceAmount)} />
          </Card>
          <Card>
            <SectionTitle title="TVöD-Muster" subtitle={pay.assessment.evidence.join(" · ")} />
            <Text selectable style={{ color: palette.text, fontWeight: "800" }}>
              Vorschlag: {ALLOWANCE_LABELS[pay.assessment.suggestedAllowance]}
            </Text>
            <Text selectable style={{ color: decision ? palette.primary : palette.danger, fontSize: 13, fontWeight: "700" }}>
              {decision ? `Bestätigt: ${ALLOWANCE_LABELS[decision.allowanceStatus]}` : "Noch nicht bestätigt – es wird keine Zulage eingerechnet."}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {ALLOWANCE_STATUSES.map((status) => (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => void confirmAllowance(status)}
                  style={{
                    borderWidth: 1,
                    borderColor: decision?.allowanceStatus === status ? palette.primary : palette.border,
                    borderRadius: 999,
                    backgroundColor: decision?.allowanceStatus === status ? palette.primarySoft : palette.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: palette.text, fontSize: 11, fontWeight: "700" }}>{ALLOWANCE_LABELS[status]}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        </>
      ) : section === "ARBZG" ? (
        <Card>
          <SectionTitle
            title={`${compliance.criticalCount} kritisch · ${compliance.warningCount} Warnungen`}
            subtitle="Gesetzliche Prüfungen und Planungshinweise werden getrennt dargestellt."
          />
          {compliance.issues.length === 0 ? (
            <Text selectable style={{ color: palette.primary, fontWeight: "800" }}>Keine Auffälligkeiten erkannt.</Text>
          ) : compliance.issues.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/day-editor", params: { date: item.date } })}
              style={{
                gap: 4,
                borderLeftWidth: 4,
                borderLeftColor: item.severity === "critical" ? palette.danger : "#F2A93B",
                borderRadius: 12,
                backgroundColor: palette.outsideMonth,
                padding: 12,
              }}
            >
              <Text selectable style={{ color: palette.textMuted, fontSize: 11, fontWeight: "800" }}>
                {item.kind === "LEGAL" ? item.rule : "PLANUNG"} · {formatDateTitle(item.date)}
              </Text>
              <Text selectable style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>{item.title}</Text>
              <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 18 }}>{item.description}</Text>
            </Pressable>
          ))}
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Metric label="Grundentgelt" value={euro(pay.personalBaseAmount)} />
            <Metric label="Extras" value={euro(pay.timePremiumAmount + pay.overtimeAmount + pay.allowanceAmount)} highlight />
            <Metric label="Gesamt" value={euro(pay.estimatedGrossAmount)} />
          </View>
          <Card>
            <SectionTitle title="Zuschläge pro Dienst" subtitle={pay.tariffLabel ?? "Tarifstand nicht verfügbar"} />
            {pay.shiftBreakdowns.filter((item) => item.totalAmount > 0).length === 0 ? (
              <Text selectable style={{ color: palette.textMuted }}>Keine zuschlagspflichtigen Zeiten erfasst.</Text>
            ) : pay.shiftBreakdowns.filter((item) => item.totalAmount > 0).map((item) => (
              <Pressable
                key={item.shiftId}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/day-editor", params: { date: item.date } })}
                style={{ gap: 5, borderBottomWidth: 1, borderBottomColor: palette.border, paddingVertical: 10 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                  <Text selectable style={{ color: palette.text, fontWeight: "900" }}>{formatDateTitle(item.date)}</Text>
                  <Text selectable style={{ color: palette.primary, fontWeight: "900" }}>{euro(item.totalAmount)}</Text>
                </View>
                {item.premiumLines.map((line) => (
                  <Text key={line.key} selectable style={{ color: palette.textMuted, fontSize: 12 }}>
                    {line.label}: {formatMinutes(line.minutes)} · {line.percentage}% · {euro(line.amount)}
                  </Text>
                ))}
                {item.overtimeBaseAmount + item.overtimePremiumAmount > 0 ? (
                  <Text selectable style={{ color: palette.textMuted, fontSize: 12 }}>
                    Überstunden: {euro(item.overtimeBaseAmount + item.overtimePremiumAmount)}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </Card>
          <Text selectable style={{ color: palette.textMuted, fontSize: 11, lineHeight: 16, paddingHorizontal: 4 }}>
            Unverbindliche Brutto-Schätzung, keine Lohnabrechnung oder Rechtsberatung. Bereitschaft, Rufbereitschaft, Nettoabzüge und betriebliche Sonderregeln sind nicht enthalten.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function Card({ children }: { readonly children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View style={{ gap: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 18, borderCurve: "continuous", backgroundColor: palette.surface, padding: 14 }}>
      {children}
    </View>
  );
}

function SectionTitle({ title, subtitle }: { readonly title: string; readonly subtitle: string }) {
  const palette = usePalette();
  return (
    <View style={{ gap: 3 }}>
      <Text selectable style={{ color: palette.text, fontSize: 17, fontWeight: "900" }}>{title}</Text>
      <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17 }}>{subtitle}</Text>
    </View>
  );
}

function Metric({ label, value, highlight = false, danger = false }: { readonly label: string; readonly value: string; readonly highlight?: boolean; readonly danger?: boolean }) {
  const palette = usePalette();
  return (
    <View style={{ minHeight: 82, flex: 1, justifyContent: "center", gap: 5, borderRadius: 16, backgroundColor: highlight ? palette.primarySoft : palette.surface, padding: 10 }}>
      <Text selectable style={{ color: palette.textMuted, fontSize: 10, fontWeight: "800" }}>{label}</Text>
      <Text selectable numberOfLines={1} adjustsFontSizeToFit style={{ color: danger ? palette.danger : highlight ? palette.primary : palette.text, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function ValueRow({ label, value }: { readonly label: string; readonly value: string }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text selectable style={{ color: palette.textMuted }}>{label}</Text>
      <Text selectable style={{ color: palette.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function MonthButton({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: palette.surface }}>
      <Text style={{ color: palette.primary, fontSize: 28, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
