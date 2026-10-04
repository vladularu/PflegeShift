import { Temporal } from "@js-temporal/polyfill";
import { useEffect, useRef, useState } from "react";
import { userFacingErrorMessage } from "@/domain/errors";
import type {
  SavedTvoedAnnexAPremiumFacts,
  SaveTvoedAnnexAPremiumFactsInput,
  TvoedAnnexADraftDayDecision,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import { formatMonthTitle } from "@/engine/calendar";
import { DropdownField, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { successFeedback } from "@/ui/haptics";
import {
  currentAnnexAPremiumDayDecision,
  type AnnexAPremiumDayChoice,
} from "./annex-a-premium-facts-model";
import { RemunerationText } from "./remuneration-positions";

type Answer = "UNKNOWN" | "YES" | "NO";
type WorkKind = "UNKNOWN" | "REGULAR_ACTIVE" | "SPECIAL";
const yesNo = [
  { value: "UNKNOWN", label: "Ungeklärt" },
  { value: "YES", label: "Ja" },
  { value: "NO", label: "Nein" },
] as const;
const workKinds = [
  { value: "UNKNOWN", label: "Ungeklärt" },
  { value: "REGULAR_ACTIVE", label: "Reguläre aktive Arbeit" },
  { value: "SPECIAL", label: "Sonderfall / nicht regulär" },
] as const;
const localAgreements = [
  { value: "UNKNOWN", label: "Ungeklärt" },
  { value: "NONE_CONFIRMED", label: "Keine abweichende Vereinbarung bestätigt" },
  { value: "DIFFERENT", label: "Abweichende Vereinbarung vorhanden" },
] as const;

interface DayAnswers {
  readonly workKind: WorkKind;
  readonly holidayTimeOff: Answer;
  readonly shiftWork: Answer;
  readonly legacyAngestellteClass: Answer;
}
interface Answers {
  readonly cashPaymentConfirmed: Answer;
  readonly localAgreement: SavedTvoedAnnexAPremiumFacts["localAgreement"];
  readonly days: Readonly<Record<string, DayAnswers>>;
}

const answer = (value: boolean | null): Answer =>
  value === null ? "UNKNOWN" : value ? "YES" : "NO";
const fromAnswer = (value: Answer): boolean | null =>
  value === "UNKNOWN" ? null : value === "YES";

function answersFrom(
  choices: readonly AnnexAPremiumDayChoice[],
  saved: SavedTvoedAnnexAPremiumFacts | null,
): Answers {
  return {
    cashPaymentConfirmed: answer(saved?.cashPaymentConfirmed ?? null),
    localAgreement: saved?.localAgreement ?? "UNKNOWN",
    days: Object.fromEntries(
      choices.map((choice) => {
        const decision = currentAnnexAPremiumDayDecision(choice, saved);
        return [
          choice.key,
          {
            workKind: decision?.workKind ?? "UNKNOWN",
            holidayTimeOff: answer(decision?.holidayTimeOff ?? null),
            shiftWork: answer(decision?.shiftWork ?? null),
            legacyAngestellteClass: answer(decision?.legacyAngestellteClass ?? null),
          },
        ];
      }),
    ),
  };
}

interface Props {
  readonly month: string;
  readonly profileEffectiveFrom: string;
  readonly profileRevision: number;
  readonly ruleVersionId: string;
  readonly choices: readonly AnnexAPremiumDayChoice[];
  readonly holidays: ReadonlyMap<string, unknown> | null;
  readonly saved: SavedTvoedAnnexAPremiumFacts | null;
  readonly current: boolean;
  readonly disabled?: boolean;
  readonly onSave: (
    input: SaveTvoedAnnexAPremiumFactsInput,
  ) => Promise<SavedTvoedAnnexAPremiumFacts>;
  readonly onReload: () => void;
}

/** User confirmations are bound to each actual shift revision and local work day. */
export function AnnexAPremiumFactsForm({
  month,
  profileEffectiveFrom,
  profileRevision,
  ruleVersionId,
  choices,
  holidays,
  saved,
  current,
  disabled = false,
  onSave,
  onReload,
}: Props) {
  const sourceKey = JSON.stringify([current, saved, choices.map((choice) => choice.shiftBinding)]);
  const source = current ? saved : null;
  const [draft, setDraft] = useState(() => ({ sourceKey, answers: answersFrom(choices, source) }));
  const answers = draft.sourceKey === sourceKey ? draft.answers : answersFrom(choices, source);
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

  const updateDay = (key: string, value: Partial<DayAnswers>) => {
    if (disabled || writing.current) return;
    setDraft({
      sourceKey,
      answers: {
        ...answers,
        days: { ...answers.days, [key]: { ...answers.days[key], ...value } },
      },
    });
  };

  async function save() {
    if (disabled || writing.current || !active.current) return;
    writing.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const dayDecisions: TvoedAnnexADraftDayDecision[] = choices.map((choice) => {
        const day = answers.days[choice.key];
        return {
          shiftId: choice.shift.id,
          date: choice.date,
          origin: "confirmed",
          shiftBinding: choice.shiftBinding,
          workKind: day.workKind === "UNKNOWN" ? null : day.workKind,
          holidayTimeOff: fromAnswer(day.holidayTimeOff),
          shiftWork: fromAnswer(day.shiftWork),
          legacyAngestellteClass: fromAnswer(day.legacyAngestellteClass),
        };
      });
      const result = await onSave({
        month,
        profileEffectiveFrom,
        expectedProfileRevision: profileRevision,
        ruleVersionId,
        cashPaymentConfirmed: fromAnswer(answers.cashPaymentConfirmed),
        localAgreement: answers.localAgreement,
        dayDecisions,
        expectedRevision: revision,
      });
      if (!active.current) return;
      setRevision(result.revision);
      setMessage("Arbeitsfakten gespeichert. Ungeklärte oder Sonderfälle bleiben unberechenbar.");
      successFeedback();
    } catch (cause) {
      if (active.current)
        setError(userFacingErrorMessage(cause, "Speichern fehlgeschlagen. Bitte Stand neu laden."));
    } finally {
      writing.current = false;
      if (active.current) setSaving(false);
    }
  }

  return (
    <FormScreen testID="annex-a-premium-facts-form">
      <FormSection title="TVöD-Zuschlagsangaben" caption={formatMonthTitle(month)}>
        <RemunerationText>
          Bestätige nur tatsächliche Arbeit und vertragliche Angaben. Dienstvorlagen und geschätzte
          Pausen belegen keinen Zuschlagsanspruch.
        </RemunerationText>
        {!current && saved ? (
          <RemunerationText>
            Frühere Angaben gehören zu einem anderen Profil- oder Regelstand und werden nicht
            übernommen.
          </RemunerationText>
        ) : null}
        {holidays === null ? (
          <RemunerationText>Die Feiertagsregeln sind derzeit nicht verfügbar.</RemunerationText>
        ) : null}
      </FormSection>
      <FormSection title="Vertragliche Voraussetzungen">
        <DropdownField<Answer>
          label="Geldzahlung für Zuschläge bestätigt"
          value={answers.cashPaymentConfirmed}
          options={yesNo}
          onChange={(value) => {
            if (!disabled && !writing.current)
              setDraft({ sourceKey, answers: { ...answers, cashPaymentConfirmed: value } });
          }}
        />
        <DropdownField<SavedTvoedAnnexAPremiumFacts["localAgreement"]>
          label="Abweichende örtliche Vereinbarung"
          value={answers.localAgreement}
          options={localAgreements}
          onChange={(value) => {
            if (!disabled && !writing.current)
              setDraft({ sourceKey, answers: { ...answers, localAgreement: value } });
          }}
        />
      </FormSection>
      {choices.length === 0 ? (
        <FormSection title="Dienste">
          <RemunerationText>Keine zeitgebundenen Dienste in diesem Monat.</RemunerationText>
        </FormSection>
      ) : null}
      {choices.map((choice) => {
        const day = answers.days[choice.key];
        const saturday = Temporal.PlainDate.from(choice.date).dayOfWeek === 6;
        const holiday = holidays?.has(choice.date) ?? false;
        return (
          <FormSection key={choice.key} title={`${choice.date} · ${choice.shift.title}`}>
            <DropdownField<WorkKind>
              label="Arbeitsart an diesem Tag"
              value={day.workKind}
              options={workKinds}
              onChange={(value) => updateDay(choice.key, { workKind: value })}
            />
            {holiday ? (
              <DropdownField<Answer>
                label="Freizeitausgleich für Feiertagsarbeit"
                value={day.holidayTimeOff}
                options={yesNo}
                onChange={(value) => updateDay(choice.key, { holidayTimeOff: value })}
              />
            ) : null}
            {saturday ? (
              <DropdownField<Answer>
                label="Schichtarbeit am Samstag"
                value={day.shiftWork}
                options={yesNo}
                onChange={(value) => updateDay(choice.key, { shiftWork: value })}
              />
            ) : null}
            {saturday && day.shiftWork === "YES" ? (
              <DropdownField<Answer>
                label="Altvertragliche Angestellten-Regelung"
                value={day.legacyAngestellteClass}
                options={yesNo}
                onChange={(value) => updateDay(choice.key, { legacyAngestellteClass: value })}
              />
            ) : null}
          </FormSection>
        );
      })}
      <FormSection title="Speichern">
        <PrimaryButton busy={saving} disabled={disabled || saving} onPress={() => void save()}>
          Zuschlagsangaben speichern
        </PrimaryButton>
        <FormStatus error={error} />
        <FormStatus message={message} />
        <SecondaryButton disabled={disabled || saving} onPress={onReload}>
          Aktuellen Stand laden
        </SecondaryButton>
      </FormSection>
    </FormScreen>
  );
}
