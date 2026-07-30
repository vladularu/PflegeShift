import { Temporal } from "@js-temporal/polyfill";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

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

type Detail = "PAY" | "COMPLIANCE" | "ALLOWANCE" | null;

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
  const { width } = useWindowDimensions();
  const {
    ready,
    profile,
    entries,
    tariffDecisions,
    upsertTariffDecision,
  } = useMediShift();
  const [month, setMonth] = useState(currentMonth);
  const [detail, setDetail] = useState<Detail>(null);
  const [saving, setSaving] = useState(false);

  const shifts = useMemo(() => shiftEntries(entries), [entries]);
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
  const compliance = useMemo(
    () => profile
      ? calculateMonthlyCompliance(month, shifts, profile.timeZone)
      : null,
    [month, profile, shifts],
  );
  const pay = useMemo(
    () => profile
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
    setDetail(null);
  }

  function openDetail(nextDetail: Exclude<Detail, null>) {
    setDetail((current) => current === nextDetail ? null : nextDetail);
    if (process.env.EXPO_OS === "ios") {
      void Haptics.selectionAsync();
    }
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
  const extras = pay.timePremiumAmount + pay.overtimeAmount + pay.allowanceAmount;
  const complianceIsClear = compliance.criticalCount === 0 && compliance.warningCount === 0;
  const allowanceTitle = decision
    ? ALLOWANCE_LABELS[decision.allowanceStatus]
    : "Noch nicht bestätigt";
  const cardDirection = width >= 430 ? "row" : "column";

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 48 }}
    >
      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <MonthButton direction="back" onPress={() => moveMonth(-1)} />
        <Text selectable style={{ color: palette.text, fontSize: 21, fontWeight: "800" }}>
          {formatMonthTitle(month)}
        </Text>
        <MonthButton direction="forward" onPress={() => moveMonth(1)} />
      </View>

      {profile.tariff === null ? (
        <SetupCard />
      ) : (
        <>
          <View
            style={{
              gap: 18,
              borderRadius: 28,
              borderCurve: "continuous",
              backgroundColor: palette.dark ? "#19352E" : "#1E6D5D",
              boxShadow: "0 10px 28px rgba(20, 76, 64, 0.18)",
              padding: 22,
            }}
          >
            <View style={{ gap: 6 }}>
              <Text
                selectable
                style={{
                  color: "#B9E4D8",
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 1.1,
                }}
              >
                BRUTTO GESCHÄTZT
              </Text>
              <Text
                selectable
                adjustsFontSizeToFit
                numberOfLines={1}
                style={{
                  color: "#FFFFFF",
                  fontSize: 38,
                  fontWeight: "900",
                  fontVariant: ["tabular-nums"],
                  letterSpacing: -1,
                }}
              >
                {euro(pay.estimatedGrossAmount)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 20 }}>
              <HeroValue label="Grundentgelt" value={euro(pay.personalBaseAmount)} />
              <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.16)" }} />
              <HeroValue label="Zuschläge" value={euro(extras)} />
              <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.16)" }} />
              <HeroValue label="Arbeitszeit" value={formatMinutes(workMinutes)} />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => openDetail("PAY")}
              style={({ pressed }) => ({
                minHeight: 42,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.11)",
                opacity: pressed ? 0.72 : 1,
                paddingHorizontal: 14,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>
                {detail === "PAY" ? "Details schließen" : "Berechnung ansehen"}
              </Text>
              <Text style={{ color: "#B9E4D8", fontSize: 20 }}>
                {detail === "PAY" ? "−" : "›"}
              </Text>
            </Pressable>
          </View>

          {detail === "PAY" ? (
            <PayDetails pay={pay} />
          ) : null}

          <View style={{ flexDirection: cardDirection, gap: 10 }}>
            <StatusCard
              accent={complianceIsClear ? palette.primary : compliance.criticalCount > 0 ? palette.danger : "#D48A18"}
              icon={complianceIsClear ? "checkmark.shield.fill" : "exclamationmark.shield.fill"}
              fallback={complianceIsClear ? "✓" : "!"}
              label="Arbeitszeit"
              title={complianceIsClear
                ? "Alles im grünen Bereich"
                : compliance.criticalCount > 0
                  ? `${compliance.criticalCount} kritisch`
                  : `${compliance.warningCount} Hinweise`}
              active={detail === "COMPLIANCE"}
              onPress={() => openDetail("COMPLIANCE")}
            />
            <StatusCard
              accent={decision ? palette.primary : "#D48A18"}
              icon={decision ? "checkmark.seal.fill" : "sparkles"}
              fallback={decision ? "✓" : "·"}
              label="TVöD-Zulage"
              title={allowanceTitle}
              active={detail === "ALLOWANCE"}
              onPress={() => openDetail("ALLOWANCE")}
            />
          </View>

          {detail === "COMPLIANCE" ? (
            <ComplianceDetails compliance={compliance} />
          ) : detail === "ALLOWANCE" ? (
            <AllowanceDetails
              decision={decision?.allowanceStatus ?? null}
              suggested={pay.assessment.suggestedAllowance}
              evidence={pay.assessment.evidence}
              saving={saving}
              onConfirm={(status) => void confirmAllowance(status)}
            />
          ) : null}

          <Text
            selectable
            style={{
              color: palette.textMuted,
              fontSize: 10,
              lineHeight: 15,
              paddingHorizontal: 6,
              textAlign: "center",
            }}
          >
            Unverbindliche Schätzung · keine Lohnabrechnung oder Rechtsberatung
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function SetupCard() {
  const palette = usePalette();
  return (
    <Card>
      <StatusIcon
        accent={palette.primary}
        fallback="P"
        icon="person.crop.circle.badge.plus"
      />
      <View style={{ gap: 5 }}>
        <Text selectable style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>
          Gehalt aktivieren
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 13, lineHeight: 19 }}>
          Hinterlege einmal Gruppe, Stufe und Bereich.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/more")}
        style={({ pressed }) => ({
          minHeight: 48,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 15,
          backgroundColor: palette.primary,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text style={{ color: palette.dark ? "#10221D" : "#FFFFFF", fontWeight: "900" }}>
          Tarifprofil einrichten
        </Text>
      </Pressable>
    </Card>
  );
}

function PayDetails({
  pay,
}: {
  readonly pay: ReturnType<typeof calculateMonthlyPayEstimate>;
}) {
  const palette = usePalette();
  const premiumShifts = pay.shiftBreakdowns.filter((item) => item.totalAmount > 0);
  return (
    <Card>
      <View style={{ gap: 3 }}>
        <Text selectable style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>
          Zusammensetzung
        </Text>
        <Text selectable numberOfLines={1} style={{ color: palette.textMuted, fontSize: 11 }}>
          {pay.tariffLabel ?? "Tarifstand nicht verfügbar"}
        </Text>
      </View>
      <ValueRow label="Grundentgelt" value={euro(pay.personalBaseAmount)} />
      <ValueRow label="Zeitzuschläge" value={euro(pay.timePremiumAmount)} />
      {pay.overtimeAmount > 0 ? (
        <ValueRow label="Überstunden" value={euro(pay.overtimeAmount)} />
      ) : null}
      {pay.allowanceAmount > 0 ? (
        <ValueRow label="Schichtzulage" value={euro(pay.allowanceAmount)} />
      ) : null}
      {premiumShifts.length > 0 ? (
        <View style={{ gap: 2, paddingTop: 4 }}>
          {premiumShifts.map((item) => (
            <Pressable
              key={item.shiftId}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/day-editor", params: { date: item.date } })}
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderTopColor: palette.border,
                opacity: pressed ? 0.65 : 1,
                paddingVertical: 8,
              })}
            >
              <View style={{ gap: 2 }}>
                <Text selectable style={{ color: palette.text, fontWeight: "800" }}>
                  {formatDateTitle(item.date)}
                </Text>
                <Text selectable style={{ color: palette.textMuted, fontSize: 11 }}>
                  {item.premiumLines.map((line) => line.label).join(" · ") || "Überstunden"}
                </Text>
              </View>
              <Text selectable style={{ color: palette.primary, fontWeight: "900" }}>
                + {euro(item.totalAmount)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ComplianceDetails({
  compliance,
}: {
  readonly compliance: ReturnType<typeof calculateMonthlyCompliance>;
}) {
  const palette = usePalette();
  if (compliance.issues.length === 0) {
    return (
      <Card>
        <Text selectable style={{ color: palette.primary, fontSize: 17, fontWeight: "900" }}>
          Keine Auffälligkeiten
        </Text>
      </Card>
    );
  }
  return (
    <Card>
      <Text selectable style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>
        Hinweise
      </Text>
      {compliance.issues.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/day-editor", params: { date: item.date } })}
          style={({ pressed }) => ({
            minHeight: 58,
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
            borderTopWidth: 1,
            borderTopColor: palette.border,
            opacity: pressed ? 0.65 : 1,
            paddingVertical: 10,
          })}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: item.severity === "critical" ? palette.danger : "#D48A18",
            }}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={{ color: palette.text, fontWeight: "800" }}>
              {item.title}
            </Text>
            <Text selectable style={{ color: palette.textMuted, fontSize: 11 }}>
              {formatDateTitle(item.date)} · {item.kind === "LEGAL" ? "ArbZG" : "Planung"}
            </Text>
          </View>
          <Text style={{ color: palette.textMuted, fontSize: 19 }}>›</Text>
        </Pressable>
      ))}
    </Card>
  );
}

function AllowanceDetails({
  decision,
  suggested,
  evidence,
  saving,
  onConfirm,
}: {
  readonly decision: AllowanceStatus | null;
  readonly suggested: AllowanceStatus;
  readonly evidence: readonly string[];
  readonly saving: boolean;
  readonly onConfirm: (status: AllowanceStatus) => void;
}) {
  const palette = usePalette();
  return (
    <Card>
      <View style={{ gap: 4 }}>
        <Text selectable style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>
          Zulage festlegen
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12 }}>
          Empfehlung: {ALLOWANCE_LABELS[suggested]}
        </Text>
      </View>
      <View style={{ gap: 7 }}>
        {ALLOWANCE_STATUSES.map((status) => {
          const selected = decision === status;
          return (
            <Pressable
              key={status}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={saving}
              onPress={() => onConfirm(status)}
              style={{
                minHeight: 46,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 1,
                borderColor: selected ? palette.primary : palette.border,
                borderRadius: 14,
                borderCurve: "continuous",
                backgroundColor: selected ? palette.primarySoft : palette.surface,
                paddingHorizontal: 13,
              }}
            >
              <Text style={{ color: palette.text, fontSize: 13, fontWeight: "800" }}>
                {ALLOWANCE_LABELS[status]}
              </Text>
              <View
                style={{
                  width: 20,
                  height: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: selected ? palette.primary : palette.border,
                  borderRadius: 10,
                  backgroundColor: selected ? palette.primary : "transparent",
                }}
              >
                {selected ? <Text style={{ color: "#FFFFFF", fontSize: 12 }}>✓</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text selectable numberOfLines={2} style={{ color: palette.textMuted, fontSize: 10, lineHeight: 15 }}>
        {evidence.join(" · ")}
      </Text>
    </Card>
  );
}

function StatusCard({
  label,
  title,
  icon,
  fallback,
  accent,
  active,
  onPress,
}: {
  readonly label: string;
  readonly title: string;
  readonly icon: SymbolViewProps["name"];
  readonly fallback: string;
  readonly accent: string;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 112,
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: active ? 1 : 0,
        borderColor: accent,
        borderRadius: 22,
        borderCurve: "continuous",
        backgroundColor: palette.surface,
        boxShadow: palette.dark ? undefined : "0 4px 16px rgba(28, 48, 42, 0.06)",
        opacity: pressed ? 0.72 : 1,
        padding: 16,
      })}
    >
      <StatusIcon accent={accent} fallback={fallback} icon={icon} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text selectable style={{ color: palette.textMuted, fontSize: 11, fontWeight: "700" }}>
          {label}
        </Text>
        <Text selectable numberOfLines={2} style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>
          {title}
        </Text>
      </View>
      <Text style={{ color: palette.textMuted, fontSize: 18 }}>{active ? "−" : "›"}</Text>
    </Pressable>
  );
}

function StatusIcon({
  icon,
  fallback,
  accent,
}: {
  readonly icon: SymbolViewProps["name"];
  readonly fallback: string;
  readonly accent: string;
}) {
  return (
    <View
      style={{
        width: 42,
        height: 42,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        backgroundColor: `${accent}1F`,
      }}
    >
      {process.env.EXPO_OS === "ios" ? (
        <SymbolView name={icon} size={21} tintColor={accent} weight="semibold" />
      ) : (
        <Text style={{ color: accent, fontSize: 18, fontWeight: "900" }}>{fallback}</Text>
      )}
    </View>
  );
}

function Card({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View
      style={{
        gap: 14,
        borderRadius: 22,
        borderCurve: "continuous",
        backgroundColor: palette.surface,
        boxShadow: palette.dark ? undefined : "0 4px 18px rgba(28, 48, 42, 0.06)",
        padding: 18,
      }}
    >
      {children}
    </View>
  );
}

function HeroValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={{ minWidth: 0, flex: 1, gap: 3 }}>
      <Text selectable style={{ color: "#B9E4D8", fontSize: 10 }}>
        {label}
      </Text>
      <Text
        selectable
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}

function ValueRow({ label, value }: { readonly label: string; readonly value: string }) {
  const palette = usePalette();
  return (
    <View style={{ minHeight: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Text selectable style={{ color: palette.textMuted, fontSize: 13 }}>{label}</Text>
      <Text selectable style={{ color: palette.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function MonthButton({
  direction,
  onPress,
}: {
  readonly direction: "back" | "forward";
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={direction === "back" ? "Vorheriger Monat" : "Nächster Monat"}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 21,
        backgroundColor: palette.surface,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Text style={{ color: palette.text, fontSize: 24, fontWeight: "500" }}>
        {direction === "back" ? "‹" : "›"}
      </Text>
    </Pressable>
  );
}
