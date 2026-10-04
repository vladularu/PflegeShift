import { useEffect, useRef, useState } from "react";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import { isCurrentTvlShiftWork, isCurrentTvlServiceFacts } from "@/domain/saved-tvl-shift-work";
import { requireTvlBurnCareIntervalParents } from "@/engine/tvl-burn-care-intervals";
import { remunerationShiftDays } from "@/engine/remuneration-shift-days";
import { userFacingErrorMessage } from "@/domain/errors";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";
import { DropdownField, PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus } from "@/ui/form-layout";
import { successFeedback } from "@/ui/haptics";
import { RemunerationText } from "./remuneration-positions";
import { tvlShiftWorkChoices, type TvlShiftWorkSession } from "./tvl-shift-work-model";
import {
  TvlBurnCareFields,
  draftBurnCare,
  parseBurnCareDraft,
  type TvlBurnCareDraft,
} from "./tvl-burn-care-fields";

type Choice = "YES" | "NO" | "UNKNOWN";
export function TvlShiftWorkForm({
  session,
  onClose,
  onReload,
}: {
  readonly session: TvlShiftWorkSession;
  readonly onClose: () => void;
  readonly onReload: () => void;
}) {
  const history = useRemunerationData();
  const root = usePflegeShiftStatus();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const [current, setCurrent] = useState(session.saved);
  const [value, setValue] = useState<Choice>(() =>
    session.saved &&
    isCurrentTvlShiftWork(session.saved, session.shift, session.timeZone, session.profile)
      ? session.saved.shiftWork
        ? "YES"
        : "NO"
      : "UNKNOWN",
  );
  const [saving, setSaving] = useState(false);
  const [burnDraft, setBurnDraft] = useState<TvlBurnCareDraft>(() =>
    session.saved &&
    isCurrentTvlServiceFacts(session.saved, session.shift, session.timeZone, session.profile)
      ? draftBurnCare(session.saved.burnCareIntervals)
      : undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const writing = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const live = tvlShiftWorkChoices(
    session.month,
    entries,
    history.profiles,
    profile?.timeZone ?? session.timeZone,
  ).find((c) => c.key === session.key);
  const liveSaved =
    history.tvlShiftWork.find(
      (r) =>
        r.shiftId === session.shift.id && r.profileEffectiveFrom === session.profile.effectiveFrom,
    ) ?? null;
  const changed =
    !live ||
    JSON.stringify(live.shift) !== JSON.stringify(session.shift) ||
    JSON.stringify(live.profile) !== JSON.stringify(session.profile) ||
    JSON.stringify(live.dates) !== JSON.stringify(session.dates) ||
    profile?.timeZone !== session.timeZone ||
    JSON.stringify(liveSaved) !== JSON.stringify(current);
  const ready = root.ready && !root.error && history.status === "ready" && !changed;
  async function save() {
    if (!active.current || writing.current || !ready) return;
    writing.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const burnCareIntervals = parseBurnCareDraft(burnDraft);
      if (burnCareIntervals != null)
        requireTvlBurnCareIntervalParents(
          burnCareIntervals,
          session.shift,
          session.timeZone,
          session.profile,
          history.profiles,
        );
      const saved = await history.saveTvlShiftWork({
        ...(burnCareIntervals === undefined ? {} : { burnCareIntervals }),
        shiftId: session.shift.id,
        expectedShiftRevision: session.shift.revision,
        expectedShiftUpdatedAt: session.shift.updatedAt,
        timeZone: session.timeZone,
        profileEffectiveFrom: session.profile.effectiveFrom!,
        expectedProfileRevision: session.profile.revision,
        expectedRevision: current?.revision ?? 0,
        shiftWork: value === "UNKNOWN" ? null : value === "YES",
      });
      if (!active.current) return;
      setCurrent(saved);
      setMessage(
        burnDraft !== undefined
          ? "Dienstangaben gespeichert. Fehlende Bestätigungen bleiben ungeklärt."
          : saved.shiftWork === null
            ? "Angabe aufgehoben. Der Schichtarbeitsbezug ist ungeklärt."
            : "Schichtarbeitsbezug gespeichert.",
      );
      successFeedback();
    } catch (cause) {
      if (active.current)
        setError(
          userFacingErrorMessage(
            cause,
            "Speichern fehlgeschlagen. Deine Auswahl bleibt erhalten. Bitte aktuellen Stand prüfen.",
          ),
        );
    } finally {
      writing.current = false;
      if (active.current) setSaving(false);
    }
  }
  return (
    <FormScreen testID="tvl-shift-work-form">
      <FormSection title={session.shift.title} caption={formatRemunerationDate(session.shift.date)}>
        <RemunerationText>
          {session.shift.startTime}–{session.shift.endTime} · Vergütung ab{" "}
          {formatRemunerationDate(session.profile.effectiveFrom!)}
        </RemunerationText>
        <RemunerationText>
          Erfolgt dieser Dienst im Rahmen von Schicht- oder Wechselschichtarbeit? Maßgeblich ist die
          tarifliche Einordnung, nicht der Name des Dienstes.
        </RemunerationText>
        <RemunerationText muted>
          Diese Angabe wird für die TV-L-/TVA-L-Samstagszuschläge verwendet. Bei Unsicherheit
          „Ungeklärt“ wählen und die Einordnung mit dem Arbeitgeber klären. Dienstzeiten und
          Zeitsaldo bleiben unverändert.
        </RemunerationText>
      </FormSection>
      <FormSection title="Schichtarbeitsbezug">
        <DropdownField<Choice>
          label="Schicht- oder Wechselschichtarbeit"
          value={value}
          options={[
            { value: "UNKNOWN", label: "Ungeklärt" },
            { value: "YES", label: "Ja" },
            { value: "NO", label: "Nein" },
          ]}
          onChange={(next) => {
            if (ready && !writing.current) {
              setValue(next);
              setError(null);
              setMessage(null);
            }
          }}
        />
      </FormSection>
      <TvlBurnCareFields
        value={burnDraft}
        disabled={!ready || saving}
        timeZone={session.timeZone}
        startEpochMinutes={
          remunerationShiftDays(session.shift, session.timeZone)[0]?.fromEpochMinutes ?? null
        }
        onChange={(next) => {
          if (ready && !writing.current) {
            setBurnDraft(next);
            setError(null);
            setMessage(null);
          }
        }}
      />
      <FormSection title="Dienstangaben speichern">
        <FormStatus
          error={
            error ??
            root.error ??
            history.error ??
            (!saving && changed
              ? "Dienst, Vergütung oder Bestätigung wurden geändert. Bitte aktuellen Stand laden."
              : null)
          }
        />
        <FormStatus message={message} />
        <PrimaryButton disabled={!ready} busy={saving} onPress={() => void save()}>
          Angabe speichern
        </PrimaryButton>
      </FormSection>
      <SecondaryButton disabled={saving} onPress={onReload}>
        Aktuellen Stand laden
      </SecondaryButton>
      <SecondaryButton disabled={saving} onPress={onClose}>
        Zurück zur Dienstauswahl
      </SecondaryButton>
    </FormScreen>
  );
}
