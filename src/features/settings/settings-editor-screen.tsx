import { router, Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { TextInput } from "react-native";

import { usePflegeShiftProfile, usePflegeShiftStatus } from "@/application/pflegeshift-provider";
import {
  FEDERAL_STATES,
  FEDERAL_STATE_LABELS,
  HOLIDAY_REGION_LABELS,
  PAY_GROUPS,
  PAY_LEVELS,
  TARIFF_REGION_LABELS,
  type FederalState,
  type HolidayRegion,
  type PayGroup,
  type PayLevel,
  type TariffRegion,
  type TariffSector,
  type UserProfile,
} from "@/domain/types";
import {
  defaultHolidayRegion,
  holidayRegionsForState,
  tariffFullTimeWeeklyMinutes,
} from "@/domain/employment-profile";
import { userFacingErrorMessage } from "@/domain/errors";
import { parseWeeklyHours } from "@/features/onboarding/onboarding-screen";
import { resolveTariffUpdate } from "@/features/settings/profile-update";
import {
  evidenceBoolean,
  settingsFormValues,
  type EvidenceFormValue,
} from "@/features/settings/settings-form-values";
import { parseEnumRouteParam, type RouteParam } from "@/navigation/route-params";
import { DropdownField, Field } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus, HeaderSaveAction } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { focusInvalidField, weeklyHoursFieldError } from "@/ui/form-validation";

type SettingsSection = "WORK" | "TARIFF";

export function SettingsEditorScreen() {
  const params = useLocalSearchParams<{ section?: RouteParam }>();
  const parsedSection = parseEnumRouteParam(params.section, ["WORK", "TARIFF"] as const);
  const section: SettingsSection = parsedSection.status === "valid" ? parsedSection.value : "WORK";
  const { ready, error: dataError, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();

  if (parsedSection.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zu den Einstellungen enthält einen unbekannten Bereich."
        onRetry={() => router.back()}
        title="Einstellungen können nicht geöffnet werden"
      />
    );
  }
  if (ready && dataError) {
    return <LoadFailureView message={dataError} onRetry={() => void reload()} />;
  }
  if (!ready || profile === null) return <LoadingView />;

  return (
    <SettingsEditorForm
      key={`${section}-${profile.createdAt}`}
      profile={profile}
      section={section}
    />
  );
}

function SettingsEditorForm({
  profile,
  section,
}: {
  readonly profile: UserProfile;
  readonly section: SettingsSection;
}) {
  const { updateProfile } = usePflegeShiftProfile();
  const initialValues = settingsFormValues(profile);
  const [federalState, setFederalState] = useState<FederalState>(initialValues.federalState);
  const [holidayRegion, setHolidayRegion] = useState<HolidayRegion>(initialValues.holidayRegion);
  const [weeklyHours, setWeeklyHours] = useState(initialValues.weeklyHours);
  const [regularRotatingNightWork, setRegularRotatingNightWork] = useState<EvidenceFormValue>(
    initialValues.regularRotatingNightWork,
  );
  const [sundayHolidayWorkEligible, setSundayHolidayWorkEligible] = useState<EvidenceFormValue>(
    initialValues.sundayHolidayWorkEligible,
  );
  const [allEmploymentWorkRecorded, setAllEmploymentWorkRecorded] = useState<EvidenceFormValue>(
    initialValues.allEmploymentWorkRecorded,
  );
  const [payGroup, setPayGroup] = useState<PayGroup>(initialValues.payGroup);
  const [payLevel, setPayLevel] = useState<PayLevel>(initialValues.payLevel);
  const [sector, setSector] = useState<TariffSector>(initialValues.sector);
  const [tariffRegion, setTariffRegion] = useState<TariffRegion>(initialValues.tariffRegion);
  const [weeklyHoursError, setWeeklyHoursError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const weeklyHoursRef = useRef<TextInput>(null);
  const fullTimeWeeklyMinutes = tariffFullTimeWeeklyMinutes(sector, tariffRegion);
  const fullTimeHours = String(fullTimeWeeklyMinutes / 60).replace(".", ",");
  const evidenceOptions = [
    { value: "UNKNOWN" as const, label: "Noch nicht bestätigt" },
    { value: "YES" as const, label: "Ja" },
    { value: "NO" as const, label: "Nein" },
  ];

  async function submit() {
    const fieldError = section === "WORK" ? weeklyHoursFieldError(weeklyHours) : null;
    setWeeklyHoursError(fieldError);
    if (fieldError) {
      setError(fieldError);
      setMessage(null);
      focusInvalidField(weeklyHoursRef, fieldError);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      await updateProfile({
        federalState,
        holidayRegion,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: profile.timeZone,
        regularRotatingNightWork: evidenceBoolean(regularRotatingNightWork),
        sundayHolidayWorkEligible: evidenceBoolean(sundayHolidayWorkEligible),
        allEmploymentWorkRecorded: evidenceBoolean(allEmploymentWorkRecorded),
        tariff: resolveTariffUpdate(section, profile.tariff, {
          payGroup,
          payLevel,
          sector,
          tariffRegion,
          fullTimeWeeklyMinutes,
        }),
      });
      setMessage("Einstellungen gespeichert.");
    } catch (submitError) {
      setError(userFacingErrorMessage(submitError, "Speichern fehlgeschlagen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: section === "WORK" ? "Arbeitszeitmodell" : "Tarifprofil",
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

      {section === "WORK" ? (
        <FormSection
          caption="Bestimmt Feiertage, Sollstunden und deinen Monatssaldo."
          title="Arbeitszeit"
        >
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
              if (weeklyHoursError) setWeeklyHoursError(null);
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
      ) : (
        <FormSection caption="Grundlage für die automatische Gehaltsberechnung." title="Tarifdaten">
          <DropdownField
            label="Tarifbereich"
            onChange={setSector}
            options={[
              { value: "BT_K", label: "Krankenhaus · BT-K" },
              { value: "BT_B", label: "Pflege · BT-B" },
            ]}
            value={sector}
          />
          <DropdownField
            label="Tarifgebiet"
            onChange={setTariffRegion}
            options={(["KAV_BW", "OTHER"] as const).map((region) => ({
              value: region,
              label: TARIFF_REGION_LABELS[region],
            }))}
            value={tariffRegion}
          />
          <DropdownField
            label="Entgeltgruppe"
            onChange={setPayGroup}
            options={PAY_GROUPS.map((group) => ({ value: group, label: group }))}
            value={payGroup}
          />
          <DropdownField
            label="Stufe"
            onChange={setPayLevel}
            options={PAY_LEVELS.map((level) => ({ value: level, label: `Stufe ${level}` }))}
            value={payLevel}
          />
          <Field editable={false} label="Tarifliche Vollzeit pro Woche" value={fullTimeHours} />
        </FormSection>
      )}

      <FormStatus error={error} message={message} />
    </FormScreen>
  );
}
