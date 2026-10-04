import { useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { formatMonthTitle } from "@/engine/calendar";
import {
  formatRemunerationDate,
  parseRemunerationDateInput,
} from "@/features/settings/remuneration-editor-values";
import { DropdownField } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import { MonthNavigator } from "@/ui/month-navigator";
import { setYouthBlockActivity, type YouthContextDraft } from "./youth-context-model";
import type { YouthBlockChoice } from "./youth-block-choices";

export function YouthBlockActivityFields({
  choices,
  editable,
  profileFrom,
  value,
  onChange,
}: {
  readonly choices: readonly YouthBlockChoice[];
  readonly editable: boolean;
  readonly profileFrom: string;
  readonly value: YouthContextDraft;
  readonly onChange: (value: YouthContextDraft) => void;
}) {
  const [month, setMonth] = useState(() => {
    try {
      return parseRemunerationDateInput(profileFrom).slice(0, 7);
    } catch {
      return Temporal.Now.plainDateISO().toString().slice(0, 7);
    }
  });
  const [selectedBinding, setSelectedBinding] = useState("");
  const [error, setError] = useState<string | null>(null);
  const available = choices.filter((choice) => choice.shift.date.startsWith(month + "-"));
  const selected = available.find((choice) => choice.binding === selectedBinding) ?? null;
  const status =
    selected && value.context.blockTrainingShiftIds.includes(selected.binding)
      ? "confirmed"
      : "unknown";
  function move(direction: -1 | 1) {
    setMonth(Temporal.PlainYearMonth.from(month).add({ months: direction }).toString());
    setSelectedBinding("");
    setError(null);
  }
  function changeStatus(next: "unknown" | "confirmed") {
    if (!editable || !selected) return;
    try {
      onChange(setYouthBlockActivity(value, selected.binding, next === "confirmed"));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ausbildungszuordnung bitte prüfen.");
    }
  }
  return (
    <FormSection
      title="Zusätzliche Ausbildung im Schulblock"
      caption="Nur ausdrücklich zugeordnete Ausbildungsmaßnahmen, keine automatische Deutung eines Dienstnamens."
    >
      <MonthNavigator
        label={formatMonthTitle(month)}
        onPrevious={() => move(-1)}
        onNext={() => move(1)}
      />
      {available.length ? (
        <>
          <DropdownField
            label="Dienst im bestätigten Schulblock"
            value={selected?.binding ?? ""}
            options={[
              { value: "", label: "Bitte Dienst wählen" },
              ...available.map((choice) => ({
                value: choice.binding,
                label: `${formatRemunerationDate(choice.shift.date)} · ${choice.shift.title} · ${choice.shift.startTime}–${choice.shift.endTime}`,
              })),
            ]}
            onChange={(binding) => {
              if (editable) setSelectedBinding(binding);
              setError(null);
            }}
          />
          {selected ? (
            <DropdownField
              label="War dies eine zusätzliche betriebliche Ausbildungsveranstaltung?"
              value={status}
              options={[
                { value: "unknown", label: "Nicht bestätigt" },
                { value: "confirmed", label: "Ja, für diesen Dienst bestätigt" },
              ]}
              onChange={changeStatus}
            />
          ) : null}
        </>
      ) : (
        <FormStatus message="Keine aktuellen Dienste mit bestätigter Pausenlage in einer erfassten Berufsschul-Blockwoche dieses Monats. Schulblock und Dienst zuerst unter Schulzeiten & Pausen erfassen." />
      )}
      <FormStatus
        error={error}
        message="Die Bestätigung gilt nur für diesen unveränderten Dienst mit seiner aktuellen Pausenlage. Sie allein gibt die Beschäftigung nicht frei; die gesetzliche Wochenprüfung bleibt maßgeblich."
      />
    </FormSection>
  );
}
