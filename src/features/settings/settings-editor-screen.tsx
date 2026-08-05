import { router, Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { TextInput } from "react-native";

import { usePflegeShiftProfile, usePflegeShiftStatus } from "@/application/pflegeshift-provider";
import {
  FEDERAL_STATES,
  FEDERAL_STATE_LABELS,
  PAY_GROUPS,
  PAY_LEVELS,
  type FederalState,
  type PayGroup,
  type PayLevel,
  type TariffSector,
  type UserProfile,
} from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { parseWeeklyHours } from "@/features/onboarding/onboarding-screen";
import { resolveTariffUpdate } from "@/features/settings/profile-update";
import { settingsFormValues } from "@/features/settings/settings-form-values";
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
  const [weeklyHours, setWeeklyHours] = useState(initialValues.weeklyHours);
  const [payGroup, setPayGroup] = useState<PayGroup>(initialValues.payGroup);
  const [payLevel, setPayLevel] = useState<PayLevel>(initialValues.payLevel);
  const [sector, setSector] = useState<TariffSector>(initialValues.sector);
  const [fullTimeHours, setFullTimeHours] = useState(initialValues.fullTimeHours);
  const [weeklyHoursError, setWeeklyHoursError] = useState<string | null>(null);
  const [fullTimeHoursError, setFullTimeHoursError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const weeklyHoursRef = useRef<TextInput>(null);
  const fullTimeHoursRef = useRef<TextInput>(null);

  async function submit() {
    const fieldError =
      section === "WORK"
        ? weeklyHoursFieldError(weeklyHours)
        : weeklyHoursFieldError(fullTimeHours);
    setWeeklyHoursError(section === "WORK" ? fieldError : null);
    setFullTimeHoursError(section === "TARIFF" ? fieldError : null);
    if (fieldError) {
      setError(fieldError);
      setMessage(null);
      focusInvalidField(section === "WORK" ? weeklyHoursRef : fullTimeHoursRef, fieldError);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      await updateProfile({
        federalState,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: profile.timeZone,
        tariff: resolveTariffUpdate(section, profile.tariff, {
          payGroup,
          payLevel,
          sector,
          fullTimeWeeklyMinutes: parseWeeklyHours(fullTimeHours),
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
            onChange={setFederalState}
            options={FEDERAL_STATES.map((state) => ({
              value: state,
              label: FEDERAL_STATE_LABELS[state],
            }))}
            value={federalState}
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
          <Field
            error={fullTimeHoursError}
            inputRef={fullTimeHoursRef}
            keyboardType="decimal-pad"
            label="Tarifliche Vollzeit pro Woche"
            onChangeText={(value) => {
              setFullTimeHours(value);
              if (fullTimeHoursError) setFullTimeHoursError(null);
            }}
            returnKeyType="done"
            value={fullTimeHours}
          />
        </FormSection>
      )}

      <FormStatus error={error} message={message} />
    </FormScreen>
  );
}
