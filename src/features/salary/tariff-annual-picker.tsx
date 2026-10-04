import { useState } from "react";
import { FlatList, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePflegeShiftStatus, usePflegeShiftTestData } from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import { TARIFF_ANNUAL_CLAIM_TEST_LOCK } from "@/domain/saved-tariff-annual-claim";
import { Field, SecondaryButton } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { annualPaymentYear, annualPayoutText } from "./annual-payment-model";
import { remunerationEuro } from "./remuneration-presentation";
import { TariffAnnualForm } from "./tariff-annual-form";
import {
  newTariffAnnualClaim,
  tariffAnnualChoices,
  tariffAnnualSelectionKey,
  type TariffAnnualSession,
} from "./tariff-annual-model";

export function TariffAnnualPicker({
  initialYear,
  onClose,
}: {
  readonly initialYear: string;
  readonly onClose: () => void;
}) {
  const history = useRemunerationData(),
    root = usePflegeShiftStatus();
  const { testMonths } = usePflegeShiftTestData();
  const palette = usePalette(),
    insets = useSafeAreaInsets();
  const [yearText, setYearText] = useState(initialYear);
  const [session, setSession] = useState<TariffAnnualSession | null>(null);
  const year = annualPaymentYear(yearText);
  if (session)
    return (
      <TariffAnnualForm
        session={session}
        onClose={() => {
          Keyboard.dismiss();
          setSession(null);
        }}
        onReload={() => {
          Keyboard.dismiss();
          setSession(null);
          void root.reload();
        }}
      />
    );
  if (root.error || history.status === "error")
    return (
      <LoadFailureView
        message={root.error ?? history.error ?? "Vergütungsdaten nicht verfügbar."}
        onRetry={() => {
          if (root.error) void root.reload();
          else void history.reload();
        }}
      />
    );
  if (!root.ready || history.status !== "ready") return <LoadingView />;
  const saved = history.tariffAnnualClaims.filter((row) => row.claim.year === year);
  const choices = year === null ? [] : tariffAnnualChoices(history.profiles, year);
  const items = [
    ...saved.map((row) => ({
      key: row.claim.id,
      claim: row.claim,
      saved: row,
      title: `${row.claim.selection.packageId === "tvoed-vka-bt-k" ? "TVöD-P" : row.claim.selection.packageId === "tvaoed-pflege-vka" ? "TVAöD-Pflege" : row.claim.selection.packageId === "tvl-kr-tdl" ? "TV-L/KR" : row.claim.version === 3 ? "AVR-Caritas Pflege" : row.claim.selection.packageId} · ${row.claim.selection.variant} · ${row.claim.selection.region} · ${row.claim.selection.group} · ${row.revoked ? "Deaktiviert" : row.actualPayment ? `${remunerationEuro(row.actualPayment.grossCents)} · ${annualPayoutText(row.actualPayment.payoutMonth)} bestätigt` : row.claim.version === 3 ? "Entwurf bearbeiten" : "Angaben bearbeiten"}`,
    })),
    ...choices
      .filter(
        (choice) =>
          !saved.some((row) => tariffAnnualSelectionKey(row.claim.selection) === choice.key),
      )
      .map((choice) => ({
        key: choice.key,
        claim: newTariffAnnualClaim(year!, choice.selection, history.tariffAnnualClaims),
        saved: null,
        title: `${choice.title} · Angaben ergänzen`,
      })),
  ];
  return (
    <FlatList
      testID="tariff-annual-list"
      data={items}
      keyExtractor={(item) => item.key}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{
        padding: SPACING.lg,
        paddingBottom: Math.max(insets.bottom, SPACING.xl),
        gap: SPACING.md,
      }}
      ListHeaderComponent={
        <FormSection
          title="Tarifliche Jahressonderzahlung"
          caption="Persönliche Angaben · z. B. Weihnachtsgeld"
        >
          <Field
            label="Tarifliches Anspruchsjahr"
            value={yearText}
            onChangeText={setYearText}
            keyboardType="number-pad"
            maxLength={4}
          />
          <SecondaryButton onPress={() => Keyboard.dismiss()}>Tastatur schließen</SecondaryButton>
          <FormStatus message="Gespeicherte Tarifprofile werden zur Auswahl angeboten. Anspruch und historische Zuordnung müssen gesondert bestätigt werden. Mehrere Teilansprüche dürfen nicht doppelt angesetzt werden." />
          <FormStatus
            error={
              year === null
                ? "Bitte ein vierstelliges Jahr zwischen 1900 und 4099 eingeben."
                : testMonths.length > 0
                  ? TARIFF_ANNUAL_CLAIM_TEST_LOCK
                  : null
            }
          />
          <SecondaryButton onPress={onClose}>Zurück zu eigenen Sonderzahlungen</SecondaryButton>
        </FormSection>
      }
      ListEmptyComponent={
        year === null ? null : (
          <FormStatus message="Keine Tarifzuordnung für dieses Jahr vorhanden. Bitte das Vergütungsprofil mit dem zutreffenden Gültigkeitsdatum ergänzen." />
        )
      }
      renderItem={({ item }) => (
        <SecondaryButton
          disabled={testMonths.length > 0}
          onPress={() => {
            Keyboard.dismiss();
            setSession({
              claim: item.claim,
              saved: item.saved,
              profilesToken: JSON.stringify(history.profiles),
            });
          }}
        >
          {item.title}
        </SecondaryButton>
      )}
    />
  );
}
