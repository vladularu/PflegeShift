import { Temporal } from "@js-temporal/polyfill";
import { View } from "react-native";
import { validateTvlBurnCareIntervals, type TvlBurnCareInterval } from "@/domain/tvl-burn-care";
import { DropdownField, Field, ResponsiveFieldRow, SecondaryButton } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import { SPACING } from "@/theme/tokens";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";

export type TvlBurnCareDraft =
  readonly { readonly from: string; readonly until: string }[] | null | undefined;
export const draftBurnCare = (
  value: readonly TvlBurnCareInterval[] | null | undefined,
): TvlBurnCareDraft =>
  value == null
    ? value
    : value.map((interval) => ({ from: String(interval.from), until: String(interval.until) }));
export function parseBurnCareDraft(value: TvlBurnCareDraft) {
  if (value == null) return value;
  return validateTvlBurnCareIntervals(
    value.map((interval) => {
      if (!/^\d{1,4}$/u.test(interval.from.trim()) || !/^\d{1,4}$/u.test(interval.until.trim()))
        throw new Error(
          "Bitte Beginn und Ende der Schwerbrandpflege in ganzen Minuten ab Dienstbeginn eingeben.",
        );
      return { from: Number(interval.from), until: Number(interval.until) };
    }),
  );
}
export function TvlBurnCareFields({
  value,
  onChange,
  disabled,
  startEpochMinutes,
  timeZone,
}: {
  readonly value: TvlBurnCareDraft;
  readonly onChange: (value: TvlBurnCareDraft) => void;
  readonly disabled: boolean;
  readonly startEpochMinutes: number | null;
  readonly timeZone: string;
}) {
  const localTime = (offset: string) => {
    const local = Temporal.Instant.fromEpochMilliseconds(
      ((startEpochMinutes ?? 0) + Number(offset)) * 60_000,
    ).toZonedDateTimeISO(timeZone);
    return `${formatRemunerationDate(local.toPlainDate().toString())} ${local.toPlainTime().toString().slice(0, 5)} (${local.offset})`;
  };
  const state = value == null ? "UNKNOWN" : value.length ? "INTERVALS" : "NONE";
  const change = (index: number, key: "from" | "until", text: string) =>
    onChange(value?.map((row, i) => (i === index ? { ...row, [key]: text } : row)));
  return (
    <FormSection
      title="Schwerbrandpflegezeiten"
      caption="Nur tatsächlich geleistete qualifizierende Pflege ohne Pausen. Der Anspruch wird separat im Vergütungsprofil bestätigt."
    >
      <DropdownField
        label="Tätigkeitszeiten"
        value={state}
        onChange={(choice) => {
          if (!disabled)
            onChange(
              choice === "UNKNOWN" ? null : choice === "NONE" ? [] : [{ from: "", until: "" }],
            );
        }}
        options={[
          { value: "UNKNOWN", label: "Noch ungeklärt" },
          { value: "NONE", label: "Keine Tätigkeit in diesem Dienstzeitraum" },
          { value: "INTERVALS", label: "Tatsächliche Zeiten erfassen" },
        ]}
      />
      {value?.length ? (
        <FormStatus message="Zeiten als Minuten nach Dienstbeginn: 0 = Beginn, 90 = eineinhalb Stunden später. Unterbrechungen/Pausen nicht einschließen; mehrere Zeitabschnitte sind möglich. So bleiben Nacht- und Zeitumstellungsdienste eindeutig." />
      ) : null}
      {value?.map((interval, i) => (
        <View key={i} style={{ gap: SPACING.sm }}>
          <ResponsiveFieldRow>
            <Field
              label={`Abschnitt ${i + 1}: Beginn ab Dienststart (Minuten)`}
              value={interval.from}
              keyboardType="number-pad"
              editable={!disabled}
              onChangeText={(text) => change(i, "from", text)}
            />
            <Field
              label={`Abschnitt ${i + 1}: Ende ab Dienststart (Minuten)`}
              value={interval.until}
              keyboardType="number-pad"
              editable={!disabled}
              onChangeText={(text) => change(i, "until", text)}
            />
          </ResponsiveFieldRow>
          {startEpochMinutes !== null &&
          /^\d{1,4}$/u.test(interval.from) &&
          /^\d{1,4}$/u.test(interval.until) ? (
            <FormStatus
              message={`${localTime(interval.from)} bis ${localTime(interval.until)} · ${Number(interval.until) - Number(interval.from)} Minuten`}
            />
          ) : null}
          <SecondaryButton
            disabled={disabled}
            onPress={() => onChange(value.filter((_, index) => index !== i))}
          >
            Abschnitt {i + 1} entfernen
          </SecondaryButton>
        </View>
      ))}
      {value && value.length > 0 && value.length < 96 ? (
        <SecondaryButton
          disabled={disabled}
          onPress={() => onChange([...value, { from: "", until: "" }])}
        >
          Zeitabschnitt hinzufügen
        </SecondaryButton>
      ) : null}
      <FormStatus message="Die Monatsrechnung schätzt volle Stunden aus den erfassten Tätigkeitsminuten. Fehlende oder nach Dienständerung veraltete Zeiten bleiben ungeklärt. Regelbetrag und Anrechnung stammen aus dem Tarifpaket." />
    </FormSection>
  );
}
