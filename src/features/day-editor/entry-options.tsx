import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type {
  EntryNotification,
  NotificationReference,
  NotificationUnit,
  RecurrenceFrequency,
  RecurrenceRule,
} from "@/domain/types";
import { usePalette } from "@/theme/palette";

export function recurrenceLabel(rule: RecurrenceRule | null | undefined): string {
  if (!rule) return "Nie";
  if (rule.frequency === "WEEK" && rule.interval === 1) return "Wöchentlich";
  if (rule.frequency === "WEEK" && rule.interval === 2) return "Alle 2 Wochen";
  if (rule.frequency === "MONTH" && rule.interval === 1) return "Monatlich";
  if (rule.frequency === "YEAR" && rule.interval === 1) return "Jährlich";
  const units = { DAY: "Tage", WEEK: "Wochen", MONTH: "Monate", YEAR: "Jahre" } as const;
  return `Alle ${rule.interval} ${units[rule.frequency]}`;
}

export function notificationLabel(rule: EntryNotification | null | undefined): string {
  if (!rule) return "Keine";
  const units = { MINUTE: "Min.", HOUR: "Std.", DAY: "Tage", WEEK: "Wochen" } as const;
  const direction = rule.direction === "BEFORE" ? "vor" : "nach";
  const reference = rule.reference === "START" ? "Beginn" : "Ende";
  return rule.amount === 0
    ? `Zum ${reference}`
    : `${rule.amount} ${units[rule.unit]} ${direction} ${reference}`;
}

export function OptionRow({
  icon,
  label,
  onPress,
  value,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress: () => void;
  readonly value: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 54,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: palette.separator,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons color={palette.textMuted} name={icon} size={21} />
      <Text style={{ flex: 1, color: palette.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
      <Text style={{ maxWidth: "48%", color: palette.textMuted, fontSize: 14 }}>{value}</Text>
      <Ionicons color={palette.textMuted} name="chevron-forward" size={17} />
    </Pressable>
  );
}

function SheetShell({
  children,
  onClose,
  title,
}: React.PropsWithChildren<{ readonly onClose: () => void; readonly title: string }>) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <View
        style={{
          flex: 1,
          gap: 18,
          backgroundColor: palette.background,
          paddingHorizontal: 20,
          paddingTop: Math.max(insets.top, 24),
          paddingBottom: Math.max(insets.bottom, 20),
        }}
      >
        <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center" }}>
          <Pressable
            accessibilityLabel="Zurück"
            accessibilityRole="button"
            onPress={onClose}
            style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons color={palette.text} name="close" size={26} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              color: palette.text,
              fontSize: 22,
              fontWeight: "700",
              textAlign: "center",
            }}
          >
            {title}
          </Text>
          <View style={{ width: 48 }} />
        </View>
        {children}
      </View>
    </Modal>
  );
}

function ChoiceButton({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: palette.separator,
        opacity: pressed ? 0.6 : 1,
        paddingHorizontal: 16,
      })}
    >
      <Text style={{ color: palette.text, fontSize: 16 }}>{label}</Text>
      {selected ? <Ionicons color={palette.primary} name="checkmark" size={22} /> : null}
    </Pressable>
  );
}

export function RecurrenceSheet({
  onChange,
  onClose,
  value,
}: {
  readonly onChange: (value: RecurrenceRule | null) => void;
  readonly onClose: () => void;
  readonly value: RecurrenceRule | null;
}) {
  const palette = usePalette();
  const [interval, setInterval] = useState(String(value?.interval ?? 1));
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(value?.frequency ?? "WEEK");
  const presets: readonly [string, RecurrenceRule | null][] = [
    ["Nie", null],
    ["Wöchentlich", { frequency: "WEEK", interval: 1 }],
    ["Alle 2 Wochen", { frequency: "WEEK", interval: 2 }],
    ["Monatlich", { frequency: "MONTH", interval: 1 }],
    ["Jährlich", { frequency: "YEAR", interval: 1 }],
  ];
  return (
    <SheetShell onClose={onClose} title="Wiederholen">
      <View
        style={{ overflow: "hidden", borderRadius: 20, backgroundColor: palette.surfaceRaised }}
      >
        {presets.map(([label, rule]) => (
          <ChoiceButton
            key={label}
            label={label}
            onPress={() => {
              onChange(rule);
              onClose();
            }}
            selected={JSON.stringify(value) === JSON.stringify(rule)}
          />
        ))}
      </View>
      <Text style={{ color: palette.textSecondary, fontSize: 15, fontWeight: "600" }}>
        Eigene Wiederholung
      </Text>
      <View
        style={{ gap: 14, borderRadius: 20, backgroundColor: palette.surfaceRaised, padding: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ color: palette.text, fontSize: 16 }}>Alle</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={setInterval}
            style={{
              minWidth: 70,
              borderRadius: 12,
              backgroundColor: palette.surfaceMuted,
              color: palette.text,
              fontSize: 18,
              padding: 12,
              textAlign: "center",
            }}
            value={interval}
          />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["DAY", "WEEK", "MONTH", "YEAR"] as const).map((candidate) => (
            <Pressable
              key={candidate}
              onPress={() => setFrequency(candidate)}
              style={{
                borderRadius: 20,
                backgroundColor:
                  frequency === candidate ? palette.primarySoft : palette.surfaceMuted,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  color: frequency === candidate ? palette.primary : palette.text,
                  fontWeight: "600",
                }}
              >
                {{ DAY: "Tage", WEEK: "Wochen", MONTH: "Monate", YEAR: "Jahre" }[candidate]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => {
            onChange({ frequency, interval: Math.max(1, Math.min(99, Number(interval) || 1)) });
            onClose();
          }}
          style={{
            minHeight: 50,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 25,
            backgroundColor: palette.accent,
          }}
        >
          <Text style={{ color: palette.onAccent, fontSize: 16, fontWeight: "700" }}>Fertig</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

export function NotificationSheet({
  deferredSelection = false,
  onChange,
  onClose,
  value,
}: {
  readonly deferredSelection?: boolean;
  readonly onChange: (value: EntryNotification | null) => void;
  readonly onClose: () => void;
  readonly value: EntryNotification | null;
}) {
  const palette = usePalette();
  const [amount, setAmount] = useState(String(value?.amount ?? 0));
  const [unit, setUnit] = useState<NotificationUnit>(value?.unit ?? "MINUTE");
  const [direction, setDirection] = useState(value?.direction ?? "BEFORE");
  const [reference, setReference] = useState<NotificationReference>(value?.reference ?? "START");
  const [enabled, setEnabled] = useState(value !== null);
  return (
    <SheetShell onClose={onClose} title="Benachrichtigung">
      <ChoiceButton
        label="Keine"
        onPress={() => {
          if (deferredSelection) {
            setEnabled(false);
            return;
          }
          onChange(null);
          onClose();
        }}
        selected={!enabled}
      />
      <View
        style={{ gap: 16, borderRadius: 20, backgroundColor: palette.surfaceRaised, padding: 16 }}
      >
        <TextInput
          accessibilityLabel="Benachrichtigungsabstand"
          keyboardType="number-pad"
          onChangeText={(nextAmount) => {
            setEnabled(true);
            setAmount(nextAmount);
          }}
          style={{
            borderRadius: 12,
            backgroundColor: palette.surfaceMuted,
            color: palette.text,
            fontSize: 20,
            padding: 14,
            textAlign: "center",
          }}
          value={amount}
        />
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8 }}>
          {(["MINUTE", "HOUR", "DAY", "WEEK"] as const).map((candidate) => (
            <ChoicePill
              key={candidate}
              label={{ MINUTE: "Minuten", HOUR: "Stunden", DAY: "Tage", WEEK: "Wochen" }[candidate]}
              onPress={() => {
                setEnabled(true);
                setUnit(candidate);
              }}
              selected={unit === candidate}
            />
          ))}
        </View>
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8 }}>
          {(["BEFORE", "AFTER"] as const).map((candidate) => (
            <ChoicePill
              key={candidate}
              label={candidate === "BEFORE" ? "vor" : "nach"}
              selected={direction === candidate}
              onPress={() => {
                setEnabled(true);
                setDirection(candidate);
              }}
            />
          ))}
        </View>
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 8 }}>
          {(["START", "END"] as const).map((candidate) => (
            <ChoicePill
              key={candidate}
              label={candidate === "START" ? "Beginn" : "Ende"}
              selected={reference === candidate}
              onPress={() => {
                setEnabled(true);
                setReference(candidate);
              }}
            />
          ))}
        </View>
        <Pressable
          accessibilityLabel="Benachrichtigung übernehmen"
          accessibilityRole="button"
          onPress={() => {
            onChange(
              enabled
                ? {
                    amount: Math.max(0, Math.min(365, Number(amount) || 0)),
                    unit,
                    direction,
                    reference,
                  }
                : null,
            );
            onClose();
          }}
          style={{
            minHeight: 50,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 25,
            backgroundColor: palette.accent,
          }}
        >
          <Text style={{ color: palette.onAccent, fontSize: 16, fontWeight: "700" }}>Fertig</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

function pausePickerDate(minutes: number): Date {
  const rounded = Math.min(23 * 60 + 45, Math.max(0, Math.round(minutes / 15) * 15));
  const value = new Date(2000, 0, 1, 0, 0, 0, 0);
  value.setHours(Math.floor(rounded / 60), rounded % 60, 0, 0);
  return value;
}

export function PauseSheet({
  onChange,
  onClose,
  value,
}: {
  readonly onChange: (value: number) => void;
  readonly onClose: () => void;
  readonly value: number;
}) {
  const palette = usePalette();
  const [selected, setSelected] = useState(() => pausePickerDate(value));
  const minutes = selected.getHours() * 60 + selected.getMinutes();
  return (
    <SheetShell onClose={onClose} title="Pause">
      <View
        style={{
          overflow: "hidden",
          borderRadius: 20,
          backgroundColor: palette.surfaceRaised,
          padding: 16,
        }}
      >
        <DateTimePicker
          accessibilityLabel="Pausendauer in 15-Minuten-Schritten"
          display="spinner"
          minuteInterval={15}
          mode="countdown"
          onValueChange={(_, nextValue) => setSelected(nextValue)}
          themeVariant={palette.dark ? "dark" : "light"}
          value={selected}
        />
      </View>
      <Pressable
        accessibilityLabel={`Pause übernehmen: ${minutes} Minuten`}
        accessibilityRole="button"
        onPress={() => {
          onChange(minutes);
          onClose();
        }}
        style={{
          minHeight: 50,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 25,
          backgroundColor: palette.accent,
        }}
      >
        <Text style={{ color: palette.onAccent, fontSize: 16, fontWeight: "700" }}>Fertig</Text>
      </Pressable>
    </SheetShell>
  );
}

export function AlarmSheet({
  onChange,
  onClose,
  value,
}: {
  readonly onChange: (value: boolean) => void;
  readonly onClose: () => void;
  readonly value: boolean;
}) {
  const palette = usePalette();
  return (
    <SheetShell onClose={onClose} title="Wecker">
      <View
        accessibilityRole="radiogroup"
        style={{ overflow: "hidden", borderRadius: 20, backgroundColor: palette.surfaceRaised }}
      >
        <ChoiceButton
          label="Aus"
          onPress={() => {
            onChange(false);
            onClose();
          }}
          selected={!value}
        />
        <ChoiceButton
          label="Zum Dienstbeginn"
          onPress={() => {
            onChange(true);
            onClose();
          }}
          selected={value}
        />
      </View>
      <Text style={{ color: palette.textSecondary, fontSize: 14, lineHeight: 20 }}>
        Der Wecker verwendet den iOS-Standardton. Fokusmodus und Stummschaltung können den Ton
        unterdrücken.
      </Text>
    </SheetShell>
  );
}

function ChoicePill({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 46,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 23,
        backgroundColor: selected ? palette.primarySoft : palette.surfaceMuted,
      }}
    >
      <Text style={{ color: selected ? palette.primary : palette.text, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}
