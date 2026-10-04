import { Stack } from "expo-router";
import { SheetBackFooter } from "@/ui/sheet-back-footer";
import { useEffect, useRef, useState } from "react";
import { TextInput } from "react-native";
import { useRemunerationHistory } from "@/application/remuneration-provider";
import { userFacingErrorMessage } from "@/domain/errors";
import type { RemunerationProfileData } from "@/domain/remuneration-profile";
import type { Industry } from "@/domain/types";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { usePalette } from "@/theme/palette";
import { Field, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus, HeaderSaveAction } from "@/ui/form-layout";
import { focusInvalidField, weeklyHoursFieldError } from "@/ui/form-validation";
import { ownBaseError } from "./own-remuneration-form";
import {
  formatRemunerationDate,
  parseRemunerationDateInput,
  remunerationDataFromForm,
  remunerationFormValues,
  type RemunerationFormValues,
} from "./remuneration-editor-values";
import { RemunerationFields } from "./remuneration-fields";
import { remunerationTariffOptions } from "./remuneration-tariff-options";

export interface RemunerationEditorSession {
  readonly data: RemunerationProfileData;
  readonly effectiveFrom: string | null;
  readonly revision: number;
  readonly simple?: boolean;
  readonly industry?: Industry;
}

export function RemunerationEditorForm({
  session,
  onClose,
  saveIndustry,
}: {
  readonly session: RemunerationEditorSession;
  readonly onClose: () => void;
  readonly saveIndustry?: (industry: Industry | null) => Promise<void>;
}) {
  const history = useRemunerationHistory();
  const [industry, setIndustry] = useState<Industry | null>(session.industry ?? null);
  const palette = usePalette();
  const runtime = useRuleCatalogRuntime();
  const [catalogResolver, setCatalogResolver] = useState(() => runtime.resolver);
  const catalogChanged = runtime.resolver !== catalogResolver;
  const [values, setValues] = useState<RemunerationFormValues>(() =>
    remunerationFormValues(session.data),
  );
  const [effectiveDate, setEffectiveDate] = useState(
    session.effectiveFrom === null ? "" : formatRemunerationDate(session.effectiveFrom),
  );
  const [revision, setRevision] = useState(session.revision);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dateRef = useRef<TextInput>(null);
  const weeklyRef = useRef<TextInput>(null);
  const amountRef = useRef<TextInput>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  let options: ReturnType<typeof remunerationTariffOptions> | null = null;
  try {
    options = remunerationTariffOptions(parseRemunerationDateInput(effectiveDate), catalogResolver);
  } catch {
    /* Date validation is shown on submit. */
  }

  async function submit() {
    if (savingRef.current || !active.current) return;
    if (values.salaryMode === "TARIFF" && catalogChanged) {
      setError(
        "Der Tarifkatalog hat sich geändert. Bitte den aktuellen Tarifstand ausdrücklich übernehmen.",
      );
      return;
    }
    if (history.status !== "ready") {
      setError("Bitte zuerst die Vergütungshistorie erneut laden.");
      return;
    }
    setError(null);
    setMessage(null);
    let date: string;
    try {
      date = parseRemunerationDateInput(effectiveDate);
    } catch (dateError) {
      const text = userFacingErrorMessage(
        dateError,
        "Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.",
      );
      setError(text);
      focusInvalidField(dateRef, text);
      return;
    }
    const hoursError = weeklyHoursFieldError(values.weeklyHours);
    const amountError =
      values.salaryMode === "MANUAL"
        ? ownBaseError(values.manualMonthlyGross, values.own.baseKind)
        : null;
    if (hoursError || amountError) {
      const text = hoursError ?? amountError!;
      setError(text);
      focusInvalidField(hoursError ? weeklyRef : amountRef, text);
      return;
    }
    try {
      const data = remunerationDataFromForm(values, date, catalogResolver);
      savingRef.current = true;
      setSaving(true);
      const saved = await history.saveProfile({
        effectiveFrom: date,
        data,
        expectedRevision: revision,
      });
      if (!active.current) return;
      setRevision(saved.revision);
      if (session.simple && industry !== (session.industry ?? null)) await saveIndustry?.(industry);
      if (!active.current) return;
      setEffectiveDate(formatRemunerationDate(date));
      setMessage(`Vergütungsstand ab ${formatRemunerationDate(date)} gespeichert.`);
      if (session.simple) onClose();
    } catch (saveError) {
      if (active.current)
        setError(
          userFacingErrorMessage(
            saveError,
            "Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten.",
          ),
        );
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  }

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: "Gehalt",
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          statusBarStyle: palette.dark ? "light" : "dark",
          headerRight: () => (
            <HeaderSaveAction
              busy={saving || history.status !== "ready"}
              closes={session.simple ?? false}
              label="Speichern"
              onPress={() => void submit()}
            />
          ),
        }}
      />
      <RemunerationFields
        catalog={options}
        compact={session.simple}
        industry={industry ?? undefined}
        onIndustryChange={setIndustry}
        values={values}
        onChange={(change) => {
          setValues((current) => ({ ...current, ...change }));
          setMessage(null);
        }}
        busy={saving}
        weeklyRef={weeklyRef}
        amountRef={amountRef}
      />
      {!session.simple ? (
        <FormSection
          title={revision === 0 ? "Neuer Vergütungsstand" : "Vergütungsstand korrigieren"}
          caption={
            revision === 0
              ? "Ab diesem Datum gelten die neuen Angaben. Frühere Stände bleiben erhalten."
              : "Eine Korrektur ändert diesen bestehenden Stand. Für einen Wechsel lege einen neuen Stand an."
          }
        >
          <Field
            label="Gültig ab"
            value={effectiveDate}
            inputRef={dateRef}
            onChangeText={setEffectiveDate}
            placeholder="TT.MM.JJJJ"
            accessibilityHint="Datum mit Tag, Monat und Jahr"
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            maxLength={10}
            editable={!saving && revision === 0}
          />
        </FormSection>
      ) : null}
      {catalogChanged && values.salaryMode === "TARIFF" ? (
        <>
          <FormStatus error="Der Tarifkatalog hat sich geändert. Deine Auswahl bleibt erhalten; bitte aktuellen Stand übernehmen und prüfen." />
          <SecondaryButton
            disabled={saving}
            onPress={() => {
              setCatalogResolver(() => runtime.resolver);
              setError(null);
              setMessage(null);
            }}
          >
            Aktuellen Tarifstand übernehmen
          </SecondaryButton>
        </>
      ) : null}
      <FormStatus error={error} message={message} />
      {history.status === "error" ? (
        <>
          <FormStatus error={history.error} />
          <SecondaryButton disabled={saving} onPress={() => void history.reload()}>
            Historie erneut laden
          </SecondaryButton>
        </>
      ) : null}
      {session.simple ? (
        <SheetBackFooter disabled={saving} onPress={onClose} />
      ) : (
        <SecondaryButton disabled={saving} onPress={onClose}>
          {message ? "Zur Übersicht" : "Abbrechen"}
        </SecondaryButton>
      )}
    </FormScreen>
  );
}
