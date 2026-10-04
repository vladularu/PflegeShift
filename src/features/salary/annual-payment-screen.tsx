import { useState } from "react";
import { FlatList, Keyboard, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTestData,
} from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import { ACTUAL_ANNUAL_PAYMENT_TEST_LOCK } from "@/domain/saved-annual-payment";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { settingsEditorRoute } from "@/navigation/routes";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { Field, SecondaryButton } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { RemunerationText } from "./remuneration-positions";
import { remunerationEuro } from "./remuneration-presentation";
import { AnnualPaymentForm } from "./annual-payment-form";
import { TariffAnnualPicker } from "./tariff-annual-picker";
import {
  annualPaymentChoices,
  annualPaymentYear,
  annualPayoutText,
  type AnnualPaymentSession,
} from "./annual-payment-model";

export function AnnualPaymentScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const parsed = parseMonthRouteParam(params.month);
  if (parsed.status !== "valid")
    return (
      <LoadFailureView
        title="Sonderzahlungen können nicht geöffnet werden"
        message="Der Link enthält keinen gültigen Monat."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  return <AnnualPaymentPicker key={parsed.value} month={parsed.value} />;
}

function AnnualPaymentPicker({ month }: { readonly month: string }) {
  const history = useRemunerationData();
  const root = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { testMonths } = usePflegeShiftTestData();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [yearText, setYearText] = useState(month.slice(0, 4));
  const [session, setSession] = useState<AnnualPaymentSession | null>(null);
  const [tariff, setTariff] = useState(false);
  const year = annualPaymentYear(yearText);
  if (tariff) return <TariffAnnualPicker initialYear={yearText} onClose={() => setTariff(false)} />;
  if (session)
    return (
      <AnnualPaymentForm
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
  if (profile === null)
    return (
      <LoadFailureView
        message="Bitte zuerst ein Arbeitszeitmodell einrichten."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  return (
    <FlatList
      testID="annual-payment-list"
      data={
        year === null
          ? []
          : annualPaymentChoices(history.profiles, history.actualAnnualPayments, year)
      }
      keyExtractor={(item) => item.paymentId}
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
          title="Eigene Sonderzahlungen"
          caption="Tatsächlichen Betrag statt Schätzung verwenden"
        >
          <Field
            label="Anspruchsjahr"
            value={yearText}
            keyboardType="number-pad"
            maxLength={4}
            selectTextOnFocus
            onChangeText={setYearText}
          />
          <SecondaryButton onPress={() => Keyboard.dismiss()}>Tastatur schließen</SecondaryButton>
          <SecondaryButton
            onPress={() => {
              Keyboard.dismiss();
              setTariff(true);
            }}
          >
            Tarifliche Jahressonderzahlung bearbeiten
          </SecondaryButton>
          <RemunerationText>
            Wähle das Jahr, für das die Zahlung bestimmt ist. Der tatsächliche Auszahlungsmonat kann
            davon abweichen.
          </RemunerationText>
          <FormStatus
            error={
              year === null
                ? "Bitte ein vierstelliges Jahr zwischen 1900 und 4099 eingeben."
                : testMonths.length > 0
                  ? ACTUAL_ANNUAL_PAYMENT_TEST_LOCK
                  : null
            }
          />
        </FormSection>
      }
      ListEmptyComponent={
        year === null ? null : (
          <View style={{ gap: SPACING.md }}>
            <RemunerationText>
              Keine eigenen Sonderzahlungen für dieses Anspruchsjahr eingerichtet. Tarifliche
              Sonderzahlungen können hier nicht überschrieben werden.
            </RemunerationText>
            <SecondaryButton onPress={() => router.push(settingsEditorRoute("TARIFF"))}>
              Vergütungsprofil öffnen
            </SecondaryButton>
          </View>
        )
      }
      renderItem={({ item }) => (
        <SecondaryButton
          disabled={testMonths.length > 0}
          onPress={() => {
            if (year === null) return;
            Keyboard.dismiss();
            setSession({
              ...item,
              entitlementYear: year,
              profilesToken: JSON.stringify(history.profiles),
            });
          }}
        >
          {item.title} ·{" "}
          {item.saved
            ? item.saved.revoked
              ? "Bestätigung widerrufen"
              : `${remunerationEuro(item.saved.payment.grossCents)} · ${annualPayoutText(item.saved.payment.payoutMonth)} bestätigt`
            : "Noch nicht bestätigt"}
        </SecondaryButton>
      )}
    />
  );
}
