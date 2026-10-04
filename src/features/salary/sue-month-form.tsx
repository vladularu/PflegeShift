import { useEffect, useRef, useState } from "react";
import type {
  SavedTvoedSueMonthConfirmation,
  SaveTvoedSueMonthConfirmationInput,
} from "@/domain/saved-tvoed-sue-month-confirmation";
import type {
  SavedTvoedSueAllowanceConfirmation,
  SaveTvoedSueAllowanceConfirmationInput,
} from "@/domain/saved-tvoed-sue-allowance-confirmation";
import { userFacingErrorMessage } from "@/domain/errors";
import { formatMonthTitle } from "@/engine/calendar";
import { DropdownField, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { successFeedback } from "@/ui/haptics";
import { RemunerationText } from "./remuneration-positions";

type Answer = "UNKNOWN" | "YES" | "NO";
type AllowanceAnswers = {
  readonly sectionXxivClassificationConfirmed: Answer;
  readonly fullMonthAllowanceEntitlementConfirmed: Answer;
  readonly caseGroup: "UNKNOWN" | "6" | "OTHER";
  readonly conversionDays: "UNKNOWN" | "NONE_CONFIRMED" | "TAKEN";
};
const answerOptions = [
  { value: "UNKNOWN", label: "Ungeklärt" },
  { value: "YES", label: "Ja" },
  { value: "NO", label: "Nein" },
] as const;
const caseOptions = [
  { value: "UNKNOWN", label: "Ungeklärt" },
  { value: "6", label: "Fallgruppe 6" },
  { value: "OTHER", label: "Andere Fallgruppe" },
] as const;
const conversionOptions = [
  { value: "UNKNOWN", label: "Ungeklärt" },
  { value: "NONE_CONFIRMED", label: "Keine Umwandlungstage bestätigt" },
  { value: "TAKEN", label: "Umwandlungstage genommen" },
] as const;
const asAnswer = (value: boolean | null): Answer =>
  value === null ? "UNKNOWN" : value ? "YES" : "NO";
const fromAnswer = (value: Answer): boolean | null =>
  value === "UNKNOWN" ? null : value === "YES";

const baseFields = [
  { key: "tariffApplicabilityConfirmed", label: "Tarifgeltung für mich bestätigt" },
  { key: "sueClassificationConfirmed", label: "SuE-Eingruppierung bestätigt" },
  { key: "standardFullTimeConfirmed", label: "39-Stunden-Vollzeitbasis bestätigt" },
  { key: "fullMonthBaseEntitlementConfirmed", label: "Grundentgelt für den ganzen Monat" },
  { key: "fullMonthSameContractConfirmed", label: "Gleicher Vertrag im ganzen Monat" },
] as const;
const allowanceFields = [
  { key: "sectionXxivClassificationConfirmed", label: "Tätigkeit nach Abschnitt XXIV bestätigt" },
  { key: "fullMonthAllowanceEntitlementConfirmed", label: "Zulagenanspruch für den ganzen Monat" },
] as const;

interface Props {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly ruleVersionId: string;
  readonly groupId: string;
  readonly savedBase: SavedTvoedSueMonthConfirmation | null;
  readonly savedAllowance: SavedTvoedSueAllowanceConfirmation | null;
  readonly currentBase: boolean;
  readonly currentAllowance: boolean;
  readonly disabled?: boolean;
  readonly onSaveBase: (
    input: SaveTvoedSueMonthConfirmationInput,
  ) => Promise<SavedTvoedSueMonthConfirmation>;
  readonly onSaveAllowance: (
    input: SaveTvoedSueAllowanceConfirmationInput,
  ) => Promise<SavedTvoedSueAllowanceConfirmation>;
  readonly onReload: () => void;
}

function baseAnswersFrom(saved: SavedTvoedSueMonthConfirmation | null) {
  return {
    tariffApplicabilityConfirmed: asAnswer(saved?.tariffApplicabilityConfirmed ?? null),
    sueClassificationConfirmed: asAnswer(saved?.sueClassificationConfirmed ?? null),
    standardFullTimeConfirmed: asAnswer(saved?.standardFullTimeConfirmed ?? null),
    fullMonthBaseEntitlementConfirmed: asAnswer(saved?.fullMonthBaseEntitlementConfirmed ?? null),
    fullMonthSameContractConfirmed: asAnswer(saved?.fullMonthSameContractConfirmed ?? null),
  };
}

function allowanceAnswersFrom(saved: SavedTvoedSueAllowanceConfirmation | null): AllowanceAnswers {
  return {
    sectionXxivClassificationConfirmed: asAnswer(saved?.sectionXxivClassificationConfirmed ?? null),
    fullMonthAllowanceEntitlementConfirmed: asAnswer(
      saved?.fullMonthAllowanceEntitlementConfirmed ?? null,
    ),
    caseGroup: saved?.caseGroup ?? "UNKNOWN",
    conversionDays: saved?.conversionDays ?? "UNKNOWN",
  };
}

/** A draft tariff may only show confirmed partial amounts; unanswered facts remain null. */
export function SueMonthForm({
  month,
  profileEffectiveFrom,
  profileRevision,
  ruleVersionId,
  groupId,
  savedBase,
  savedAllowance,
  currentBase,
  currentAllowance,
  disabled = false,
  onSaveBase,
  onSaveAllowance,
  onReload,
}: Props) {
  const base = currentBase ? savedBase : null;
  const allowance = currentAllowance ? savedAllowance : null;
  const baseSourceKey = JSON.stringify([currentBase, savedBase]);
  const allowanceSourceKey = JSON.stringify([currentAllowance, savedAllowance]);
  const [baseDraft, setBaseDraft] = useState(() => ({
    sourceKey: baseSourceKey,
    answers: baseAnswersFrom(base),
  }));
  const [allowanceDraft, setAllowanceDraft] = useState(() => ({
    sourceKey: allowanceSourceKey,
    answers: allowanceAnswersFrom(allowance),
  }));
  const baseAnswers =
    baseDraft.sourceKey === baseSourceKey ? baseDraft.answers : baseAnswersFrom(base);
  const allowanceAnswers =
    allowanceDraft.sourceKey === allowanceSourceKey
      ? allowanceDraft.answers
      : allowanceAnswersFrom(allowance);
  const [saving, setSaving] = useState<"base" | "allowance" | null>(null);
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

  async function save(target: "base" | "allowance") {
    if (disabled || !active.current || writing.current) return;
    writing.current = true;
    setSaving(target);
    setError(null);
    setMessage(null);
    try {
      if (target === "base") {
        await onSaveBase({
          month,
          profileEffectiveFrom,
          expectedProfileRevision: profileRevision,
          ruleVersionId,
          tariffApplicabilityConfirmed: fromAnswer(baseAnswers.tariffApplicabilityConfirmed),
          sueClassificationConfirmed: fromAnswer(baseAnswers.sueClassificationConfirmed),
          standardFullTimeConfirmed: fromAnswer(baseAnswers.standardFullTimeConfirmed),
          fullMonthBaseEntitlementConfirmed: fromAnswer(
            baseAnswers.fullMonthBaseEntitlementConfirmed,
          ),
          fullMonthSameContractConfirmed: fromAnswer(baseAnswers.fullMonthSameContractConfirmed),
          expectedRevision: savedBase?.revision ?? 0,
        });
      } else {
        await onSaveAllowance({
          month,
          profileEffectiveFrom,
          expectedProfileRevision: profileRevision,
          ruleVersionId,
          sectionXxivClassificationConfirmed: fromAnswer(
            allowanceAnswers.sectionXxivClassificationConfirmed,
          ),
          fullMonthAllowanceEntitlementConfirmed: fromAnswer(
            allowanceAnswers.fullMonthAllowanceEntitlementConfirmed,
          ),
          caseGroup:
            groupId === "s15" && allowanceAnswers.caseGroup !== "UNKNOWN"
              ? allowanceAnswers.caseGroup
              : null,
          conversionDays:
            allowanceAnswers.conversionDays === "UNKNOWN" ? null : allowanceAnswers.conversionDays,
          expectedRevision: savedAllowance?.revision ?? 0,
        });
      }
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
      if (active.current) setSaving(null);
    }
  }

  return (
    <FormScreen testID="sue-month-form">
      <FormSection title="SuE-Monatsangaben" caption={formatMonthTitle(month)}>
        <RemunerationText>
          Bestätige nur Angaben, die du aus Vertrag oder Abrechnung sicher kennst. Bei Unsicherheit
          „Ungeklärt“ wählen.
        </RemunerationText>
        <RemunerationText muted>
          Dieser Tarif ist noch ein Entwurf. Bestätigte Beträge sind Teilbeträge, keine fertige
          Gehaltsschätzung.
        </RemunerationText>
        {(!currentBase && savedBase) || (!currentAllowance && savedAllowance) ? (
          <RemunerationText>
            Frühere Angaben gehören zu einem anderen Profil- oder Regelstand. Bitte erneut prüfen.
          </RemunerationText>
        ) : null}
      </FormSection>
      <FormSection title="Grundentgelt">
        {baseFields.map(({ key, label }) => (
          <DropdownField<Answer>
            key={key}
            label={label}
            value={baseAnswers[key]}
            options={answerOptions}
            onChange={(value) => {
              if (!disabled && !writing.current)
                setBaseDraft({
                  sourceKey: baseSourceKey,
                  answers: { ...baseAnswers, [key]: value },
                });
            }}
          />
        ))}
        <PrimaryButton
          busy={saving === "base"}
          disabled={disabled || saving !== null}
          onPress={() => void save("base")}
        >
          Grundentgelt-Angaben speichern
        </PrimaryButton>
      </FormSection>
      <FormSection title="SuE-Zulage">
        {allowanceFields.map(({ key, label }) => (
          <DropdownField<Answer>
            key={key}
            label={label}
            value={allowanceAnswers[key]}
            options={answerOptions}
            onChange={(value) => {
              if (!disabled && !writing.current)
                setAllowanceDraft({
                  sourceKey: allowanceSourceKey,
                  answers: { ...allowanceAnswers, [key]: value },
                });
            }}
          />
        ))}
        {groupId === "s15" ? (
          <DropdownField<"UNKNOWN" | "6" | "OTHER">
            label="Fallgruppe S15"
            value={allowanceAnswers.caseGroup}
            options={caseOptions}
            onChange={(value) => {
              if (!disabled && !writing.current)
                setAllowanceDraft({
                  sourceKey: allowanceSourceKey,
                  answers: { ...allowanceAnswers, caseGroup: value },
                });
            }}
          />
        ) : null}
        <DropdownField<"UNKNOWN" | "NONE_CONFIRMED" | "TAKEN">
          label="Umwandlungstage"
          value={allowanceAnswers.conversionDays}
          options={conversionOptions}
          onChange={(value) => {
            if (!disabled && !writing.current)
              setAllowanceDraft({
                sourceKey: allowanceSourceKey,
                answers: { ...allowanceAnswers, conversionDays: value },
              });
          }}
        />
        <RemunerationText muted>
          Genommene oder ungeklärte Umwandlungstage werden hier nicht als voller Zulagenbetrag
          berechnet.
        </RemunerationText>
        <PrimaryButton
          busy={saving === "allowance"}
          disabled={disabled || saving !== null}
          onPress={() => void save("allowance")}
        >
          Zulagen-Angaben speichern
        </PrimaryButton>
      </FormSection>
      <FormSection title="Stand">
        <FormStatus error={error} />
        <FormStatus message={message} />
        <SecondaryButton disabled={disabled || saving !== null} onPress={onReload}>
          Aktuellen Stand laden
        </SecondaryButton>
      </FormSection>
    </FormScreen>
  );
}
