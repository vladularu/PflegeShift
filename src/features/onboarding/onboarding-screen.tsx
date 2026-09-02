import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import {
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
  defaultHolidayRegion,
  defaultTariffRegion,
  holidayRegionsForState,
  tariffFullTimeWeeklyMinutes,
} from "@/domain/employment-profile";
import { userFacingErrorMessage } from "@/domain/errors";
import {
  manualMonthlyGrossFieldError,
  parseManualMonthlyGrossCents,
} from "@/features/settings/settings-form-values";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import { DropdownField, Field } from "@/ui/form-controls";
import { FormStatus } from "@/ui/form-layout";
import { focusInvalidField, weeklyHoursFieldError } from "@/ui/form-validation";

type OnboardingStep = 1 | 2 | 3 | 4 | 5;
type SalaryMode = "TVOED_P" | "MANUAL" | "LATER";

const LUNA_ICON_LIGHT = require("../../../assets/images/icon.png");
const LUNA_ICON_DARK = require("../../../assets/images/icon-dark.png");

export function parseWeeklyHours(value: string): number {
  const hours = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(hours)) {
    throw new Error("Bitte gültige Wochenstunden angeben.");
  }
  return Math.round(hours * 60);
}

function ProgressHeader({
  step,
  onBack,
}: {
  readonly step: OnboardingStep;
  readonly onBack: () => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.progressHeader}>
      {step > 1 ? (
        <Pressable
          accessibilityLabel="Zurück"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.55 : 1 }]}
        >
          <Ionicons accessibilityElementsHidden color={palette.text} name="arrow-back" size={22} />
        </Pressable>
      ) : (
        <View style={styles.backButton} />
      )}
      <View accessible accessibilityLabel={`Schritt ${step} von 5`} style={styles.progressCenter}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          {step} von 5
        </Text>
        <View accessibilityElementsHidden style={styles.progressTrack}>
          {([1, 2, 3, 4, 5] as const).map((segment) => (
            <View
              key={segment}
              style={[
                styles.progressSegment,
                { backgroundColor: segment <= step ? palette.primary : palette.separator },
              ]}
            />
          ))}
        </View>
      </View>
      <View style={styles.backButton} />
    </View>
  );
}

function ChoiceCard({
  selected,
  subtitle,
  title,
  onPress,
}: {
  readonly selected: boolean;
  readonly subtitle?: string;
  readonly title: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceCard,
        {
          borderColor: selected ? palette.primary : palette.separator,
          backgroundColor: selected ? palette.primarySoft : palette.surface,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <View
        accessibilityElementsHidden
        style={[styles.radioOuter, { borderColor: selected ? palette.primary : palette.border }]}
      >
        {selected ? (
          <View style={[styles.radioInner, { backgroundColor: palette.primary }]} />
        ) : null}
      </View>
      <View style={styles.choiceCopy}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.textMuted, ...TYPOGRAPHY.footnote }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function StepTitle({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={TEXT_MAX_SCALE}
      style={{ color: palette.text, ...TYPOGRAPHY.hero }}
    >
      {children}
    </Text>
  );
}

function StepCopy({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text
      maxFontSizeMultiplier={TEXT_MAX_SCALE}
      style={{ color: palette.textSecondary, ...TYPOGRAPHY.body }}
    >
      {children}
    </Text>
  );
}

function OnboardingPrimaryAction({
  busy,
  children,
  onPress,
}: {
  readonly busy: boolean;
  readonly children: ReactNode;
  readonly onPress: () => void;
}) {
  const palette = usePalette();

  return (
    <Pressable
      accessibilityLabel={busy ? "LUNA Shift wird eingerichtet" : undefined}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={[styles.primaryAction, { backgroundColor: palette.primary, opacity: busy ? 0.55 : 1 }]}
      testID="onboarding-primary-action"
    >
      {busy ? (
        <ActivityIndicator accessibilityElementsHidden color={palette.onPrimary} size="small" />
      ) : (
        <Text
          dynamicTypeRamp="headline"
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.onPrimary, ...TYPOGRAPHY.button }}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export function OnboardingScreen() {
  const palette = usePalette();
  const { updateProfile } = usePflegeShiftProfile();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [salaryMode, setSalaryMode] = useState<SalaryMode | null>(null);
  const [manualMonthlyGross, setManualMonthlyGross] = useState("");
  const [payGroup, setPayGroup] = useState<PayGroup>("P8");
  const [payLevel, setPayLevel] = useState<PayLevel>(4);
  const [sector, setSector] = useState<TariffSector>("BT_K");
  const [federalState, setFederalState] = useState<FederalState>("NW");
  const [holidayRegion, setHolidayRegion] = useState<HolidayRegion>("NONE");
  const [weeklyHours, setWeeklyHours] = useState("38,5");
  const [manualGrossError, setManualGrossError] = useState<string | null>(null);
  const [weeklyHoursError, setWeeklyHoursError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const manualGrossRef = useRef<TextInput>(null);
  const weeklyHoursRef = useRef<TextInput>(null);
  const backgroundColor = palette.onboardingBackground;

  function moveTo(nextStep: OnboardingStep) {
    setError(null);
    setStep(nextStep);
  }

  function continueFromIndustry() {
    if (industry === null) {
      setError("Bitte wähle deinen Berufsbereich aus.");
      return;
    }
    moveTo(3);
  }

  function continueFromSalary() {
    if (salaryMode === null) {
      setError("Bitte wähle eine Gehaltsgrundlage aus.");
      return;
    }
    if (salaryMode === "MANUAL") {
      const fieldError = manualMonthlyGrossFieldError(manualMonthlyGross);
      setManualGrossError(fieldError);
      if (fieldError) {
        setError(fieldError);
        focusInvalidField(manualGrossRef, fieldError);
        return;
      }
    }
    moveTo(4);
  }

  function continueFromWork() {
    const fieldError = weeklyHoursFieldError(weeklyHours);
    const holidayError =
      holidayRegionsForState(federalState).length > 1 && holidayRegion === "UNKNOWN"
        ? "Bitte die Feiertagsregion am Arbeitsort auswählen."
        : null;
    setWeeklyHoursError(fieldError);
    if (fieldError) {
      setError(fieldError);
      focusInvalidField(weeklyHoursRef, fieldError);
      return;
    }
    if (holidayError) {
      setError(holidayError);
      return;
    }
    moveTo(5);
  }

  async function submitGuestProfile() {
    if (industry === null || salaryMode === null) return;
    const tariffRegion = defaultTariffRegion(federalState);
    try {
      setSaving(true);
      setError(null);
      await updateProfile({
        federalState,
        holidayRegion,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: "Europe/Berlin",
        industry,
        manualMonthlyGrossCents:
          salaryMode === "MANUAL" ? parseManualMonthlyGrossCents(manualMonthlyGross) : null,
        tariff:
          salaryMode === "TVOED_P"
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
    } catch (submitError) {
      setError(userFacingErrorMessage(submitError, "Einrichtung fehlgeschlagen."));
    } finally {
      setSaving(false);
    }
  }

  const buttonLabel = step === 1 ? "Los geht’s" : step === 5 ? "LUNA Shift öffnen" : "Weiter";

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardArea}
      >
        <ProgressHeader
          onBack={() => moveTo(Math.max(1, step - 1) as OnboardingStep)}
          step={step}
        />
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 ? (
            <View style={styles.welcomeContent}>
              <Image
                accessibilityLabel="LUNA Shift Logo"
                accessibilityRole="image"
                source={palette.dark ? LUNA_ICON_DARK : LUNA_ICON_LIGHT}
                style={styles.brandIcon}
              />
              <View style={styles.titleGroup}>
                <StepTitle>Willkommen bei LUNA Shift</StepTitle>
                <StepCopy>
                  Dienstplan, Arbeitszeit und Gehalt – ruhig und übersichtlich an einem Ort.
                </StepCopy>
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.stepContent}>
              <View style={styles.titleGroup}>
                <StepTitle>In welchem Bereich arbeitest du?</StepTitle>
                <StepCopy>Damit Begriffe und Hinweise zu deinem Arbeitsalltag passen.</StepCopy>
              </View>
              <View style={styles.choiceList}>
                {INDUSTRIES.map((value) => (
                  <ChoiceCard
                    key={value}
                    onPress={() => {
                      setIndustry(value);
                      setError(null);
                    }}
                    selected={industry === value}
                    title={INDUSTRY_LABELS[value]}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.stepContent}>
              <View style={styles.titleGroup}>
                <StepTitle>Wie möchtest du dein Gehalt einrichten?</StepTitle>
                <StepCopy>Du kannst diese Auswahl später jederzeit ändern.</StepCopy>
              </View>
              <View style={styles.choiceList}>
                <ChoiceCard
                  onPress={() => {
                    setSalaryMode("TVOED_P");
                    setManualGrossError(null);
                    setError(null);
                  }}
                  selected={salaryMode === "TVOED_P"}
                  subtitle="Entgeltgruppe, Stufe und Bereich"
                  title="TVöD-P"
                />
                <ChoiceCard
                  onPress={() => {
                    setSalaryMode("MANUAL");
                    setError(null);
                  }}
                  selected={salaryMode === "MANUAL"}
                  subtitle="Fester persönlicher Monatswert"
                  title="Monatsbrutto selbst eintragen"
                />
                <ChoiceCard
                  onPress={() => {
                    setSalaryMode("LATER");
                    setManualGrossError(null);
                    setError(null);
                  }}
                  selected={salaryMode === "LATER"}
                  title="Später einrichten"
                />
              </View>

              {salaryMode === "TVOED_P" ? (
                <View style={styles.fieldGroup}>
                  <DropdownField
                    label="Entgeltgruppe"
                    onChange={setPayGroup}
                    options={PAY_GROUPS.map((value) => ({ value, label: value }))}
                    value={payGroup}
                  />
                  <DropdownField
                    label="Stufe"
                    onChange={setPayLevel}
                    options={PAY_LEVELS.map((value) => ({ value, label: `Stufe ${value}` }))}
                    value={payLevel}
                  />
                  <DropdownField
                    label="Bereich"
                    onChange={setSector}
                    options={[
                      { value: "BT_K" as const, label: "Krankenhäuser · BT-K" },
                      { value: "BT_B" as const, label: "Pflege- und Betreuung · BT-B" },
                    ]}
                    value={sector}
                  />
                </View>
              ) : null}

              {salaryMode === "MANUAL" ? (
                <View style={styles.fieldGroup}>
                  <Field
                    error={manualGrossError}
                    inputRef={manualGrossRef}
                    keyboardType="decimal-pad"
                    label="Monatliches Brutto in Euro"
                    onChangeText={(value) => {
                      setManualMonthlyGross(value);
                      if (manualGrossError) setManualGrossError(null);
                    }}
                    placeholder="3450,50"
                    returnKeyType="done"
                    testID="onboarding-manual-gross"
                    value={manualMonthlyGross}
                  />
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={{ color: palette.textMuted, ...TYPOGRAPHY.footnote }}
                  >
                    Orientierung für deine Auswertungen, keine Lohnabrechnung.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {step === 4 ? (
            <View style={styles.stepContent}>
              <View style={styles.titleGroup}>
                <StepTitle>Wie sieht deine Arbeitszeit aus?</StepTitle>
                <StepCopy>Damit Feiertage und Sollstunden richtig eingeordnet werden.</StepCopy>
              </View>
              <View style={styles.fieldGroup}>
                <DropdownField
                  label="Bundesland"
                  onChange={(value) => {
                    setFederalState(value);
                    setHolidayRegion(defaultHolidayRegion(value));
                    setError(null);
                  }}
                  options={FEDERAL_STATES.map((value) => ({
                    value,
                    label: FEDERAL_STATE_LABELS[value],
                  }))}
                  value={federalState}
                />
                {holidayRegionsForState(federalState).length > 1 ? (
                  <DropdownField
                    label="Regionale Feiertage am Arbeitsort"
                    onChange={(value) => {
                      setHolidayRegion(value);
                      setError(null);
                    }}
                    options={holidayRegionsForState(federalState).map((value) => ({
                      value,
                      label: HOLIDAY_REGION_LABELS[value],
                    }))}
                    value={holidayRegion}
                  />
                ) : null}
                <Field
                  error={weeklyHoursError}
                  inputRef={weeklyHoursRef}
                  keyboardType="decimal-pad"
                  label="Stunden pro Woche"
                  onChangeText={(value) => {
                    setWeeklyHours(value);
                    if (weeklyHoursError) setWeeklyHoursError(null);
                  }}
                  placeholder="38,5"
                  returnKeyType="done"
                  testID="onboarding-weekly-hours"
                  value={weeklyHours}
                />
              </View>
            </View>
          ) : null}

          {step === 5 ? (
            <View style={styles.stepContent}>
              <View style={styles.titleGroup}>
                <StepTitle>Bereit für deinen Dienstplan?</StepTitle>
                <StepCopy>Du startest lokal und ohne Konto.</StepCopy>
              </View>
              <View style={[styles.localInfo, { backgroundColor: palette.primarySoft }]}>
                <Ionicons
                  accessibilityElementsHidden
                  color={palette.primary}
                  name="shield-checkmark-outline"
                  size={24}
                />
                <View style={styles.choiceCopy}>
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                  >
                    Ohne Konto starten
                  </Text>
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={{ color: palette.textSecondary, ...TYPOGRAPHY.footnote }}
                  >
                    Deine Daten bleiben verschlüsselt auf diesem Gerät.
                  </Text>
                </View>
              </View>
              <StepCopy>
                Ein Konto bieten wir erst an, wenn sichere Sicherung und Synchronisierung
                bereitstehen.
              </StepCopy>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor }]}>
          <FormStatus error={error} />
          <OnboardingPrimaryAction
            busy={saving}
            onPress={() => {
              if (step === 1) moveTo(2);
              else if (step === 2) continueFromIndustry();
              else if (step === 3) continueFromSalary();
              else if (step === 4) continueFromWork();
              else void submitGuestProfile();
            }}
          >
            {buttonLabel}
          </OnboardingPrimaryAction>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardArea: { flex: 1 },
  progressHeader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
  },
  backButton: {
    width: CONTROL_HEIGHT.compact,
    height: CONTROL_HEIGHT.compact,
    alignItems: "center",
    justifyContent: "center",
  },
  progressCenter: { flex: 1, alignItems: "center", gap: SPACING.xs },
  progressTrack: { flexDirection: "row", gap: SPACING.xs },
  progressSegment: { width: 28, height: 3, borderRadius: RADII.pill },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  welcomeContent: { flex: 1, justifyContent: "center", gap: SPACING.xxl },
  brandIcon: { width: 92, height: 92, borderRadius: RADII.large },
  stepContent: { gap: SPACING.xxl },
  titleGroup: { gap: SPACING.md },
  choiceList: { gap: SPACING.md },
  choiceCard: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderWidth: 1,
    borderRadius: RADII.card,
    borderCurve: "continuous",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  radioOuter: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: RADII.pill,
  },
  radioInner: { width: 12, height: 12, borderRadius: RADII.pill },
  choiceCopy: { flex: 1, gap: SPACING.xxs },
  fieldGroup: { gap: SPACING.lg },
  localInfo: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderRadius: RADII.card,
    borderCurve: "continuous",
    padding: SPACING.lg,
  },
  footer: {
    alignItems: "stretch",
    gap: SPACING.sm,
    paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  primaryAction: {
    width: "100%",
    minHeight: CONTROL_HEIGHT.large,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADII.control,
    borderCurve: "continuous",
    paddingHorizontal: SPACING.lg,
  },
});
