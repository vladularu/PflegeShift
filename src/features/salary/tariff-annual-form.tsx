import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Keyboard, View } from "react-native";
import { usePflegeShiftStatus, usePflegeShiftTestData } from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import { TARIFF_ANNUAL_CLAIM_TEST_LOCK } from "@/domain/saved-tariff-annual-claim";
import { userFacingErrorMessage } from "@/domain/errors";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { DropdownField, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { successFeedback } from "@/ui/haptics";
import { AnnualConfirmation } from "./tariff-annual-controls";
import {
  AnnualEmploymentFields,
  AnnualEntitlementFields,
  AnnualExceptionFields,
} from "./tariff-annual-eligibility-fields";
import {
  AnnualActualFields,
  AnnualAlternateBasisFields,
  AnnualBasisFields,
} from "./tariff-annual-basis-fields";
import {
  prepareTariffAnnualClaim,
  reassignTariffAnnualClaim,
  tariffAnnualChoices,
  tariffAnnualDraft,
  tariffAnnualSelectionKey,
  type TariffAnnualDraft,
  type TariffAnnualSession,
} from "./tariff-annual-model";
import { RemunerationText } from "./remuneration-positions";

const sections = [
  { value: "selection", label: "Tarifzuordnung" },
  { value: "employment", label: "Beschäftigungszeitraum" },
  { value: "entitlements", label: "Anspruchsmonate" },
  { value: "exceptions", label: "Ausnahmen & Aufteilung" },
  { value: "basis", label: "Bemessungsmonate" },
  { value: "alternate", label: "Besondere Bemessungsgrundlagen" },
  { value: "actual", label: "Tatsächliche Auszahlung" },
];
export function TariffAnnualForm({
  session,
  onClose,
  onReload,
}: {
  readonly session: TariffAnnualSession;
  readonly onClose: () => void;
  readonly onReload: () => void;
}) {
  const history = useRemunerationData();
  const root = usePflegeShiftStatus();
  const { testMonths } = usePflegeShiftTestData();
  const palette = usePalette();
  const [current, setCurrent] = useState(session.saved);
  const [draft, setDraft] = useState(() => tariffAnnualDraft(session));
  const [section, setSection] = useState("selection");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const live =
    history.tariffAnnualClaims.find(
      (row) => row.claim.id === session.claim.id && row.claim.year === session.claim.year,
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
  const readyRef = useRef(ready);
  useLayoutEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  const update = (next: TariffAnnualDraft) => {
    if (!active.current || !readyRef.current || savingRef.current) return;
    setDraft(next);
    setError(null);
    setMessage(null);
  };
  const fields = { value: draft, onChange: update, disabled: !ready || saving };
  const choices = tariffAnnualChoices(history.profiles, session.claim.year);
  const selectionKey = tariffAnnualSelectionKey(draft.claim.selection);
  async function save(revoke = false) {
    if (!active.current || savingRef.current) return;
    if (!readyRef.current) {
      setError("Die Datengrundlage hat sich geändert. Bitte aktuellen Stand laden.");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const input = revoke ? null : prepareTariffAnnualClaim(draft, current);
      if (revoke && (!current || current.revoked)) return;
      savingRef.current = true;
      setSaving(true);
      Keyboard.dismiss();
      const saved = input
        ? await history.saveTariffAnnualClaim(input)
        : await history.revokeTariffAnnualClaim(current!);
      if (!active.current) return;
      setCurrent(saved);
      setMessage(
        revoke
          ? "Tarifangaben deaktiviert. Die gespeicherten Werte bleiben erhalten."
          : "Tarifangaben gespeichert. Unvollständige Angaben bestätigen keinen Anspruch.",
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
      <FormScreen testID="tariff-annual-form">
        <FormSection
          title="Tarifliche Jahressonderzahlung"
          caption={`Anspruchsjahr ${session.claim.year} · z. B. Weihnachtsgeld`}
        >
          <DropdownField
            label="Abschnitt"
            value={section}
            options={sections}
            onChange={(next) => {
              Keyboard.dismiss();
              setSection(next);
            }}
          />
          {current?.revoked ? (
            <FormStatus message="Dieser Datensatz ist deaktiviert. Erneutes Speichern aktiviert ihn ausdrücklich wieder." />
          ) : null}
        </FormSection>
        <View
          pointerEvents={!ready || saving ? "none" : "auto"}
          accessibilityState={{ disabled: !ready || saving }}
        >
          <FormSection title={sections.find((item) => item.value === section)?.label}>
            {section === "selection" ? (
              <>
                <RemunerationText>
                  {choices.find((item) => item.key === selectionKey)?.title ??
                    `${draft.claim.selection.packageId} · ${draft.claim.selection.variant} · ${draft.claim.selection.region} · ${draft.claim.selection.group}`}
                </RemunerationText>
                {choices.length > 0 ? (
                  <DropdownField
                    label="Zuordnung aus Vergütungsprofil"
                    value={selectionKey}
                    options={choices.map((c) => ({ value: c.key, label: c.title }))}
                    onChange={(key) => {
                      const choice = choices.find((item) => item.key === key);
                      if (choice)
                        update({
                          ...draft,
                          claim: reassignTariffAnnualClaim(draft.claim, choice.selection),
                        });
                    }}
                  />
                ) : null}
                <AnnualConfirmation
                  label="Tarifzuordnung für dieses Anspruchsjahr geprüft"
                  value={draft.claim.selection.confirmed}
                  onChange={(confirmed) =>
                    update({
                      ...draft,
                      claim: { ...draft.claim, selection: { ...draft.claim.selection, confirmed } },
                    })
                  }
                />
                {draft.claim.version === 3 ? (
                  <>
                    <AnnualConfirmation
                      label="P-Gruppe am 1. September anhand von Unterlagen bestätigt"
                      value={draft.claim.selection.groupAtSeptember1Confirmed === true}
                      onChange={(groupAtSeptember1Confirmed) =>
                        update({
                          ...draft,
                          claim: {
                            ...draft.claim,
                            selection: {
                              ...draft.claim.selection,
                              groupAtSeptember1Confirmed,
                            },
                          },
                        })
                      }
                    />
                    <FormStatus message="AVR-Caritas Pflege: Diese Angaben sind ein Entwurf. Eine automatische Jahressonderzahlung erscheint erst nach Freigabe der regionalen Tarifregeln und vollständiger persönlicher Bemessungsangaben." />
                  </>
                ) : null}
                <FormStatus message="Tarif, Variante, Region und maßgebliche Gruppe anhand deiner Unterlagen prüfen. Das heutige Vergütungsprofil bestätigt keine historische Eingruppierung. Fehlende Zuordnungen zuerst im Vergütungsprofil ergänzen." />
                {draft.claim.selection.packageId === "tvl-kr-tdl" ? (
                  <FormStatus message="TV-L: Maßgeblich ist grundsätzlich die Gruppe am 1. September und das Entgelt Juli bis September. Bei Eintritt nach 31. August gelten die Gruppe am Einstellungstag und der erste volle Kalendermonat. Persönliche Bemessungsbeträge bestätigen; keine erneute Teilzeitkürzung." />
                ) : null}
                {draft.claim.selection.packageId === "tval-pflege-tdl" ? (
                  <FormStatus message="TVA-L Pflege § 16: 95 Prozent des zustehenden November-Ausbildungsentgelts, Auszahlung November. Anspruch am 1. Dezember oder bestätigte unmittelbare Übernahme beim selben Arbeitgeber. Anspruchsmonate und besondere Übernahmegrundlage getrennt bestätigen. Krankengeldzuschuss nur bei erfüllten Voraussetzungen nach § 13, insbesondere anerkanntem Arbeitsunfall oder Berufskrankheit." />
                ) : null}
              </>
            ) : null}
            {section === "employment" ? <AnnualEmploymentFields {...fields} /> : null}
            {section === "entitlements" ? <AnnualEntitlementFields {...fields} /> : null}
            {section === "exceptions" ? <AnnualExceptionFields {...fields} /> : null}
            {section === "basis" ? (
              <>
                <AnnualBasisFields {...fields} />
                {draft.claim.version === 3 ? (
                  <FormStatus message="Caritas: Nur einbezogene Entgeltbestandteile angeben. Zusätzliche, nicht dienstplanmäßige Überstunden sowie Leistungszulagen und Prämien gehören nicht in die Bemessung. Bezahlte Kalendertage getrennt bestätigen." />
                ) : null}
              </>
            ) : null}
            {section === "alternate" ? <AnnualAlternateBasisFields {...fields} /> : null}
            {section === "actual" ? <AnnualActualFields {...fields} /> : null}
          </FormSection>
        </View>
        <FormStatus
          error={
            error ??
            root.error ??
            history.error ??
            (testMonths.length > 0
              ? TARIFF_ANNUAL_CLAIM_TEST_LOCK
              : !saving && changed
                ? "Gespeicherte Angaben oder Vergütungsprofile wurden geändert. Deine Eingabe bleibt erhalten. Bitte aktuellen Stand laden."
                : null)
          }
        />
        <FormStatus message={message} />
        <PrimaryButton disabled={!ready} busy={saving} onPress={() => void save()}>
          {current?.revoked ? "Tarifangaben erneut aktivieren" : "Tarifangaben speichern"}
        </PrimaryButton>
        {current && !current.revoked ? (
          <SecondaryButton
            disabled={!ready || saving}
            onPress={() =>
              Alert.alert(
                "Tarifangaben deaktivieren?",
                "Diese Angaben einschließlich einer tatsächlichen Zahlung werden nicht mehr berücksichtigt. Die Werte bleiben gespeichert und können erneut aktiviert werden.",
                [
                  { text: "Abbrechen", style: "cancel" },
                  { text: "Deaktivieren", style: "destructive", onPress: () => void save(true) },
                ],
              )
            }
          >
            Tarifangaben deaktivieren
          </SecondaryButton>
        ) : null}
        <SecondaryButton disabled={saving} onPress={onReload}>
          Aktuellen Stand laden
        </SecondaryButton>
        <SecondaryButton disabled={saving} onPress={onClose}>
          Zurück zu Tarifzahlungen
        </SecondaryButton>
      </FormScreen>
    </View>
  );
}
