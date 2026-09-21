import { router, Stack } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import {
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import type { UserProfile } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { requireProfileText } from "@/domain/validation";
import { currentMonth } from "@/engine/calendar";
import { settingsEditorRoute, tariffAssessmentRoute } from "@/navigation/routes";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { CardSeparator, RowButton, SurfaceCard, SectionHeader } from "@/ui/design-system";
import { Field } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus, HeaderSaveAction } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { successFeedback } from "@/ui/haptics";
import { profileSalaryLabel, profileWorkLabel } from "./work-profile-summary";

export function WorkProfileScreen() {
  const { ready, error, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (!ready || !profile) return <LoadingView />;
  return <WorkProfileForm profile={profile} />;
}
function WorkProfileForm({ profile }: { readonly profile: UserProfile }) {
  const palette = usePalette();
  const { updateProfile } = usePflegeShiftProfile();
  const { workPatternSettings } = usePflegeShiftTariff();
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [employerName, setEmployerName] = useState(profile.employerName ?? "");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const name = requireProfileText(displayName, "Name", 80);
      const employer = requireProfileText(employerName, "Arbeitgeber", 160);
      await updateProfile({ ...profile, displayName: name, employerName: employer });
      setDisplayName(name ?? "");
      setEmployerName(employer ?? "");
      setMessage("Profil gespeichert.");
      successFeedback();
    } catch (cause) {
      setError(userFacingErrorMessage(cause, "Profil konnte nicht gespeichert werden."));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  const coverageLabel =
    workPatternSettings.workplaceCoverage === "AROUND_THE_CLOCK"
      ? "24/7-Betrieb"
      : workPatternSettings.workplaceCoverage === "NOT_AROUND_THE_CLOCK"
        ? "Kein 24/7-Betrieb"
        : "Betriebszeit bestätigen";
  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: "Arbeitsprofil",
          headerShown: true,
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          headerRight: () => (
            <HeaderSaveAction
              busy={saving}
              closes={false}
              label="Speichern"
              onPress={() => void save()}
            />
          ),
        }}
      />
      <FormSection title="Persönliche Angaben">
        <Field
          label="Name"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={80}
          textContentType="name"
          autoCapitalize="words"
          editable={!saving}
        />
        <Field
          label="Arbeitgeber"
          value={employerName}
          onChangeText={setEmployerName}
          maxLength={160}
          autoCapitalize="words"
          editable={!saving}
        />
      </FormSection>
      <FormStatus error={error} message={message} />
      <View style={{ gap: SPACING.sm }}>
        <SectionHeader title="Arbeit & Gehalt" />
        <SurfaceCard>
          <RowButton
            title="Arbeitszeit"
            subtitle={profileWorkLabel(profile)}
            subtitleBelow
            onPress={() => router.push(settingsEditorRoute("WORK"))}
          />
          <CardSeparator />
          <RowButton
            title="Tarif & Gehalt"
            subtitle={profileSalaryLabel(profile)}
            subtitleBelow
            onPress={() => router.push(settingsEditorRoute("TARIFF"))}
          />
          {profile.tariff ? (
            <>
              <CardSeparator />
              <RowButton
                title="Schichtmodell"
                subtitle={coverageLabel}
                subtitleBelow
                onPress={() => router.push(tariffAssessmentRoute(currentMonth(profile.timeZone)))}
              />
            </>
          ) : null}
        </SurfaceCard>
      </View>
    </FormScreen>
  );
}
