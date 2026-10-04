import { router, Stack } from "expo-router";
import { useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { useRemunerationHistory } from "@/application/remuneration-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import {
  resolveRemunerationProfile,
  remunerationDataFromLegacy,
} from "@/domain/remuneration-profile";
import type { UserProfile } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { DropdownField, PrimaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { SheetBackFooter } from "@/ui/sheet-back-footer";
import { formatRemunerationDate } from "./remuneration-editor-values";
import { remunerationTariffOptions } from "./remuneration-tariff-options";
import { RemunerationEditorForm, type RemunerationEditorSession } from "./remuneration-editor-form";

export function RemunerationEditorScreen({ profile }: { readonly profile: UserProfile }) {
  const history = useRemunerationHistory();
  const { resolver } = useRuleCatalogRuntime();
  const palette = usePalette();
  const [selected, setSelected] = useState("NEW");
  const [session, setSession] = useState<RemunerationEditorSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (session !== null)
    return <RemunerationEditorForm session={session} onClose={() => setSession(null)} />;

  function open() {
    setError(null);
    const entry =
      selected === "NEW"
        ? resolveRemunerationProfile(
            history.profiles,
            Temporal.Now.plainDateISO(profile.timeZone).toString(),
          ).profile
        : history.profiles.find((item) => (item.effectiveFrom ?? "LEGACY") === selected);
    if (selected !== "NEW" && entry == null) {
      setError("Dieser Stand ist nicht mehr verfügbar. Bitte neu auswählen.");
      return;
    }
    const data = entry?.data ?? remunerationDataFromLegacy(profile);
    const selection = data.selection;
    const selectionDate =
      selected === "NEW" || entry?.effectiveFrom == null
        ? Temporal.Now.plainDateISO(profile.timeZone).toString()
        : entry.effectiveFrom;
    if (
      selection.kind === "tariff" &&
      !remunerationTariffOptions(selectionDate, resolver).available.some(
        (item) => item.id === selection.packageId,
      )
    ) {
      setError(
        "Dieser Tarifstand kann mit dieser Eingabemaske noch nicht bearbeitet werden. Die gespeicherten Angaben bleiben unverändert.",
      );
      return;
    }
    const correcting = selected !== "NEW" && entry?.effectiveFrom != null;
    setSession({
      data,
      effectiveFrom: correcting ? entry.effectiveFrom : null,
      revision: correcting ? entry.revision : 0,
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Gehalt",
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          statusBarStyle: palette.dark ? "light" : "dark",
          headerRight: () => null,
        }}
      />
      {history.status === "loading" ? (
        <LoadingView />
      ) : history.status === "error" ? (
        <LoadFailureView
          message={history.error ?? "Die Vergütungshistorie konnte nicht geladen werden."}
          onRetry={() => void history.reload()}
        />
      ) : (
        <FormScreen>
          <FormSection
            title="Vergütungsstände"
            caption="Neue Angaben gelten ab einem bestätigten Datum. Übernommene Angaben ohne Gültigkeitsbeginn sind keine bestätigte Gehaltshistorie."
          >
            <DropdownField
              label="Vergütungsstand"
              value={selected}
              onChange={setSelected}
              options={[
                { value: "NEW", label: "Neuer Stand" },
                ...[...history.profiles].reverse().map((item) => ({
                  value: item.effectiveFrom ?? "LEGACY",
                  label:
                    item.effectiveFrom === null
                      ? "Übernommener Stand · Beginn unbekannt"
                      : `Ab ${formatRemunerationDate(item.effectiveFrom)}`,
                })),
              ]}
            />
            <PrimaryButton onPress={open}>
              {selected === "NEW"
                ? "Neuen Stand anlegen"
                : selected === "LEGACY"
                  ? "Als Vorlage verwenden"
                  : "Stand korrigieren"}
            </PrimaryButton>
          </FormSection>
          <FormStatus error={error} />
          <SheetBackFooter onPress={() => router.back()} />
        </FormScreen>
      )}
    </>
  );
}
