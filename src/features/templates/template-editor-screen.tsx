import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import {
  ActionSheetIOS,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { FullWindowOverlay } from "react-native-screens";

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
import { chipTextColor } from "@/theme/color-contrast";
import { MOTION } from "@/theme/motion";
import { DEFAULT_TEMPLATE_COLOR, SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { DEFAULT_SHIFT_SYMBOLS } from "@/theme/shift-symbols";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { CardSeparator, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { ColorPicker, SecondaryButton, TimePickerField } from "@/ui/form-controls";
import { DestructiveFormAction, FormScreen, FormStatus, HeaderSaveAction } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { deletionFeedback, successFeedback, warningFeedback } from "@/ui/haptics";
import { LabeledSwitch } from "@/ui/labeled-switch";
import { PauseWheel } from "@/ui/pause-wheel";
import { ShiftSymbol } from "@/ui/shift-symbol";
import { ShiftSymbolPicker } from "@/ui/shift-symbol-picker";
import { NotificationSheet, notificationLabel } from "@/features/day-editor/entry-options";
import { ShiftNotificationOverlay } from "@/features/day-editor/shift-notification-overlay";
import { LocationPreview } from "@/features/location/location-preview";
import {
  consumeLocationSelection,
  prepareLocationPicker,
} from "@/features/location/location-selection";
import { locationPickerRoute } from "@/navigation/routes";
import { focusInvalidField, requiredFieldError } from "@/ui/form-validation";

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

function CompactInputRow({
  error,
  inputRef,
  keyboardType,
  label,
  maxLength,
  onChangeText,
  suffix,
  testID,
  value,
}: {
  readonly error?: string | null;
  readonly inputRef?: Ref<TextInput>;
  readonly keyboardType?: TextInputProps["keyboardType"];
  readonly label: string;
  readonly maxLength?: number;
  readonly onChangeText: (value: string) => void;
  readonly suffix?: string;
  readonly testID?: string;
  readonly value: string;
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.6;

  return (
    <View>
      <View
        testID={testID}
        style={{
          minHeight: CONTROL_HEIGHT.large,
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "stretch" : "center",
          justifyContent: "space-between",
          gap: SPACING.sm,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.xs,
        }}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          {label}
        </Text>
        <View
          style={{
            minWidth: 0,
            flex: stacked ? undefined : 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: stacked ? "flex-start" : "flex-end",
            gap: SPACING.xs,
          }}
        >
          <TextInput
            ref={inputRef}
            accessibilityLabel={error ? `${label}, ungültig` : label}
            accessibilityHint={error ? `Fehler: ${error}` : undefined}
            enablesReturnKeyAutomatically
            keyboardType={keyboardType}
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            maxLength={maxLength}
            onChangeText={onChangeText}
            placeholderTextColor={palette.textMuted}
            selectTextOnFocus={keyboardType === "number-pad"}
            style={{
              minWidth: keyboardType === "number-pad" ? 44 : 96,
              minHeight: CONTROL_HEIGHT.compact,
              flex: keyboardType === "number-pad" ? undefined : 1,
              color: error ? palette.danger : palette.textSecondary,
              textAlign: stacked ? "left" : "right",
              paddingVertical: 0,
              ...TYPOGRAPHY.body,
              ...(keyboardType === "number-pad" ? { fontVariant: ["tabular-nums"] } : {}),
            }}
            value={value}
          />
          {suffix ? (
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
            >
              {suffix}
            </Text>
          ) : null}
        </View>
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          selectable
          style={{
            color: palette.danger,
            paddingHorizontal: SPACING.lg,
            paddingBottom: SPACING.sm,
            ...TYPOGRAPHY.footnote,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function CompactActionRow({
  disabled = false,
  expanded,
  icon,
  label,
  onPress,
  testID,
  trailing,
  value,
}: {
  readonly disabled?: boolean;
  readonly expanded?: boolean;
  readonly icon?: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly trailing?: ReactNode;
  readonly value?: string;
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.6;

  return (
    <Pressable
      accessibilityHint="Öffnet die Auswahl"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.md,
        backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        opacity: disabled ? 0.42 : 1,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.sm,
      })}
    >
      {icon ? (
        <Ionicons accessibilityElementsHidden color={palette.textMuted} name={icon} size={21} />
      ) : null}
      <View
        style={{
          minWidth: 0,
          flex: 1,
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: stacked ? SPACING.xxs : SPACING.md,
        }}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          {label}
        </Text>
        {value ? (
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{
              color: palette.textMuted,
              textAlign: stacked ? "left" : "right",
              ...TYPOGRAPHY.body,
            }}
          >
            {value}
          </Text>
        ) : null}
      </View>
      {trailing}
      <Ionicons
        accessibilityElementsHidden
        color={palette.textMuted}
        name={expanded ? "chevron-up" : "chevron-forward"}
        size={17}
      />
    </Pressable>
  );
}

function CompactSwitchRow({
  label,
  onValueChange,
  testID,
  value,
}: {
  readonly label: string;
  readonly onValueChange: (value: boolean) => void;
  readonly testID?: string;
  readonly value: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      testID={testID}
      style={{
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: SPACING.md,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.xs,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ flex: 1, color: palette.text, ...TYPOGRAPHY.bodyStrong }}
      >
        {label}
      </Text>
      <LabeledSwitch
        label={`Schicht ${label.toLocaleLowerCase("de-DE")}`}
        onValueChange={onValueChange}
        value={value}
      />
    </View>
  );
}

function CompactPausePicker({
  onChange,
  value,
}: {
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const palette = usePalette();
  const minutes = Number(value) || 0;
  const [expanded, setExpanded] = useState(false);

  function togglePicker() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
  }

  return (
    <SurfaceCard>
      <Pressable
        accessibilityHint={expanded ? "Klappt die Auswahl ein" : "Öffnet die Pausenauswahl"}
        accessibilityLabel={`Pause: ${minutes} Minuten`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={togglePicker}
        testID="template-pause-row"
        style={({ pressed }) => ({
          minHeight: 56,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: SPACING.md,
          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.xs,
        })}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          Pause
        </Text>
        <View
          style={{
            minHeight: 36,
            minWidth: 92,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: RADII.control,
            backgroundColor: palette.surfaceMuted,
            paddingHorizontal: SPACING.md,
          }}
        >
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.text, fontVariant: ["tabular-nums"], ...TYPOGRAPHY.body }}
          >
            {minutes} Min.
          </Text>
        </View>
      </Pressable>
      {expanded ? (
        <>
          <CardSeparator />
          <Animated.View
            accessibilityLabel="Pausendauer auswählen"
            entering={FadeInDown.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
            exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(MOTION.reduceMotion)}
            style={{ alignItems: "center", paddingVertical: SPACING.sm }}
            testID="template-pause-popover"
          >
            <PauseWheel
              onChange={(nextMinutes) => onChange(String(nextMinutes))}
              selectionTestID="template-pause-selection"
              testID="template-pause-wheel"
              value={minutes}
            />
          </Animated.View>
        </>
      ) : null}
    </SurfaceCard>
  );
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
  const [appearanceExpanded, setAppearanceExpanded] = useState(false);
  const [typePickerExpanded, setTypePickerExpanded] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const symbolRef = useRef<TextInput>(null);
  const absence = isAbsenceType(type);
  const typeLocked = existing !== null && isAbsenceType(existing.type);

  function changeType(candidate: ShiftType) {
    const useCandidateColor =
      existing === null && (color === SHIFT_TYPE_COLORS[type] || color === DEFAULT_TEMPLATE_COLOR);
    const useCandidateSymbol = existing === null && symbol === DEFAULT_SHIFT_SYMBOLS[type];
    setType(candidate);
    setTypePickerExpanded(false);
    if (useCandidateColor) setColor(SHIFT_TYPE_COLORS[candidate]);
    if (useCandidateSymbol) setSymbol(DEFAULT_SHIFT_SYMBOLS[candidate]);
  }

  function openTypePicker() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: TEMPLATE_TYPES.length,
          options: [
            ...TEMPLATE_TYPES.map((candidate) => SHIFT_TYPE_LABELS[candidate]),
            "Abbrechen",
          ],
          title: "Dienstart",
          userInterfaceStyle: palette.dark ? "dark" : "light",
        },
        (index) => {
          const candidate = TEMPLATE_TYPES[index];
          if (candidate) changeType(candidate);
        },
      );
      return;
    }
    setTypePickerExpanded((current) => !current);
  }

  useFocusEffect(
    useCallback(() => {
      const selected = consumeLocationSelection();
      if (selected !== undefined) setLocation(selected);
    }, []),
  );

  function openLocationPicker() {
    prepareLocationPicker(location);
    router.push(locationPickerRoute() as never);
  }

  async function submit() {
    const nextNameError = requiredFieldError(name, "Titel");
    const nextSymbolError = requiredFieldError(symbol, "Symbol");
    setNameError(nextNameError);
    setSymbolError(nextSymbolError);
    if (nextSymbolError) setAppearanceExpanded(true);
    const firstError = nextNameError ?? nextSymbolError;
    if (firstError) {
      setError(firstError);
      focusInvalidField(nextNameError ? nameRef : symbolRef, firstError);
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
      // The calendar picker is replaced by this editor, not left underneath it.
      router.back();
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
            deletionFeedback();
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

      <SurfaceCard>
        <CompactInputRow
          error={nameError}
          inputRef={nameRef}
          label="Titel"
          maxLength={40}
          onChangeText={(value) => {
            setName(value);
            if (nameError) setNameError(null);
          }}
          testID="template-title-row"
          value={name}
        />
        <CardSeparator />
        {appearanceExpanded ? (
          <Animated.View
            entering={FadeInDown.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
            exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(MOTION.reduceMotion)}
            style={{ gap: SPACING.md, padding: SPACING.lg }}
            testID="template-appearance-options"
          >
            <ShiftSymbolPicker
              color={color}
              error={symbolError}
              inputRef={symbolRef}
              onChange={(value) => {
                setSymbol(value);
                if (symbolError) setSymbolError(null);
              }}
              onHeaderPress={() => setAppearanceExpanded(false)}
              value={symbol}
            />
            <ColorPicker onChange={setColor} symbol={symbol} value={color} />
          </Animated.View>
        ) : (
          <CompactActionRow
            expanded={false}
            label="Symbol und Farbe"
            onPress={() => setAppearanceExpanded(true)}
            testID="template-appearance-toggle"
            trailing={
              <View
                style={{
                  width: 38,
                  height: 38,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: RADII.pill,
                  backgroundColor: color,
                }}
              >
                <ShiftSymbol color={chipTextColor} size={21} value={symbol} />
              </View>
            }
          />
        )}
      </SurfaceCard>

      <View style={{ gap: SPACING.sm }}>
        <SectionHeader title="Standardwerte" />
        <SurfaceCard>
          <CompactActionRow
            disabled={typeLocked}
            expanded={Platform.OS === "ios" ? undefined : typePickerExpanded}
            label="Dienstart"
            onPress={openTypePicker}
            testID="template-type-row"
            value={SHIFT_TYPE_LABELS[type]}
          />
          {typePickerExpanded ? (
            <>
              <CardSeparator />
              <Animated.View
                entering={FadeInDown.duration(MOTION.duration.fast).reduceMotion(
                  MOTION.reduceMotion,
                )}
                exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(
                  MOTION.reduceMotion,
                )}
                style={{ gap: SPACING.md, padding: SPACING.lg }}
              >
                <View
                  accessibilityLabel="Dienstart auswählen"
                  accessibilityRole="radiogroup"
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}
                >
                  {TEMPLATE_TYPES.map((candidate) => {
                    const selected = candidate === type;
                    return (
                      <Pressable
                        key={candidate}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => changeType(candidate)}
                        style={({ pressed }) => ({
                          minHeight: CONTROL_HEIGHT.compact,
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: selected ? palette.primary : palette.border,
                          borderRadius: RADII.pill,
                          backgroundColor: selected ? palette.primarySoft : palette.surface,
                          opacity: pressed ? 0.68 : 1,
                          paddingHorizontal: SPACING.md,
                        })}
                      >
                        <Text
                          maxFontSizeMultiplier={TEXT_MAX_SCALE}
                          style={{
                            color: selected ? palette.primary : palette.text,
                            ...TYPOGRAPHY.label,
                          }}
                        >
                          {SHIFT_TYPE_LABELS[candidate]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <SecondaryButton onPress={() => setTypePickerExpanded(false)}>
                  Fertig
                </SecondaryButton>
              </Animated.View>
            </>
          ) : null}
          <CardSeparator />
          {absence ? (
            <View
              style={{
                minHeight: 56,
                justifyContent: "center",
                paddingHorizontal: SPACING.lg,
                paddingVertical: SPACING.sm,
              }}
            >
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{ color: palette.textSecondary, ...TYPOGRAPHY.body }}
              >
                {type === "FREE"
                  ? "Frei wird mit 0 Stunden geführt."
                  : "Die Abwesenheit ergänzt Arbeitszeit bis zum Tages-Soll."}
              </Text>
            </View>
          ) : (
            <>
              <CompactSwitchRow
                label="Ganztägig"
                onValueChange={setAllDay}
                testID="template-all-day-row"
                value={allDay}
              />
              {!allDay ? (
                <>
                  <CardSeparator />
                  <View testID="template-start-row" style={{ paddingHorizontal: SPACING.lg }}>
                    <TimePickerField label="Start" onChange={setStartTime} value={startTime} />
                  </View>
                  <CardSeparator />
                  <View testID="template-end-row" style={{ paddingHorizontal: SPACING.lg }}>
                    <TimePickerField label="Ende" onChange={setEndTime} value={endTime} />
                  </View>
                </>
              ) : null}
            </>
          )}
        </SurfaceCard>
      </View>

      <View style={{ gap: SPACING.md }}>
        {!absence && !allDay ? (
          <CompactPausePicker onChange={setBreakMinutes} value={breakMinutes} />
        ) : null}
        <SurfaceCard>
          <CompactActionRow
            icon={notification ? "notifications-outline" : "add"}
            label="Benachrichtigung"
            onPress={() => setNotificationOpen(true)}
            testID="template-notification-row"
            value={notificationLabel(notification)}
          />
        </SurfaceCard>
        <SurfaceCard>
          <CompactActionRow
            icon="location-outline"
            label="Ort"
            onPress={openLocationPicker}
            testID="template-location-row"
            value={location?.name ?? "Kein Ort"}
          />
          {location ? (
            <>
              <CardSeparator />
              <View style={{ padding: SPACING.lg }}>
                <LocationPreview location={location} />
              </View>
            </>
          ) : null}
        </SurfaceCard>
      </View>

      <FormStatus error={error} />
      {existing ? (
        <DestructiveFormAction disabled={saving} label="Vorlage löschen" onPress={confirmArchive} />
      ) : null}
      {notificationOpen ? (
        Platform.OS === "ios" ? (
          <FullWindowOverlay>
            <ShiftNotificationOverlay
              onChange={setNotification}
              onClose={() => setNotificationOpen(false)}
              value={notification}
            />
          </FullWindowOverlay>
        ) : (
          <NotificationSheet
            onChange={setNotification}
            onClose={() => setNotificationOpen(false)}
            value={notification}
          />
        )
      ) : null}
    </FormScreen>
  );
}
