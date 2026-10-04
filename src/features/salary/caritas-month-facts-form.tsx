import { useEffect, useRef, useState } from "react";
import type {
  CaritasClaim,
  CaritasLocalAgreement,
  SavedCaritasMonthFacts,
  SaveCaritasMonthFactsInput,
} from "@/domain/saved-caritas-month-facts";
import { userFacingErrorMessage } from "@/domain/errors";
import { formatMonthTitle } from "@/engine/calendar";
import { DropdownField, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { successFeedback } from "@/ui/haptics";
import { RemunerationText } from "./remuneration-positions";

type YesNoUnknown = "UNKNOWN" | "YES" | "NO";

const yesNoOptions = [
  { value: "UNKNOWN", label: "Ungeklärt" },
  { value: "YES", label: "Ja" },
  { value: "NO", label: "Nein" },
] as const;
const agreementOptions = [
  { value: "UNKNOWN", label: "Ungeklärt" },
  { value: "NONE_CONFIRMED", label: "Keine Abweichung bestätigt" },
  { value: "DIFFERENT", label: "Abweichende Regelung bekannt" },
] as const;

const yesNo = (value: boolean | null): YesNoUnknown =>
  value === null ? "UNKNOWN" : value ? "YES" : "NO";
const fromChoice = (value: YesNoUnknown): boolean | null =>
  value === "UNKNOWN" ? null : value === "YES";
const claim = (value: YesNoUnknown): CaritasClaim =>
  value === "UNKNOWN" ? "UNKNOWN" : value === "YES" ? "ENTITLED" : "NOT_ENTITLED";
const claimChoice = (value: CaritasClaim): YesNoUnknown =>
  value === "UNKNOWN" ? "UNKNOWN" : value === "ENTITLED" ? "YES" : "NO";

export function CaritasMonthFactsForm({
  month,
  profileEffectiveFrom,
  profileRevision,
  ruleVersionId,
  saved,
  current,
  disabled = false,
  onSave,
  onReload,
}: {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly ruleVersionId: string;
  readonly saved: SavedCaritasMonthFacts | null;
  readonly current: boolean;
  readonly disabled?: boolean;
  readonly onSave: (input: SaveCaritasMonthFactsInput) => Promise<SavedCaritasMonthFacts>;
  readonly onReload: () => void;
}) {
  const basis = current ? saved : null;
  const [employment, setEmployment] = useState<YesNoUnknown>(() =>
    yesNo(basis?.fullMonthEmploymentConfirmed ?? null),
  );
  const [baseEntitlement, setBaseEntitlement] = useState<YesNoUnknown>(() =>
    yesNo(basis?.fullMonthlyBaseEntitlementConfirmed ?? null),
  );
  const [fixedAllowance, setFixedAllowance] = useState<YesNoUnknown>(() =>
    claimChoice(basis?.fixedAllowanceClaim ?? "UNKNOWN"),
  );
  const [careAllowance, setCareAllowance] = useState<YesNoUnknown>(() =>
    claimChoice(basis?.careAllowanceClaim ?? "UNKNOWN"),
  );
  const [localAgreement, setLocalAgreement] = useState<CaritasLocalAgreement>(
    basis?.localAgreement ?? "UNKNOWN",
  );
  const [revision, setRevision] = useState(saved?.revision ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef(true);
  const writing = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function save() {
    if (disabled || writing.current || !active.current) return;
    writing.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await onSave({
        month,
        profileEffectiveFrom,
        expectedProfileRevision: profileRevision,
        ruleVersionId,
        fullMonthEmploymentConfirmed: fromChoice(employment),
        fullMonthlyBaseEntitlementConfirmed: fromChoice(baseEntitlement),
        fixedAllowanceClaim: claim(fixedAllowance),
        careAllowanceClaim: claim(careAllowance),
        localAgreement,
        expectedRevision: revision,
      });
      if (!active.current) return;
      setRevision(result.revision);
      setMessage("Angaben gespeichert. Ungeklärte Ansprüche bleiben ungeklärt.");
      successFeedback();
    } catch (cause) {
      if (active.current)
        setError(
          userFacingErrorMessage(cause, "Speichern fehlgeschlagen. Bitte aktuellen Stand laden."),
        );
    } finally {
      writing.current = false;
      if (active.current) setSaving(false);
    }
  }

  return (
    <FormScreen testID="caritas-month-facts-form">
      <FormSection title="Caritas-Monatsangaben" caption={formatMonthTitle(month)}>
        <RemunerationText>
          Diese Angaben beschreiben deinen persönlichen Anspruch. Sie ersetzen weder den
          Arbeitsvertrag noch eine Gehaltsabrechnung.
        </RemunerationText>
        <RemunerationText muted>
          Die Caritas-Berechnung ist derzeit ein Entwurf und erscheint nicht als fertige
          Gehaltsschätzung. Bei Unsicherheit „Ungeklärt“ wählen.
        </RemunerationText>
        {!current && saved ? (
          <RemunerationText>
            Deine bisherigen Angaben gehören zu einem älteren Vergütungs- oder Regelstand. Bitte
            prüfe sie erneut.
          </RemunerationText>
        ) : null}
      </FormSection>
      <FormSection title="Beschäftigung und Grundentgelt">
        <DropdownField<YesNoUnknown>
          label="Im gesamten Monat beschäftigt"
          value={employment}
          options={yesNoOptions}
          onChange={(value) => {
            if (!disabled && !writing.current) setEmployment(value);
          }}
        />
        <DropdownField<YesNoUnknown>
          label="Grundentgelt für den gesamten Monat"
          value={baseEntitlement}
          options={yesNoOptions}
          onChange={(value) => {
            if (!disabled && !writing.current) setBaseEntitlement(value);
          }}
        />
      </FormSection>
      <FormSection title="Persönliche Zulagen">
        <DropdownField<YesNoUnknown>
          label="Anspruch auf feste Zulage"
          value={fixedAllowance}
          options={yesNoOptions}
          onChange={(value) => {
            if (!disabled && !writing.current) setFixedAllowance(value);
          }}
        />
        <DropdownField<YesNoUnknown>
          label="Anspruch auf Pflegezulage"
          value={careAllowance}
          options={yesNoOptions}
          onChange={(value) => {
            if (!disabled && !writing.current) setCareAllowance(value);
          }}
        />
      </FormSection>
      <FormSection title="Örtliche Regelung">
        <DropdownField<CaritasLocalAgreement>
          label="Abweichende Dienstvereinbarung zu Zeitzuschlägen"
          value={localAgreement}
          options={agreementOptions}
          onChange={(value) => {
            if (!disabled && !writing.current) setLocalAgreement(value);
          }}
        />
      </FormSection>
      <FormSection title="Angaben speichern">
        <FormStatus error={error} />
        <FormStatus message={message} />
        <PrimaryButton disabled={disabled} busy={saving} onPress={() => void save()}>
          Angaben speichern
        </PrimaryButton>
      </FormSection>
      <SecondaryButton disabled={saving} onPress={onReload}>
        Aktuellen Stand laden
      </SecondaryButton>
    </FormScreen>
  );
}
