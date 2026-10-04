import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRemunerationHistory } from "@/application/remuneration-provider";
import { usePflegeShiftTariff } from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import type { MonthlyAllowanceDecisions } from "@/domain/allowance-decisions";
import type { AllowanceStatus } from "@/domain/types";
import { ALLOWANCE_STATUSES } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { formatMonthTitle } from "@/engine/calendar";
import {
  formatRemunerationDate,
  parseRemunerationDateInput,
} from "@/features/settings/remuneration-editor-values";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { DropdownField, Field, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { successFeedback } from "@/ui/haptics";
import {
  ALLOWANCE_CONFIRMATION_LABELS,
  allowanceConfirmationPeriods,
  prepareAllowanceConfirmation,
} from "./allowance-confirmation-model";

export function AllowanceConfirmationScreen({
  month,
  onClose,
}: {
  readonly month: string;
  readonly onClose: () => void;
}) {
  const history = useRemunerationHistory();
  const [initial, setInitial] = useState<MonthlyAllowanceDecisions | null>(null);
  useEffect(() => {
    if (initial !== null || history.status !== "ready") return;
    setInitial(
      history.allowanceDecisions.find((item) => item.month === month) ?? {
        month,
        revision: 0,
        updatedAt: null,
        decisions: [],
      },
    );
  }, [history.allowanceDecisions, history.status, initial, month]);
  async function reload() {
    setInitial(null);
    await history.reload();
  }
  if (initial === null) {
    if (history.status === "error")
      return (
        <LoadFailureView
          message={history.error ?? "Vergütungsdaten nicht verfügbar."}
          onRetry={() => void reload()}
        />
      );
    return <LoadingView />;
  }
  return (
    <AllowanceConfirmationForm initial={initial} onClose={onClose} onReload={() => void reload()} />
  );
}

function AllowanceConfirmationForm({
  initial,
  onClose,
  onReload,
}: {
  readonly initial: MonthlyAllowanceDecisions;
  readonly onClose: () => void;
  readonly onReload: () => void;
}) {
  const history = useRemunerationHistory();
  const { tariffDecisions } = usePflegeShiftTariff();
  const { resolver } = useRuleCatalogRuntime();
  const palette = usePalette();
  const [current, setCurrent] = useState(initial);
  const [initialProfiles] = useState(() => JSON.stringify(history.profiles));
  const [initialDecision] = useState(() => JSON.stringify(initial));
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [status, setStatus] = useState<AllowanceStatus | "UNSET">("UNSET");
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
  const periodResult = useMemo(() => {
    try {
      return {
        periods: allowanceConfirmationPeriods(initial.month, history.profiles, resolver),
        error: null,
      };
    } catch {
      return { periods: [], error: "Die Tarifzeiträume konnten nicht geprüft werden." };
    }
  }, [history.profiles, initial.month, resolver]);
  const legacy = tariffDecisions.find((decision) => decision.month === initial.month);
  const liveDecision = history.allowanceDecisions.find((item) => item.month === initial.month) ?? {
    month: initial.month,
    revision: 0,
    updatedAt: null,
    decisions: [],
  };
  const liveDecisionKey = JSON.stringify(liveDecision);
  const changed =
    JSON.stringify(history.profiles) !== initialProfiles ||
    (liveDecisionKey !== initialDecision && liveDecisionKey !== JSON.stringify(current));
  const ready = history.status === "ready" && periodResult.error === null && !changed;
  const readyRef = useRef(ready);
  useLayoutEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  const textStyle = { color: palette.text, ...TYPOGRAPHY.body };

  async function save(clear = false) {
    if (savingRef.current || !active.current) return;
    if (!readyRef.current) {
      setError("Bitte zuerst die Vergütungsdaten erneut laden.");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const input = clear
        ? { month: initial.month, expectedRevision: current.revision, decisions: [] }
        : prepareAllowanceConfirmation({
            month: initial.month,
            from: parseRemunerationDateInput(from),
            through: parseRemunerationDateInput(through),
            status,
            history: history.profiles,
            current,
            resolver,
          });
      savingRef.current = true;
      setSaving(true);
      const saved = await history.saveAllowanceDecisions(input);
      if (!active.current) return;
      setCurrent(saved);
      setMessage(
        clear
          ? "Zeitbezogene Bestätigungen entfernt."
          : "Zulage für den gewählten Zeitraum bestätigt.",
      );
      successFeedback();
    } catch (saveError) {
      if (active.current)
        setError(
          userFacingErrorMessage(
            saveError,
            "Speichern fehlgeschlagen. Bitte Zeitraum und aktuellen Vergütungsstand prüfen. Deine Eingaben bleiben erhalten.",
          ),
        );
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  }

  return (
    <FormScreen>
      <FormSection title="Zulage bestätigen" caption={formatMonthTitle(initial.month)}>
        <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={textStyle}>
          Deine Festlegung gilt nur für den ausgewählten Zeitraum und Tarif. Sie ist keine
          Bestätigung durch den Arbeitgeber.
        </Text>
      </FormSection>
      <FormSection title="Tarifzeiträume">
        {periodResult.periods.map((period) => (
          <View key={period.from} style={{ gap: SPACING.sm }}>
            <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={textStyle}>
              {formatRemunerationDate(period.from)} – {formatRemunerationDate(period.through)}
            </Text>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
            >
              {period.label}
            </Text>
            {period.available ? (
              <SecondaryButton
                disabled={saving || !ready}
                onPress={() => {
                  setFrom(formatRemunerationDate(period.from));
                  setThrough(formatRemunerationDate(period.through));
                  setError(null);
                  setMessage(null);
                }}
              >
                Zeitraum ab {formatRemunerationDate(period.from)} wählen
              </SecondaryButton>
            ) : null}
          </View>
        ))}
      </FormSection>
      {legacy ? (
        <FormSection
          title="Bisheriger Monatswert"
          caption="Ohne gespeicherte Tarifzuordnung. Erst nach deiner Auswahl erneut bestätigt."
        >
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={textStyle}>
            {ALLOWANCE_CONFIRMATION_LABELS[legacy.allowanceStatus]}
          </Text>
          <SecondaryButton
            disabled={saving || !ready}
            onPress={() => setStatus(legacy.allowanceStatus)}
          >
            Bisherigen Wert auswählen
          </SecondaryButton>
        </FormSection>
      ) : null}
      <FormSection title="Deine Festlegung">
        <Field
          label="Gültig von"
          placeholder="TT.MM.JJJJ"
          value={from}
          onChangeText={setFrom}
          editable={!saving && ready}
          keyboardType="numbers-and-punctuation"
        />
        <Field
          label="Gültig bis"
          placeholder="TT.MM.JJJJ"
          value={through}
          onChangeText={setThrough}
          editable={!saving && ready}
          keyboardType="numbers-and-punctuation"
        />
        <View pointerEvents={saving || !ready ? "none" : "auto"}>
          <DropdownField
            label="Zulagenart"
            value={status}
            onChange={(value) => {
              if (!savingRef.current && ready) setStatus(value);
            }}
            options={[
              { value: "UNSET" as const, label: "Bitte auswählen" },
              ...ALLOWANCE_STATUSES.map((value) => ({
                value,
                label: ALLOWANCE_CONFIRMATION_LABELS[value],
              })),
            ]}
          />
        </View>
        <FormStatus
          error={
            error ??
            (changed
              ? "Der geladene Vergütungsstand wurde geändert. Bitte neu laden. Deine Eingaben bleiben erhalten."
              : null) ??
            periodResult.error ??
            history.error
          }
          message={message}
        />
        {history.status !== "ready" ? (
          <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={textStyle}>
            {history.status === "loading"
              ? "Vergütungsdaten werden geladen."
              : "Bitte den aktuellen Stand erneut laden."}
          </Text>
        ) : null}
        <PrimaryButton busy={saving} disabled={!ready} onPress={() => void save()}>
          Zeitraum bestätigen
        </PrimaryButton>
      </FormSection>
      {current.decisions.length > 0 ? (
        <FormSection title="Gespeicherte Bestätigungen">
          {current.decisions.map((decision) => (
            <View key={decision.from} style={{ gap: SPACING.xxs }}>
              <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={textStyle}>
                {formatRemunerationDate(decision.from)} – {formatRemunerationDate(decision.through)}
              </Text>
              <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={textStyle}>
                {ALLOWANCE_CONFIRMATION_LABELS[decision.allowanceStatus]}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
              >
                {decision.tariff.packageId} · {decision.tariff.variant} · {decision.tariff.region}
              </Text>
            </View>
          ))}
          <SecondaryButton
            disabled={saving || !ready}
            onPress={() =>
              Alert.alert(
                "Bestätigungen für diesen Monat entfernen?",
                "Nur die zeitbezogenen Festlegungen werden entfernt. Die bisherige undatierte Monatsentscheidung bleibt erhalten.",
                [
                  { text: "Abbrechen", style: "cancel" },
                  { text: "Entfernen", style: "destructive", onPress: () => void save(true) },
                ],
              )
            }
          >
            Zeitbezogene Bestätigungen entfernen
          </SecondaryButton>
        </FormSection>
      ) : null}
      <SecondaryButton disabled={saving} onPress={onReload}>
        Aktuellen Stand neu laden
      </SecondaryButton>
      <SecondaryButton disabled={saving} onPress={onClose}>
        Zurück zur Einschätzung
      </SecondaryButton>
    </FormScreen>
  );
}
