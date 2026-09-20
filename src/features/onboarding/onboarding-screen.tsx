import { ONBOARDING_TYPOGRAPHY, useOnboardingPalette } from "@/theme/onboarding";
import { RADII, SPACING, SCREEN_LAYOUT, CONTROL_HEIGHT } from "@/theme/tokens";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePflegeShiftProfile } from "@/application/pflegeshift-provider";
import {
  defaultHolidayRegion,
  defaultTariffRegion,
  holidayRegionsForState,
  tariffFullTimeWeeklyMinutes,
} from "@/domain/employment-profile";
import { userFacingErrorMessage } from "@/domain/errors";
import {
  FEDERAL_STATES,
  FEDERAL_STATE_LABELS,
  HOLIDAY_REGION_LABELS,
  INDUSTRIES,
  INDUSTRY_LABELS,
  PAY_GROUPS,
  PAY_LEVELS,
  type FederalState,
  type HolidayRegion,
  type Industry,
  type PayGroup,
  type PayLevel,
  type TariffSector,
} from "@/domain/types";
import {
  manualMonthlyGrossFieldError,
  parseManualMonthlyGrossCents,
} from "@/features/settings/settings-form-values";
import { focusInvalidField, weeklyHoursFieldError } from "@/ui/form-validation";
import {
  BlueprintIcon,
  type BlueprintIconName,
  Choice,
  FieldError,
  NumberField,
  SelectField,
} from "./onboarding-controls";
import { PercentageSlider } from "./percentage-slider";

type Step = 1 | 2 | 3 | 4 | 5;
type SalaryMode = "MANUAL" | "TVOED_P" | "LATER";
type Errors = Partial<
  Record<
    "industry" | "salary" | "gross" | "group" | "level" | "sector" | "hours" | "state" | "region",
    string
  >
>;
const ICON = require("../../../assets/brand/lunashift/onboarding-icon-red.png");
const WORDMARK_LIGHT = require("../../../assets/brand/lunashift/onboarding-wordmark-light.png");
const WORDMARK_DARK = require("../../../assets/brand/lunashift/onboarding-wordmark-dark.png");

/** Shared settings conversion, retaining decimal-comma and decimal-point compatibility. */
export function parseWeeklyHours(value: string): number {
  const hours = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(hours)) throw new Error("Bitte gültige Wochenstunden angeben.");
  return Math.round(hours * 60);
}
/** Normalize correctly grouped German thousands before using the existing salary parser. */
export function normalizeOnboardingGross(value: string): string {
  const trimmed = value.trim();
  return /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(trimmed) ? trimmed.replace(/\./g, "") : trimmed;
}
export function OnboardingScreen({ preview = false }: { readonly preview?: boolean }) {
  const p = useOnboardingPalette();
  const { profile, updateProfile } = usePflegeShiftProfile();
  const testMode = preview || profile != null;
  const [step, setStep] = useState<Step>(1);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [salaryMode, setSalaryMode] = useState<SalaryMode | null>(null);
  const [gross, setGross] = useState("");
  const [payGroup, setPayGroup] = useState<PayGroup | null>(null);
  const [payLevel, setPayLevel] = useState<PayLevel | null>(null);
  const [sector, setSector] = useState<TariffSector | null>(null);
  const [weeklyHours, setWeeklyHours] = useState("38,5");
  const [percentageBasis, setPercentageBasis] = useState(38.5);
  const [adjustingPercentage, setAdjustingPercentage] = useState(false);
  const [federalState, setFederalState] = useState<FederalState | null>(null);
  const [holidayRegion, setHolidayRegion] = useState<HolidayRegion>("UNKNOWN");
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const grossRef = useRef<TextInput>(null);
  const hoursRef = useRef<TextInput>(null);
  const [editingSummary, setEditingSummary] = useState(false);
  function moveTo(next: Step) {
    if (savingRef.current) return;
    setErrors({});
    setSaveError(undefined);
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }
  function clearError(key: keyof Errors) {
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }
  function advance() {
    const nextErrors: Errors = {};
    if (step === 2 && !industry) nextErrors.industry = "Bitte wähle deinen Berufsbereich aus.";
    if (step === 3) {
      if (!salaryMode) nextErrors.salary = "Bitte wähle eine Gehaltsgrundlage aus.";
      if (salaryMode === "MANUAL")
        nextErrors.gross =
          manualMonthlyGrossFieldError(normalizeOnboardingGross(gross)) ?? undefined;
      if (salaryMode === "TVOED_P") {
        if (!payGroup) nextErrors.group = "Bitte wähle deine Entgeltgruppe.";
        if (!payLevel) nextErrors.level = "Bitte wähle deine Stufe.";
        if (!sector) nextErrors.sector = "Bitte wähle deinen Tarifbereich.";
      }
    }
    if (step === 4) {
      nextErrors.hours = /^\d+(?:[,.]\d{1,2})?$/.test(weeklyHours.trim())
        ? (weeklyHoursFieldError(weeklyHours.trim()) ?? undefined)
        : "Bitte gültige Wochenstunden angeben.";
      const numericHours = Number(weeklyHours.trim().replace(",", "."));
      if (!nextErrors.hours && (numericHours < 1 || numericHours > 80))
        nextErrors.hours = "Die Wochenarbeitszeit muss zwischen 1 und 80 Stunden liegen.";
      if (!federalState) nextErrors.state = "Bitte wähle das Bundesland deines Arbeitsorts.";
      if (federalState && holidayRegion === "UNKNOWN")
        nextErrors.region = "Bitte die Feiertagsregion am Arbeitsort auswählen.";
    }
    setErrors(nextErrors);
    const firstError = Object.values(nextErrors).find(Boolean);
    if (firstError) {
      if (nextErrors.gross) focusInvalidField(grossRef, nextErrors.gross);
      else if (nextErrors.hours) focusInvalidField(hoursRef, nextErrors.hours);
      else AccessibilityInfo.announceForAccessibility(firstError);
      return;
    }
    if (editingSummary) {
      setEditingSummary(false);
      moveTo(5);
    } else moveTo((step + 1) as Step);
  }
  async function finish() {
    if (savingRef.current) return;
    if (testMode) {
      router.back();
      return;
    }
    if (!industry || !salaryMode || !federalState || holidayRegion === "UNKNOWN") return;
    if (salaryMode === "TVOED_P" && (!payGroup || !payLevel || !sector)) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(undefined);
    const tariffRegion = defaultTariffRegion(federalState);
    try {
      await updateProfile({
        industry,
        federalState,
        holidayRegion,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: "Europe/Berlin",
        manualMonthlyGrossCents:
          salaryMode === "MANUAL"
            ? parseManualMonthlyGrossCents(normalizeOnboardingGross(gross))
            : null,
        tariff:
          salaryMode === "TVOED_P" && payGroup && payLevel && sector
            ? {
                payGroup,
                payLevel,
                sector,
                tariffRegion,
                fullTimeWeeklyMinutes: tariffFullTimeWeeklyMinutes(sector, tariffRegion),
              }
            : null,
      });
      router.replace("/");
    } catch (error) {
      setSaveError(
        userFacingErrorMessage(error, "Einrichtung fehlgeschlagen. Bitte erneut versuchen."),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const titles = [
    "Dein Dienstplan.\nDein Rhythmus.",
    "Wo arbeitest du?",
    "Dein Gehalt im Blick.",
    "Wie viel arbeitest du?",
    "Dein Überblick ist bereit.",
  ];
  const copies = [
    "Schichten planen. Zeit verstehen.",
    "Wähle den Bereich, der zu deinem Arbeitsalltag passt.",
    "Wähle deine Gehaltsgrundlage oder richte sie später ein.",
    "Deine vertragliche Arbeitszeit pro Woche.",
    "Das sind deine Angaben. Du kannst sie später jederzeit in den Einstellungen anpassen.",
  ];
  const grossCents = parseManualMonthlyGrossCents(normalizeOnboardingGross(gross));
  const salaryLabel =
    salaryMode === "LATER"
      ? "Gehalt später einrichten"
      : salaryMode === "MANUAL"
        ? `${((grossCents ?? 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € brutto / Monat`
        : `TVöD-P · ${payGroup} · Stufe ${payLevel} · ${sector === "BT_K" ? "BT-K" : "BT-B"}`;
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: p.canvas }]}>
      <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.progressHeader}>
          <Pressable
            accessibilityLabel="Zurück"
            accessibilityRole="button"
            disabled={saving || step === 1}
            onPress={() => {
              setEditingSummary(false);
              moveTo((step - 1) as Step);
            }}
            style={[s.back, { opacity: step === 1 ? 0 : saving ? 0.5 : 1 }]}
          >
            <Text style={[s.label, { color: p.text }]}>‹ Zurück</Text>
          </Pressable>
          <View style={s.progressRight}>
            {testMode ? (
              <Pressable
                accessibilityLabel="Testmodus schließen"
                accessibilityRole="button"
                disabled={saving}
                onPress={() => router.back()}
                style={s.back}
              >
                <Text style={[s.caption, { color: p.muted }]} testID="onboarding-preview-hint">
                  Testmodus · Schließen
                </Text>
              </Pressable>
            ) : null}
            <View
              accessible
              accessibilityLabel={`Schritt ${step} von 5`}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 1, max: 5, now: step }}
              style={s.progressDots}
            >
              <Text style={[s.caption, { color: p.text }]}>{step} / 5</Text>
              <View accessibilityElementsHidden style={s.track}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <View
                    key={n}
                    style={[s.segment, { backgroundColor: n <= step ? p.accent : p.border }]}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>
        <ScrollView
          testID="onboarding-scroll-content"
          style={s.scrollViewport}
          scrollEnabled={!adjustingPercentage}
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          contentContainerStyle={s.scroll}
        >
          <View
            style={[s.content, step === 1 && s.welcome]}
            pointerEvents={saving ? "none" : "auto"}
          >
            {step === 1 ? (
              <View style={s.brand}>
                <Image source={ICON} accessibilityLabel="LUNA Shift Logo" style={s.icon} />
                <Image
                  source={p.dark ? WORDMARK_DARK : WORDMARK_LIGHT}
                  accessibilityLabel="LUNA Shift"
                  style={s.wordmark}
                  resizeMode="contain"
                />
              </View>
            ) : null}
            <View style={s.titleGroup}>
              <Text
                accessibilityRole="header"
                style={[s.title, step === 1 && s.display, { color: p.text }]}
              >
                {titles[step - 1]}
              </Text>
              <Text style={[s.body, s.centered, { color: p.muted }]}>{copies[step - 1]}</Text>
            </View>
            {step === 1 ? (
              <View>
                <View style={s.chips}>
                  {[
                    { label: "F", time: "Frühschicht", color: p.rose },
                    { label: "S", time: "Spätschicht", color: p.apricot },
                    { label: "N", time: "Nachtschicht", color: p.lavender },
                  ].map((chip) => (
                    <View key={chip.label} style={s.chipColumn}>
                      <View style={[s.chip, { backgroundColor: chip.color }]}>
                        <Text style={[s.title, { color: p.text }]}>{chip.label}</Text>
                      </View>
                      <Text style={[s.caption, { color: p.text }]}>{chip.time}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {step === 2 ? (
              <View style={s.list}>
                {INDUSTRIES.map((value) => (
                  <Choice
                    key={value}
                    selected={industry === value}
                    title={INDUSTRY_LABELS[value]}
                    icon={
                      {
                        HEALTHCARE: "heart-pulse",
                        EMERGENCY_SERVICES: "ambulance",
                        SOCIAL_SERVICES: "account-group-outline",
                        OTHER_SHIFT_WORK: "briefcase-outline",
                      }[value] as BlueprintIconName
                    }
                    onPress={() => {
                      setIndustry(value);
                      clearError("industry");
                    }}
                  />
                ))}
                <FieldError message={errors.industry} />
              </View>
            ) : null}
            {step === 3 ? (
              <View style={s.fields}>
                <View style={s.list}>
                  {(
                    [
                      { value: "MANUAL", label: "Monatsbrutto eintragen", icon: "cash-multiple" },
                      { value: "TVOED_P", label: "TVöD-P", icon: "file-document-outline" },
                      { value: "LATER", label: "Später einrichten", icon: "clock-outline" },
                    ] as const
                  ).map((option) => (
                    <Choice
                      key={option.value}
                      selected={salaryMode === option.value}
                      title={option.label}
                      icon={option.icon}
                      onPress={() => {
                        setSalaryMode(option.value);
                        setErrors({});
                      }}
                    />
                  ))}
                  <FieldError message={errors.salary} />
                </View>
                {salaryMode === "MANUAL" ? (
                  <View style={s.list}>
                    <NumberField
                      label="Monatsbrutto in Euro"
                      value={gross}
                      onChangeText={(value) => {
                        setGross(value);
                        clearError("gross");
                      }}
                      placeholder="3.450,50"
                      inputRef={grossRef}
                      error={errors.gross}
                      testID="onboarding-manual-gross"
                    />
                    <Text style={[s.caption, { color: p.muted }]}>
                      Dein persönliches Monatsbrutto. Zuschläge werden hier nicht berechnet.
                    </Text>
                  </View>
                ) : null}
                {salaryMode === "TVOED_P" ? (
                  <View style={s.fields}>
                    <SelectField
                      label="Entgeltgruppe"
                      value={payGroup}
                      options={PAY_GROUPS.map((value) => ({ value, label: value }))}
                      error={errors.group}
                      onChange={(value) => {
                        setPayGroup(value);
                        clearError("group");
                      }}
                    />
                    <SelectField
                      label="Stufe"
                      value={payLevel}
                      options={PAY_LEVELS.map((value) => ({ value, label: `Stufe ${value}` }))}
                      error={errors.level}
                      onChange={(value) => {
                        setPayLevel(value);
                        clearError("level");
                      }}
                    />
                    <SelectField
                      label="Tarifbereich"
                      value={sector}
                      options={[
                        { value: "BT_K" as const, label: "Krankenhäuser · BT-K" },
                        { value: "BT_B" as const, label: "Pflege und Betreuung · BT-B" },
                      ]}
                      error={errors.sector}
                      onChange={(value) => {
                        setSector(value);
                        clearError("sector");
                      }}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
            {step === 4 ? (
              <View style={s.fields}>
                <View style={s.list}>
                  <NumberField
                    label="Wochenstunden"
                    large
                    value={weeklyHours}
                    onChangeText={(value) => {
                      setWeeklyHours(value);
                      clearError("hours");
                    }}
                    placeholder="38,5"
                    error={errors.hours}
                    inputRef={hoursRef}
                    testID="onboarding-weekly-hours"
                  />
                  <PercentageSlider
                    weeklyHours={weeklyHours}
                    basis={percentageBasis}
                    onBasisChange={setPercentageBasis}
                    onHoursChange={(value) => {
                      setWeeklyHours(value);
                      clearError("hours");
                    }}
                    onInteractionChange={setAdjustingPercentage}
                  />
                </View>
                <SelectField
                  label="Bundesland deines Arbeitsorts"
                  icon="map-marker-outline"
                  value={federalState}
                  options={FEDERAL_STATES.map((value) => ({
                    value,
                    label: FEDERAL_STATE_LABELS[value],
                  }))}
                  error={errors.state}
                  onChange={(value) => {
                    setFederalState(value);
                    setHolidayRegion(defaultHolidayRegion(value));
                    setErrors((previous) => ({ ...previous, state: undefined, region: undefined }));
                  }}
                />
                {federalState && holidayRegionsForState(federalState).length > 1 ? (
                  <SelectField
                    label="Regionale Feiertage am Arbeitsort"
                    value={holidayRegion === "UNKNOWN" ? null : holidayRegion}
                    options={holidayRegionsForState(federalState)
                      .filter((value) => value !== "UNKNOWN")
                      .map((value) => ({ value, label: HOLIDAY_REGION_LABELS[value] }))}
                    error={errors.region}
                    onChange={(value) => {
                      setHolidayRegion(value);
                      clearError("region");
                    }}
                  />
                ) : null}
              </View>
            ) : null}
            {step === 5 ? (
              <View>
                <View
                  style={[s.summaryCard, { borderColor: p.border, backgroundColor: p.surface }]}
                >
                  {[
                    {
                      label: "Berufsbranche",
                      icon: "heart-pulse",
                      value: industry ? INDUSTRY_LABELS[industry] : "",
                      target: 2,
                    },
                    { label: "Gehalt", value: salaryLabel, target: 3, icon: "database" },
                    {
                      label: "Arbeitszeit",
                      value: `${weeklyHours} h / Woche`,
                      target: 4,
                      icon: "clock-outline",
                    },
                    {
                      label: "Arbeitsort",
                      icon: "map-marker-outline",
                      value: federalState
                        ? `${FEDERAL_STATE_LABELS[federalState]}${holidayRegionsForState(federalState).length > 1 ? ` · ${HOLIDAY_REGION_LABELS[holidayRegion]}` : ""}`
                        : "",
                      target: 4,
                    },
                  ].map((row) => (
                    <View
                      key={row.label}
                      style={[
                        s.summaryRow,
                        {
                          borderBottomColor: p.border,
                          borderBottomWidth: row.label === "Arbeitsort" ? 0 : 1,
                        },
                      ]}
                    >
                      <BlueprintIcon name={row.icon as BlueprintIconName} />
                      <View style={s.summaryCopy}>
                        <Text style={[s.body, { color: p.text }]}>{row.value}</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${row.label} bearbeiten`}
                        disabled={saving}
                        onPress={() => {
                          setEditingSummary(true);
                          moveTo(row.target as Step);
                        }}
                        style={s.edit}
                      >
                        <Text style={[s.label, { color: p.muted }]}>›</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
                <Text style={[s.caption, s.centered, { color: p.muted, marginTop: SPACING.xl }]}>
                  Ohne Konto. Auf deinem Gerät.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View style={[s.footer, { backgroundColor: p.canvas }]} testID="onboarding-fixed-footer">
          <FieldError message={saveError} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saving ? "LUNA Shift wird eingerichtet" : undefined}
            accessibilityState={{ busy: saving, disabled: saving }}
            disabled={saving}
            onPress={() => {
              if (step === 5) void finish();
              else advance();
            }}
            testID="onboarding-primary-action"
            style={[s.primary, { backgroundColor: p.accent, opacity: saving ? 0.55 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator color={p.onAccent} />
            ) : (
              <Text style={[s.buttonText, { color: p.onAccent }]}>
                {step === 1
                  ? "Los geht’s"
                  : step === 5
                    ? "Ohne Konto starten"
                    : editingSummary
                      ? "Übernehmen"
                      : "Weiter"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1 },
  body: ONBOARDING_TYPOGRAPHY.body,
  centered: { textAlign: "center" },
  scrollViewport: { flex: 1, minHeight: 0 },
  progressRight: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  progressDots: { alignItems: "flex-end", gap: SPACING.xxs },
  summaryCard: { borderWidth: 1, borderRadius: RADII.control, paddingHorizontal: SPACING.md },
  chipColumn: { alignItems: "center", gap: SPACING.sm },
  caption: ONBOARDING_TYPOGRAPHY.caption,
  label: ONBOARDING_TYPOGRAPHY.label,
  progressHeader: {
    paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
    minHeight: CONTROL_HEIGHT.large,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  back: {
    minHeight: CONTROL_HEIGHT.compact,
    minWidth: CONTROL_HEIGHT.compact,
    justifyContent: "center",
  },
  track: { flexDirection: "row", gap: SPACING.sm },
  segment: { width: 8, height: 8, borderRadius: RADII.pill },
  scroll: { flexGrow: 1, padding: SPACING.xl, gap: SPACING.lg },
  content: { gap: SPACING.xl },
  welcome: { flexGrow: 1, justifyContent: "center", paddingVertical: SPACING.md },
  brand: { gap: SPACING.xl, alignItems: "center" },
  icon: { width: 108, height: 108, borderRadius: RADII.card },
  wordmark: { width: 255, maxWidth: "100%", height: 55 },
  titleGroup: { gap: SPACING.sm },
  title: { ...ONBOARDING_TYPOGRAPHY.title, textAlign: "center" },
  display: { ...ONBOARDING_TYPOGRAPHY.display, textAlign: "center" },
  list: { gap: SPACING.md },
  fields: { gap: SPACING.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xl, justifyContent: "center" },
  chip: {
    minWidth: 64,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADII.control,
  },
  summaryRow: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: SPACING.md,
    alignItems: "center",
  },
  summaryCopy: { flex: 1, gap: 5 },
  edit: {
    minHeight: CONTROL_HEIGHT.compact,
    minWidth: CONTROL_HEIGHT.compact,
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
    paddingTop: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING.md,
  },
  primary: {
    minHeight: CONTROL_HEIGHT.large,
    width: "100%",
    borderRadius: RADII.control,
    padding: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: ONBOARDING_TYPOGRAPHY.button,
});
