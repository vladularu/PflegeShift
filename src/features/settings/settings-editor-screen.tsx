import { router, Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { TextInput } from "react-native";
import { usePflegeShiftProfile, usePflegeShiftStatus } from "@/application/pflegeshift-provider";
import {
  FEDERAL_STATES,
  FEDERAL_STATE_LABELS,
  HOLIDAY_REGION_LABELS,
  INDUSTRIES,
  INDUSTRY_LABELS,
  type FederalState,
  type HolidayRegion,
  type UserProfile,
} from "@/domain/types";
import { defaultHolidayRegion, holidayRegionsForState } from "@/domain/employment-profile";
import { userFacingErrorMessage } from "@/domain/errors";
import { parseWeeklyHours } from "@/features/onboarding/onboarding-screen";
import {
  evidenceBoolean,
  settingsFormValues,
  type EvidenceFormValue,
  type IndustryFormValue,
} from "./settings-form-values";
import { RemunerationEditorScreen } from "./remuneration-editor-screen";
import { parseEnumRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { DropdownField, Field } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus, HeaderSaveAction } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { focusInvalidField, weeklyHoursFieldError } from "@/ui/form-validation";
import { SheetBackFooter } from "@/ui/sheet-back-footer";

export function SettingsEditorScreen() {
  const params = useLocalSearchParams<{ section?: RouteParam }>();
  const section = parseEnumRouteParam(params.section, ["WORK", "TARIFF"] as const);
  const { ready, error: dataError, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  if (section.status !== "valid")
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zu den Einstellungen enthält einen unbekannten Bereich."
        onRetry={() => router.back()}
        title="Einstellungen können nicht geöffnet werden"
      />
    );
  if (ready && dataError)
    return <LoadFailureView message={dataError} onRetry={() => void reload()} />;
  if (!ready || profile === null) return <LoadingView />;
  return section.value === "TARIFF" ? (
    <RemunerationEditorScreen key={profile.createdAt} profile={profile} />
  ) : (
    <WorkSettingsForm key={profile.createdAt} profile={profile} />
  );
}

function WorkSettingsForm({ profile }: { readonly profile: UserProfile }) {
  const palette = usePalette();
  const { updateProfile } = usePflegeShiftProfile();
  const initial = settingsFormValues(profile);
  const [federalState, setFederalState] = useState<FederalState>(initial.federalState);
  const [holidayRegion, setHolidayRegion] = useState<HolidayRegion>(initial.holidayRegion);
  const [weeklyHours, setWeeklyHours] = useState(initial.weeklyHours);
  const [industry, setIndustry] = useState<IndustryFormValue>(initial.industry);
  const [regularRotatingNightWork, setRegularRotatingNightWork] = useState<EvidenceFormValue>(
    initial.regularRotatingNightWork,
  );
  const [sundayHolidayWorkEligible, setSundayHolidayWorkEligible] = useState<EvidenceFormValue>(
    initial.sundayHolidayWorkEligible,
  );
  const [allEmploymentWorkRecorded, setAllEmploymentWorkRecorded] = useState<EvidenceFormValue>(
    initial.allEmploymentWorkRecorded,
  );
  const [weeklyHoursError, setWeeklyHoursError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const weeklyHoursRef = useRef<TextInput>(null);
  const evidenceOptions = [
    { value: "UNKNOWN" as const, label: "Noch nicht bestätigt" },
    { value: "YES" as const, label: "Ja" },
    { value: "NO" as const, label: "Nein" },
  ];
  async function submit() {
    if (savingRef.current) return;
    const fieldError = weeklyHoursFieldError(weeklyHours);
    setWeeklyHoursError(fieldError);
    setError(fieldError);
    setMessage(null);
    if (fieldError) {
      focusInvalidField(weeklyHoursRef, fieldError);
      return;
    }
    try {
      savingRef.current = true;
      setSaving(true);
      await updateProfile({
        federalState,
        holidayRegion,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: profile.timeZone,
        industry: industry === "UNKNOWN" ? null : industry,
        manualMonthlyGrossCents: profile.manualMonthlyGrossCents ?? null,
        tariff: profile.tariff,
        regularRotatingNightWork: evidenceBoolean(regularRotatingNightWork),
        sundayHolidayWorkEligible: evidenceBoolean(sundayHolidayWorkEligible),
        allEmploymentWorkRecorded: evidenceBoolean(allEmploymentWorkRecorded),
      });
      setMessage("Einstellungen gespeichert.");
    } catch (submitError) {
      setError(userFacingErrorMessage(submitError, "Speichern fehlgeschlagen."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: "Arbeitszeitmodell",
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          statusBarStyle: palette.dark ? "light" : "dark",
          headerRight: () => (
            <HeaderSaveAction
              busy={saving}
              closes={false}
              label="Speichern"
              onPress={() => void submit()}
            />
          ),
        }}
      />
      <FormSection
        caption="Bestimmt Feiertage, Sollstunden und deinen Monatssaldo."
        title="Arbeitszeit"
      >
        <DropdownField
          label="Berufsbereich"
          onChange={setIndustry}
          options={[
            { value: "UNKNOWN", label: "Nicht angegeben" },
            ...INDUSTRIES.map((value) => ({ value, label: INDUSTRY_LABELS[value] })),
          ]}
          value={industry}
        />
        <DropdownField
          label="Bundesland"
          onChange={(value) => {
            setFederalState(value);
            setHolidayRegion(defaultHolidayRegion(value));
          }}
          options={FEDERAL_STATES.map((state) => ({
            value: state,
            label: FEDERAL_STATE_LABELS[state],
          }))}
          value={federalState}
        />
        <DropdownField
          label="Regionale Feiertage am Arbeitsort"
          onChange={setHolidayRegion}
          options={holidayRegionsForState(federalState).map((region) => ({
            value: region,
            label: HOLIDAY_REGION_LABELS[region],
          }))}
          value={holidayRegion}
        />
        <Field
          error={weeklyHoursError}
          inputRef={weeklyHoursRef}
          keyboardType="decimal-pad"
          label="Wochenarbeitszeit in Stunden"
          onChangeText={(value) => {
            setWeeklyHours(value);
            setWeeklyHoursError(null);
          }}
          returnKeyType="done"
          value={weeklyHours}
        />
        <DropdownField
          label="Regelmäßige Nacht- oder Wechselschichtarbeit"
          onChange={setRegularRotatingNightWork}
          options={evidenceOptions}
          value={regularRotatingNightWork}
        />
        <DropdownField
          label="Sonn- und Feiertagsarbeit nach § 10 ArbZG zulässig"
          onChange={setSundayHolidayWorkEligible}
          options={evidenceOptions}
          value={sundayHolidayWorkEligible}
        />
        <DropdownField
          label="Arbeitszeit aus allen Arbeitsverhältnissen erfasst"
          onChange={setAllEmploymentWorkRecorded}
          options={evidenceOptions}
          value={allEmploymentWorkRecorded}
        />
      </FormSection>
      <FormStatus error={error} message={message} />
      <SheetBackFooter disabled={saving} onPress={() => router.back()} />
    </FormScreen>
  );
}
