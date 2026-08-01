import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import {
  useMediShiftProfile,
  useMediShiftStatus,
} from "@/application/medishift-provider";
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
import { parseWeeklyHours } from "@/features/onboarding/onboarding-screen";
import { resolveTariffUpdate } from "@/features/settings/profile-update";
import { settingsFormValues } from "@/features/settings/settings-form-values";
import { DropdownField, Field } from "@/ui/form-controls";
import {
  FormScreen,
  FormSection,
  FormStatus,
  HeaderSaveAction,
} from "@/ui/form-layout";
import { LoadingView } from "@/ui/loading-view";

type SettingsSection = "WORK" | "TARIFF";

export function SettingsEditorScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const section: SettingsSection = params.section === "TARIFF" ? "TARIFF" : "WORK";
  const { ready, error: dataError } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();

  if (!ready || profile === null) return <LoadingView />;

  return (
    <SettingsEditorForm
      key={`${section}-${profile.createdAt}`}
      dataError={dataError}
      profile={profile}
      section={section}
    />
  );
}

function SettingsEditorForm({
  dataError,
  profile,
  section,
}: {
  readonly dataError: string | null;
  readonly profile: UserProfile;
  readonly section: SettingsSection;
}) {
  const { updateProfile } = useMediShiftProfile();
  const initialValues = settingsFormValues(profile);
  const [federalState, setFederalState] = useState<FederalState>(initialValues.federalState);
  const [weeklyHours, setWeeklyHours] = useState(initialValues.weeklyHours);
  const [payGroup, setPayGroup] = useState<PayGroup>(initialValues.payGroup);
  const [payLevel, setPayLevel] = useState<PayLevel>(initialValues.payLevel);
  const [sector, setSector] = useState<TariffSector>(initialValues.sector);
  const [fullTimeHours, setFullTimeHours] = useState(initialValues.fullTimeHours);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      await updateProfile({
        federalState,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: profile.timeZone,
        tariff: resolveTariffUpdate(
          section,
          profile.tariff,
          {
            payGroup,
            payLevel,
            sector,
            fullTimeWeeklyMinutes: parseWeeklyHours(fullTimeHours),
          },
        ),
      });
      setMessage("Einstellungen gespeichert.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Speichern fehlgeschlagen.");
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
            options={FEDERAL_STATES.map((state) => ({ value: state, label: FEDERAL_STATE_LABELS[state] }))}
            value={federalState}
          />
          <Field
            keyboardType="decimal-pad"
            label="Wochenarbeitszeit in Stunden"
            onChangeText={setWeeklyHours}
            returnKeyType="done"
            value={weeklyHours}
          />
        </FormSection>
      ) : (
        <FormSection
          caption="Grundlage für die automatische Gehaltsberechnung."
          title="Tarifdaten"
        >
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
            keyboardType="decimal-pad"
            label="Tarifliche Vollzeit pro Woche"
            onChangeText={setFullTimeHours}
            returnKeyType="done"
            value={fullTimeHours}
          />
        </FormSection>
      )}

      <FormStatus error={error ?? dataError} message={message} />
    </FormScreen>
  );
}
