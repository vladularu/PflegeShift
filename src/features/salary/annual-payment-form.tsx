import { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, View } from "react-native";
import { usePflegeShiftStatus, usePflegeShiftTestData } from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import { ACTUAL_ANNUAL_PAYMENT_TEST_LOCK } from "@/domain/saved-annual-payment";
import { userFacingErrorMessage } from "@/domain/errors";
import { ownDecimal } from "@/features/settings/own-remuneration-form";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { Field, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { successFeedback } from "@/ui/haptics";
import {
  annualPayoutText,
  prepareAnnualPayment,
  type AnnualPaymentSession,
} from "./annual-payment-model";

export function AnnualPaymentForm({
  session,
  onClose,
  onReload,
}: {
  readonly session: AnnualPaymentSession;
  readonly onClose: () => void;
  readonly onReload: () => void;
}) {
  const history = useRemunerationData();
  const root = usePflegeShiftStatus();
  const { testMonths } = usePflegeShiftTestData();
  const palette = usePalette();
  const [current, setCurrent] = useState(session.saved);
  const [amount, setAmount] = useState(
    session.saved ? ownDecimal(session.saved.payment.grossCents) : "",
  );
  const [payout, setPayout] = useState(annualPayoutText(session.defaultPayoutMonth));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const live =
    history.actualAnnualPayments.find(
      (record) =>
        record.payment.paymentId === session.paymentId &&
        record.payment.entitlementYear === session.entitlementYear,
    ) ?? null;
  const changed =
    JSON.stringify(live) !== JSON.stringify(current) ||
    JSON.stringify(history.profiles) !== session.profilesToken;
  const ready =
    root.ready &&
    root.error === null &&
    history.status === "ready" &&
    !changed &&
    testMonths.length === 0;

  async function save(revoke = false) {
    if (!active.current || savingRef.current) return;
    if (!ready) {
      setError("Die Datengrundlage hat sich geändert. Bitte aktuellen Stand laden.");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const input = revoke
        ? null
        : prepareAnnualPayment({ ...session, saved: current }, amount, payout);
      if (revoke && (current === null || current.revoked)) return;
      savingRef.current = true;
      setSaving(true);
      Keyboard.dismiss();
      const saved = input
        ? await history.saveActualAnnualPayment(input)
        : await history.revokeActualAnnualPayment(current!);
      if (!active.current) return;
      setCurrent(saved);
      setMessage(
        revoke
          ? "Bestätigung widerrufen. Eine vorhandene Schätzung wird wieder verwendet. Der bisherige Wert bleibt gespeichert."
          : "Tatsächliche Bruttozahlung gespeichert. Sie ersetzt die Schätzung für dieses Anspruchsjahr.",
      );
      successFeedback();
    } catch (cause) {
      if (active.current)
        setError(
          userFacingErrorMessage(
            cause,
            "Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten. Bitte aktuellen Stand prüfen.",
          ),
        );
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs }}>
        <SecondaryButton onPress={() => Keyboard.dismiss()}>Tastatur schließen</SecondaryButton>
      </View>
      <FormScreen testID="annual-payment-form">
        <FormSection
          title={session.title}
          caption={`Anspruchsjahr ${session.entitlementYear} · Eigene Vergütung`}
        >
          <Field
            label="Tatsächlicher Bruttobetrag in Euro"
            value={amount}
            placeholder="Zum Beispiel 1250,00"
            keyboardType="decimal-pad"
            returnKeyType="done"
            maxLength={12}
            editable={ready && !saving}
            selectTextOnFocus
            onChangeText={(value) => {
              setAmount(value);
              setError(null);
              setMessage(null);
            }}
            accessibilityHint="Nur den Bruttobetrag dieser Sonderzahlung eintragen, nicht das gesamte Monatsgehalt. 0 bestätigt ausdrücklich keine Zahlung."
          />
          <Field
            label="Auszahlungsmonat (MM.JJJJ)"
            value={payout}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            maxLength={7}
            editable={ready && !saving}
            onChangeText={(value) => {
              setPayout(value);
              setError(null);
              setMessage(null);
            }}
          />
          <FormStatus message="Der Betrag ersetzt die Schätzung, auch bei Auszahlung im Folgejahr. Keine erneute Teilzeitkürzung. Bitte nur den Bruttobetrag der Sonderzahlung aus deiner Abrechnung übernehmen." />
          <FormStatus
            error={
              error ??
              root.error ??
              history.error ??
              (testMonths.length > 0
                ? ACTUAL_ANNUAL_PAYMENT_TEST_LOCK
                : !saving && changed
                  ? "Die Bestätigung oder das Vergütungsprofil wurde geändert. Deine Eingabe bleibt erhalten. Bitte aktuellen Stand laden."
                  : null)
            }
          />
          <FormStatus message={message} />
          <PrimaryButton disabled={!ready} busy={saving} onPress={() => void save()}>
            Tatsächliche Zahlung bestätigen
          </PrimaryButton>
          {current && !current.revoked ? (
            <SecondaryButton
              disabled={!ready || saving}
              onPress={() =>
                Alert.alert(
                  "Bestätigung widerrufen?",
                  "Eine vorhandene Schätzung wird wieder verwendet. Der bisherige Betrag bleibt gespeichert und kann erneut bestätigt werden.",
                  [
                    { text: "Abbrechen", style: "cancel" },
                    { text: "Widerrufen", style: "destructive", onPress: () => void save(true) },
                  ],
                )
              }
            >
              Bestätigung widerrufen
            </SecondaryButton>
          ) : null}
        </FormSection>
        <SecondaryButton disabled={saving} onPress={onReload}>
          Aktuellen Stand laden
        </SecondaryButton>
        <SecondaryButton disabled={saving} onPress={onClose}>
          Zurück zur Auswahl
        </SecondaryButton>
      </FormScreen>
    </View>
  );
}
