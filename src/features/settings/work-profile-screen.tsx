import { router, Stack } from "expo-router";
import { View } from "react-native";
import {
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import type { UserProfile } from "@/domain/types";
import { currentMonth } from "@/engine/calendar";
import { settingsEditorRoute, tariffAssessmentRoute } from "@/navigation/routes";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import {
  CardSeparator,
  RowButton,
  SurfaceCard,
  SectionHeader,
  InlineNotice,
} from "@/ui/design-system";
import { ProfilePage } from "./profile-page";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
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
  const { workPatternSettings } = usePflegeShiftTariff();
  const mismatch =
    profile.tvhKrTariff && profile.federalState !== "HE"
      ? "Hessen"
      : profile.tvUkNursingTariff && profile.federalState !== "BW"
        ? "Baden-Württemberg"
        : null;
  return (
    <ProfilePage title="Arbeitsprofil" backLabel="Zurück zu Mehr" onBack={() => router.back()}>
      <Stack.Screen
        options={{
          title: "Arbeitsprofil",
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          statusBarStyle: palette.dark ? "light" : "dark",
        }}
      />
      <View style={{ gap: SPACING.sm }}>
        <SectionHeader title="Persönliche Angaben" />
        <SurfaceCard>
          <RowButton
            title="Name & Arbeitgeber"
            subtitle={`${profile.displayName ?? "Name nicht hinterlegt"}\n${profile.employerName ?? "Arbeitgeber nicht hinterlegt"}`}
            accessibilityHint="Name und Arbeitgeber gemeinsam bearbeiten."
            onPress={() => router.push(settingsEditorRoute("PERSONAL"))}
          />
        </SurfaceCard>
      </View>
      <View style={{ gap: SPACING.sm }}>
        <SectionHeader
          title="Arbeit & Gehalt"
          caption="Grundlage für Sollstunden, Zuschläge und Gehalt."
        />
        <SurfaceCard>
          <RowButton
            title="Arbeitszeit & Arbeitsort"
            subtitle={profileWorkLabel(profile)}
            onPress={() => router.push(settingsEditorRoute("WORK"))}
          />
          <CardSeparator />
          <RowButton
            title="Tarif & Gehalt"
            subtitle={profileSalaryLabel(profile)}
            onPress={() => router.push(settingsEditorRoute("TARIFF"))}
          />
          {mismatch ? (
            <View style={{ padding: SPACING.md }}>
              <InlineNotice
                tone="warning"
                message={`Dein Arbeitsort und die Tarifregion ${mismatch} unterscheiden sich. Bitte prüfe, ob der Tarif zu deinem Arbeitsverhältnis gehört.`}
              />
            </View>
          ) : null}
          {profile.tariff || profile.vkaETariff || profile.tvlKrTariff ? (
            <>
              <CardSeparator />
              <RowButton
                title="Schichtmodell"
                subtitle={
                  workPatternSettings.workplaceCoverage === "AROUND_THE_CLOCK"
                    ? "Durchgehend 24/7"
                    : workPatternSettings.workplaceCoverage === "NOT_AROUND_THE_CLOCK"
                      ? "Nicht durchgehend 24/7"
                      : "Noch nicht bestätigt"
                }
                onPress={() => router.push(tariffAssessmentRoute(currentMonth(profile.timeZone)))}
              />
            </>
          ) : null}
        </SurfaceCard>
      </View>
    </ProfilePage>
  );
}
