import { useEffect, useRef, useState } from "react";
import type {
  SavedTvoedAnnexAMonthConfirmation,
  SaveTvoedAnnexAMonthConfirmationInput,
} from "@/domain/saved-tvoed-annex-a-month-confirmation";
import { userFacingErrorMessage } from "@/domain/errors";
import { formatMonthTitle } from "@/engine/calendar";
import { DropdownField, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { successFeedback } from "@/ui/haptics";
import { RemunerationText } from "./remuneration-positions";

type Answer = "UNKNOWN" | "YES" | "NO";
const options = [
  { value: "UNKNOWN", label: "Ungeklärt" },
  { value: "YES", label: "Ja" },
  { value: "NO", label: "Nein" },
] as const;
const fields = [
  { key: "applicabilityConfirmed", label: "Tarifgeltung für mich bestätigt" },
  { key: "comparableFullTimeConfirmed", label: "Vergleichbare Vollzeit bestätigt" },
  { key: "fullMonthBaseEntitlementConfirmed", label: "Grundentgelt für den ganzen Monat" },
  { key: "fullMonthSameContractConfirmed", label: "Gleicher Vertrag im ganzen Monat" },
] as const;
const asAnswer = (value: boolean | null): Answer =>
  value === null ? "UNKNOWN" : value ? "YES" : "NO";
const fromAnswer = (value: Answer): boolean | null =>
  value === "UNKNOWN" ? null : value === "YES";

function answersFrom(saved: SavedTvoedAnnexAMonthConfirmation | null) {
  return {
    applicabilityConfirmed: asAnswer(saved?.applicabilityConfirmed ?? null),
    comparableFullTimeConfirmed: asAnswer(saved?.comparableFullTimeConfirmed ?? null),
    fullMonthBaseEntitlementConfirmed: asAnswer(saved?.fullMonthBaseEntitlementConfirmed ?? null),
    fullMonthSameContractConfirmed: asAnswer(saved?.fullMonthSameContractConfirmed ?? null),
  };
}

interface Props {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly ruleVersionId: string;
  readonly saved: SavedTvoedAnnexAMonthConfirmation | null;
  readonly current: boolean;
  readonly disabled?: boolean;
  readonly onSave: (
    input: SaveTvoedAnnexAMonthConfirmationInput,
  ) => Promise<SavedTvoedAnnexAMonthConfirmation>;
  readonly onReload: () => void;
}

/** Unanswered contract facts never become a silent approval of draft pay. */
export function AnnexAMonthForm({
  month,
  profileEffectiveFrom,
  profileRevision,
  ruleVersionId,
  saved,
  current,
  disabled = false,
  onSave,
  onReload,
}: Props) {
  const sourceKey = JSON.stringify([current, saved]);
  const source = current ? saved : null;
  const [draft, setDraft] = useState(() => ({ sourceKey, answers: answersFrom(source) }));
  const answers = draft.sourceKey === sourceKey ? draft.answers : answersFrom(source);
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
    if (disabled || !active.current || writing.current) return;
    writing.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await onSave({
        month,
        profileEffectiveFrom,
        expectedProfileRevision: profileRevision,
        ruleVersionId,
        applicabilityConfirmed: fromAnswer(answers.applicabilityConfirmed),
        comparableFullTimeConfirmed: fromAnswer(answers.comparableFullTimeConfirmed),
        fullMonthBaseEntitlementConfirmed: fromAnswer(answers.fullMonthBaseEntitlementConfirmed),
        fullMonthSameContractConfirmed: fromAnswer(answers.fullMonthSameContractConfirmed),
        expectedRevision: saved?.revision ?? 0,
      });
      if (!active.current) return;
      setMessage("Angaben gespeichert. Das Gesamtbrutto bleibt derzeit unvollständig.");
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
    <FormScreen testID="annex-a-month-form">
      <FormSection title="TVöD-Monatsangaben" caption={formatMonthTitle(month)}>
        <RemunerationText>
          Bestätige nur Angaben, die du aus Vertrag oder Abrechnung sicher kennst. Bei Unsicherheit
          „Ungeklärt“ wählen.
        </RemunerationText>
        <RemunerationText muted>
          Anlage A ist hier noch ein Tarifentwurf. Ein bestätigter Tabellenbetrag ist nur ein
          Teilbetrag, keine fertige Gehaltsschätzung.
        </RemunerationText>
        {!current && saved ? (
          <RemunerationText>
            Frühere Angaben gehören zu einem anderen Profil- oder Regelstand. Bitte erneut prüfen.
          </RemunerationText>
        ) : null}
      </FormSection>
      <FormSection title="Tabellenentgelt">
        {fields.map(({ key, label }) => (
          <DropdownField<Answer>
            key={key}
            label={label}
            value={answers[key]}
            options={options}
            onChange={(value) => {
              if (!disabled && !writing.current)
                setDraft({ sourceKey, answers: { ...answers, [key]: value } });
            }}
          />
        ))}
        <PrimaryButton busy={saving} disabled={disabled || saving} onPress={() => void save()}>
          Monatsangaben speichern
        </PrimaryButton>
      </FormSection>
      <FormSection title="Stand">
        <FormStatus error={error} />
        <FormStatus message={message} />
        <SecondaryButton disabled={disabled || saving} onPress={onReload}>
          Aktuellen Stand laden
        </SecondaryButton>
      </FormSection>
    </FormScreen>
  );
}
