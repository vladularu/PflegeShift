import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useMediShiftStatus, useMediShiftTemplates } from "@/application/medishift-provider";
import { SHIFT_TYPE_LABELS, type ShiftTemplate, type ShiftType } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import {
  resolveEditorSession,
  resolveEditorTarget,
  useStableEditorSession,
} from "@/features/editor-session";
import { parseIdentifierRouteParam, type RouteParam } from "@/navigation/route-params";
import { DEFAULT_TEMPLATE_COLOR, usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE } from "@/theme/typography";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { ColorPicker, Field, ResponsiveFieldRow, TimePickerField } from "@/ui/form-controls";
import {
  DestructiveFormAction,
  FormScreen,
  FormSection,
  FormStatus,
  HeaderSaveAction,
} from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import {
  focusInvalidField,
  integerRangeFieldError,
  requiredFieldError,
} from "@/ui/form-validation";

const TEMPLATE_TYPES: readonly ShiftType[] = [
  "EARLY",
  "LATE",
  "NIGHT",
  "DAY",
  "TRAINING",
  "VACATION",
  "SICK",
  "FREE",
  "CUSTOM",
];

function isAbsenceType(type: ShiftType): boolean {
  return type === "VACATION" || type === "SICK" || type === "FREE";
}

export function TemplateEditorScreen() {
  const params = useLocalSearchParams<{ id?: RouteParam }>();
  const { error, ready, reload } = useMediShiftStatus();
  const { templates } = useMediShiftTemplates();
  const parsedId = parseIdentifierRouteParam(params.id);
  const id = parsedId.status === "valid" ? parsedId.value : undefined;
  const existing = useMemo(() => templates.find((item) => item.id === id), [id, templates]);
  if (parsedId.status === "invalid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zur Dienstvorlage enthält eine ungültige ID."
        onRetry={() => router.back()}
        title="Vorlage kann nicht geöffnet werden"
      />
    );
  }
  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
  const target = resolveEditorTarget(id, existing);
  if (ready && target.kind === "MISSING") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Die angeforderte Dienstvorlage existiert nicht mehr."
        onRetry={() => router.back()}
        title="Vorlage nicht verfügbar"
      />
    );
  }
  const session = resolveEditorSession(ready, id ?? "new", () =>
    target.kind === "EDIT" ? target.value : null,
  );
  if (session === null) return <LoadingView />;
  return (
    <TemplateEditorForm
      key={session.key}
      existing={session.initialValue}
      sessionKey={session.key}
    />
  );
}

function TemplateEditorForm({
  existing: loadedExisting,
  sessionKey,
}: {
  readonly existing: ShiftTemplate | null;
  readonly sessionKey: string;
}) {
  const palette = usePalette();
  const { templates, upsertTemplate, removeTemplate } = useMediShiftTemplates();
  const { initialValue: existing } = useStableEditorSession(sessionKey, () => loadedExisting);
  const [name, setName] = useState(existing?.name ?? "Neuer Dienst");
  const [type, setType] = useState<ShiftType>(existing?.type ?? "CUSTOM");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "16:00");
  const [breakMinutes, setBreakMinutes] = useState(String(existing?.breakMinutes ?? 30));
  const [color, setColor] = useState(existing?.color ?? DEFAULT_TEMPLATE_COLOR);
  const [symbol, setSymbol] = useState(existing?.symbol ?? "D");
  const [nameError, setNameError] = useState<string | null>(null);
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [breakError, setBreakError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const symbolRef = useRef<TextInput>(null);
  const breakRef = useRef<TextInput>(null);
  const absence = isAbsenceType(type);
  const typeLocked = existing !== null && isAbsenceType(existing.type);

  async function submit() {
    const nextNameError = requiredFieldError(name, "Titel");
    const nextSymbolError = requiredFieldError(symbol, "Symbol");
    const nextBreakError = absence ? null : integerRangeFieldError(breakMinutes, "Pause", 0, 1_440);
    setNameError(nextNameError);
    setSymbolError(nextSymbolError);
    setBreakError(nextBreakError);
    const firstError = nextNameError ?? nextSymbolError ?? nextBreakError;
    if (firstError) {
      setError(firstError);
      focusInvalidField(
        nextNameError ? nameRef : nextSymbolError ? symbolRef : breakRef,
        firstError,
      );
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await upsertTemplate({
        ...(existing ? { id: existing.id, expectedRevision: existing.revision } : {}),
        name,
        type,
        startTime: absence ? null : startTime,
        endTime: absence ? null : endTime,
        breakMinutes: absence ? 0 : Number(breakMinutes),
        color,
        symbol,
        sortOrder:
          existing?.sortOrder ??
          Math.max(0, ...templates.map((template) => template.sortOrder)) + 10,
      });
      router.back();
    } catch (submitError) {
      setError(userFacingErrorMessage(submitError, "Vorlage konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  function confirmArchive() {
    if (!existing) return;
    confirmDestructiveAction({
      title: "Vorlage archivieren?",
      message: `„${existing.name}“ wird aus der Schnellwahl entfernt. Bereits eingetragene Dienste bleiben bestehen.`,
      onConfirm: () =>
        void removeTemplate(existing)
          .then(() => router.back())
          .catch((reason: unknown) =>
            setError(userFacingErrorMessage(reason, "Archivieren fehlgeschlagen.")),
          ),
    });
  }

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: existing ? "Vorlage bearbeiten" : "Neue Vorlage",
          headerRight: () => <HeaderSaveAction busy={saving} onPress={() => void submit()} />,
        }}
      />

      <FormSection title="Darstellung">
        <Field
          error={nameError}
          inputRef={nameRef}
          label="Titel"
          maxLength={40}
          onChangeText={(value) => {
            setName(value);
            if (nameError) setNameError(null);
          }}
          value={name}
        />
        <Field
          autoCapitalize="characters"
          error={symbolError}
          inputRef={symbolRef}
          label="Symbol / Kürzel"
          maxLength={4}
          onChangeText={(value) => {
            setSymbol(value);
            if (symbolError) setSymbolError(null);
          }}
          value={symbol}
        />
        <ColorPicker onChange={setColor} value={color} />
      </FormSection>

      <FormSection title="Dienstart">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TEMPLATE_TYPES.map((candidate) => {
            const selected = candidate === type;
            return (
              <Pressable
                key={candidate}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={typeLocked && candidate !== type}
                onPress={() => setType(candidate)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: selected ? palette.primary : palette.border,
                  borderRadius: 22,
                  backgroundColor: selected ? palette.primarySoft : palette.surface,
                  opacity: typeLocked && candidate !== type ? 0.32 : pressed ? 0.68 : 1,
                  paddingHorizontal: 14,
                })}
              >
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  style={{ color: selected ? palette.primary : palette.text, fontWeight: "800" }}
                >
                  {SHIFT_TYPE_LABELS[candidate]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FormSection>

      {absence ? (
        <FormSection title="Berechnung">
          <Text style={{ color: palette.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {type === "FREE"
              ? "Frei wird mit 0 Stunden geführt."
              : "Die Abwesenheit ergänzt vorhandene Arbeits- oder Fortbildungszeit höchstens bis zum Tages-Soll."}
          </Text>
        </FormSection>
      ) : (
        <FormSection title="Standardwerte">
          <ResponsiveFieldRow>
            <TimePickerField label="Start" onChange={setStartTime} value={startTime} />
            <TimePickerField label="Ende" onChange={setEndTime} value={endTime} />
          </ResponsiveFieldRow>
          <Field
            error={breakError}
            inputRef={breakRef}
            keyboardType="number-pad"
            label="Pause in Minuten"
            onChangeText={(value) => {
              setBreakMinutes(value);
              if (breakError) setBreakError(null);
            }}
            value={breakMinutes}
          />
        </FormSection>
      )}

      <FormStatus error={error} />
      {existing ? (
        <DestructiveFormAction
          disabled={saving}
          label="Vorlage archivieren"
          onPress={confirmArchive}
        />
      ) : null}
    </FormScreen>
  );
}
