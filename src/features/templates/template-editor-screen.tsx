import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftStatus,
  usePflegeShiftTemplates,
} from "@/application/pflegeshift-provider";
import {
  SHIFT_TYPE_LABELS,
  type EntryLocation,
  type EntryNotification,
  type ShiftTemplate,
  type ShiftType,
} from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { completeShiftSelectionNavigation } from "@/features/calendar/quick-entry-navigation";
import {
  resolveEditorSession,
  resolveEditorTarget,
  useStableEditorSession,
} from "@/features/editor-session";
import { saveTemplateWithOptionalCalendarEntry } from "@/features/templates/template-editor-save";
import {
  parseIdentifierRouteParam,
  parseLocalDateRouteParam,
  type RouteParam,
} from "@/navigation/route-params";
import { DEFAULT_TEMPLATE_COLOR, SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { DEFAULT_SHIFT_SYMBOLS } from "@/theme/shift-symbols";
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
import { selectionFeedback, successFeedback, warningFeedback } from "@/ui/haptics";
import { LabeledSwitch } from "@/ui/labeled-switch";
import { ShiftSymbolPicker } from "@/ui/shift-symbol-picker";
import {
  NotificationSheet,
  notificationLabel,
  OptionRow,
} from "@/features/day-editor/entry-options";
import { LocationPreview } from "@/features/location/location-preview";
import { consumeLocationSelection } from "@/features/location/location-selection";
import { locationPickerRoute } from "@/navigation/routes";
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
  const params = useLocalSearchParams<{
    id?: RouteParam;
    quickEntryDate?: RouteParam;
  }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { templates } = usePflegeShiftTemplates();
  const parsedId = parseIdentifierRouteParam(params.id);
  const parsedQuickEntryDate = parseLocalDateRouteParam(params.quickEntryDate);
  const id = parsedId.status === "valid" ? parsedId.value : undefined;
  const quickEntryDate =
    parsedQuickEntryDate.status === "valid" ? parsedQuickEntryDate.value : undefined;
  const existing = useMemo(() => templates.find((item) => item.id === id), [id, templates]);
  if (parsedId.status === "invalid" || parsedQuickEntryDate.status === "invalid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zur Dienstvorlage enthält ungültige Angaben."
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
      quickEntryDate={quickEntryDate}
      sessionKey={session.key}
    />
  );
}

function TemplateEditorForm({
  existing: loadedExisting,
  quickEntryDate,
  sessionKey,
}: {
  readonly existing: ShiftTemplate | null;
  readonly quickEntryDate?: string;
  readonly sessionKey: string;
}) {
  const palette = usePalette();
  const { templates, upsertTemplate, removeTemplate } = usePflegeShiftTemplates();
  const { entries, upsertShift } = usePflegeShiftEntries();
  const { initialValue: existing } = useStableEditorSession(sessionKey, () => loadedExisting);
  const [name, setName] = useState(existing?.name ?? "Neuer Dienst");
  const [type, setType] = useState<ShiftType>(existing?.type ?? "CUSTOM");
  const [allDay, setAllDay] = useState(existing?.allDay ?? false);
  const [startTime, setStartTime] = useState(existing?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "16:00");
  const [breakMinutes, setBreakMinutes] = useState(String(existing?.breakMinutes ?? 30));
  const [color, setColor] = useState(existing?.color ?? DEFAULT_TEMPLATE_COLOR);
  const [symbol, setSymbol] = useState(existing?.symbol ?? DEFAULT_SHIFT_SYMBOLS.CUSTOM);
  const [notification, setNotification] = useState<EntryNotification | null>(
    existing?.notification ?? null,
  );
  const [location, setLocation] = useState<EntryLocation | null>(existing?.location ?? null);
  const [notificationOpen, setNotificationOpen] = useState(false);
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

  function changeType(candidate: ShiftType) {
    const useCandidateColor =
      existing === null && (color === SHIFT_TYPE_COLORS[type] || color === DEFAULT_TEMPLATE_COLOR);
    const useCandidateSymbol = existing === null && symbol === DEFAULT_SHIFT_SYMBOLS[type];
    setType(candidate);
    if (useCandidateColor) setColor(SHIFT_TYPE_COLORS[candidate]);
    if (useCandidateSymbol) setSymbol(DEFAULT_SHIFT_SYMBOLS[candidate]);
  }

  useFocusEffect(
    useCallback(() => {
      const selected = consumeLocationSelection();
      if (selected !== undefined) setLocation(selected);
    }, []),
  );

  async function submit() {
    const nextNameError = requiredFieldError(name, "Titel");
    const nextSymbolError = requiredFieldError(symbol, "Symbol");
    const nextBreakError =
      absence || allDay ? null : integerRangeFieldError(breakMinutes, "Pause", 0, 1_440);
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
      await saveTemplateWithOptionalCalendarEntry({
        entries,
        quickEntryDate,
        upsertShift,
        upsertTemplate,
        input: {
          ...(existing ? { id: existing.id, expectedRevision: existing.revision } : {}),
          name,
          type,
          allDay: absence || allDay,
          startTime: absence ? null : startTime,
          endTime: absence ? null : endTime,
          breakMinutes: absence ? 0 : Number(breakMinutes),
          color,
          symbol,
          notification,
          location,
          sortOrder:
            existing?.sortOrder ??
            Math.max(0, ...templates.map((template) => template.sortOrder)) + 10,
        },
      });
      if (quickEntryDate) {
        completeShiftSelectionNavigation();
      }
      successFeedback();
      if (quickEntryDate) router.dismiss(2);
      else router.back();
    } catch (submitError) {
      warningFeedback();
      setError(userFacingErrorMessage(submitError, "Vorlage konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  function confirmArchive() {
    if (!existing) return;
    confirmDestructiveAction({
      title: "Vorlage löschen?",
      message: `„${existing.name}“ wird aus der Schnellauswahl entfernt. Eingetragene Dienste bleiben bestehen.`,
      onConfirm: () =>
        void removeTemplate(existing)
          .then(() => {
            selectionFeedback();
            router.back();
          })
          .catch((reason: unknown) =>
            setError(userFacingErrorMessage(reason, "Löschen fehlgeschlagen.")),
          ),
    });
  }

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: "Schicht",
          headerRight: () => (
            <HeaderSaveAction busy={saving} label="Fertig" onPress={() => void submit()} />
          ),
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
        <ShiftSymbolPicker
          color={color}
          error={symbolError}
          inputRef={symbolRef}
          onChange={(value) => {
            setSymbol(value);
            if (symbolError) setSymbolError(null);
          }}
          value={symbol}
        />
        <ColorPicker onChange={setColor} symbol={symbol} value={color} />
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
                onPress={() => changeType(candidate)}
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
                  style={{ color: selected ? palette.primary : palette.text, fontWeight: "600" }}
                >
                  {SHIFT_TYPE_LABELS[candidate]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FormSection>

      {absence ? (
        <FormSection title="Arbeitszeit">
          <Text style={{ color: palette.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {type === "FREE"
              ? "Frei wird mit 0 Stunden geführt."
              : "Die Abwesenheit ergänzt Arbeitszeit bis zum Tages-Soll."}
          </Text>
        </FormSection>
      ) : (
        <FormSection title="Zeiten">
          <View
            style={{
              minHeight: 50,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: palette.text, fontSize: 15, fontWeight: "600" }}>Ganztägig</Text>
            <LabeledSwitch label="Schicht ganztägig" onValueChange={setAllDay} value={allDay} />
          </View>
          {!allDay ? (
            <>
              <ResponsiveFieldRow>
                <TimePickerField label="Start" onChange={setStartTime} value={startTime} />
                <TimePickerField label="Ende" onChange={setEndTime} value={endTime} />
              </ResponsiveFieldRow>
              <Field
                error={breakError}
                inputRef={breakRef}
                keyboardType="number-pad"
                label="Pause (Min.)"
                onChangeText={(value) => {
                  setBreakMinutes(value);
                  if (breakError) setBreakError(null);
                }}
                value={breakMinutes}
              />
            </>
          ) : null}
        </FormSection>
      )}

      <FormSection title="Weitere Angaben">
        <OptionRow
          icon="notifications-outline"
          label="Benachrichtigung"
          onPress={() => setNotificationOpen(true)}
          value={notificationLabel(notification)}
        />
        <OptionRow
          icon="location-outline"
          label="Ort"
          onPress={() => router.push(locationPickerRoute(location?.name) as never)}
          value={location?.name ?? "Kein Ort"}
        />
        {location ? <LocationPreview location={location} /> : null}
      </FormSection>

      <FormStatus error={error} />
      {existing ? (
        <DestructiveFormAction disabled={saving} label="Vorlage löschen" onPress={confirmArchive} />
      ) : null}
      {notificationOpen ? (
        <NotificationSheet
          onChange={setNotification}
          onClose={() => setNotificationOpen(false)}
          value={notification}
        />
      ) : null}
    </FormScreen>
  );
}
