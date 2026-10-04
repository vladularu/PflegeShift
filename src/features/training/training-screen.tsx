import { router } from "expo-router";
import { useState } from "react";
import { Keyboard } from "react-native";
import { Temporal } from "@js-temporal/polyfill";
import { useTrainingData } from "@/application/training-provider";
import { usePflegeShiftProfile, usePflegeShiftStatus } from "@/application/pflegeshift-provider";
import { trainingProfileForDate } from "@/domain/training-data";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import { DropdownField, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { emptyTrainingProfile } from "./training-profile-model";
import { TrainingProfileForm, type TrainingProfileSession } from "./training-profile-form";

export function TrainingScreen() {
  const history = useTrainingData(),
    root = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const [selected, setSelected] = useState("NEW");
  const [session, setSession] = useState<TrainingProfileSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (session)
    return (
      <TrainingProfileForm
        session={session}
        onClose={() => {
          Keyboard.dismiss();
          setSession(null);
        }}
      />
    );
  if (root.error || history.status === "error")
    return (
      <LoadFailureView
        message={root.error ?? history.error ?? "Ausbildungsdaten nicht verfügbar."}
        onRetry={() => {
          if (root.error) void root.reload();
          else void history.reload();
        }}
      />
    );
  if (!root.ready || history.status !== "ready") return <LoadingView />;
  if (!profile)
    return (
      <LoadFailureView
        message="Bitte zuerst ein Arbeitszeitmodell einrichten."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  const today = Temporal.Now.plainDateISO(profile.timeZone).toString();
  const current = trainingProfileForDate(history.profiles, today);
  function open() {
    const saved =
      selected === "NEW"
        ? null
        : (history.profiles.find((p) => p.data.effectiveFrom === selected) ?? null);
    if (selected !== "NEW" && !saved) {
      setError("Dieser Stand ist nicht mehr verfügbar. Bitte neu auswählen.");
      return;
    }
    const seed = saved?.data ?? {
      ...(current?.data ?? emptyTrainingProfile(today)),
      effectiveFrom: today,
    };
    setError(null);
    setSession({ saved, seed });
  }
  return (
    <FormScreen testID="training-overview">
      <FormSection title="Ausbildung & Alter" caption="Unabhängig von deiner Tarifauswahl.">
        <DropdownField
          label="Ausbildungsstand"
          value={selected}
          options={[
            { label: "Neuen Stand anlegen", value: "NEW" },
            ...history.profiles.map((p) => ({
              label: `Ab ${formatRemunerationDate(p.data.effectiveFrom)} · ${p.data.status === "training" ? "Ausbildung" : p.data.status === "employment" ? "Beschäftigung" : "Noch offen"}`,
              value: p.data.effectiveFrom,
            })),
          ]}
          onChange={(value) => {
            setSelected(value);
            setError(null);
          }}
        />
        <FormStatus
          message={
            history.profiles.length === 0
              ? "Noch keine Angaben erfasst. Ausbildungsstatus und Alter werden nicht aus deinem Tarif abgeleitet."
              : "Ein neuer Stand gilt ab deinem gewählten Datum. Frühere Stände bleiben erhalten."
          }
          error={error}
        />
        <PrimaryButton onPress={open}>
          {selected === "NEW" ? "Angaben erfassen" : "Stand bearbeiten"}
        </PrimaryButton>
      </FormSection>
      <SecondaryButton onPress={() => router.push("/training-times")}>
        Schulzeiten & Pausen
      </SecondaryButton>
    </FormScreen>
  );
}
