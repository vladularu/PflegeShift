import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ONBOARDING_TYPOGRAPHY, useOnboardingPalette } from "@/theme/onboarding";
import { SelectField } from "./onboarding-controls";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";

export function weeklyMinutesFromPercentage(basis: number, percentage: number): number {
  return Math.round((basis * 60 * Math.max(10, Math.min(100, Math.round(percentage)))) / 100);
}
export function weeklyPercentage(hours: string, basis: number): number | null {
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(hours.trim())) return null;
  const value = Number(hours.replace(",", "."));
  if (!Number.isFinite(value) || value < 1 || value > 80) return null;
  return (Math.round(value * 60) / (basis * 60)) * 100;
}
export function PercentageSlider({
  weeklyHours,
  basis,
  onBasisChange,
  onHoursChange,
  onInteractionChange,
}: {
  readonly weeklyHours: string;
  readonly basis: number;
  readonly onBasisChange: (value: number) => void;
  readonly onHoursChange: (value: string) => void;
  readonly onInteractionChange: (active: boolean) => void;
}) {
  const p = useOnboardingPalette();
  const [width, setWidth] = useState(0);
  const origin = useRef({ pageX: 0, locationX: 0 });
  const percentage = weeklyPercentage(weeklyHours, basis);
  const clamped = Math.max(10, Math.min(100, percentage ?? 10));
  const display =
    percentage == null
      ? "Noch nicht gewählt"
      : `${Number(percentage.toFixed(1)).toLocaleString("de-DE")} %`;
  const position = ((clamped - 10) / 90) * 100;
  function choose(value: number) {
    const minutes = weeklyMinutesFromPercentage(basis, value);
    onHoursChange(String(Number((minutes / 60).toFixed(2))).replace(".", ","));
  }
  function touch(locationX: number) {
    if (width > 0) choose(10 + Math.max(0, Math.min(1, locationX / width)) * 90);
  }
  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <Text style={[styles.label, { color: p.text }]}>Teilzeit in Prozent</Text>
        <Text testID="onboarding-percentage-value" style={[styles.label, { color: p.accentText }]}>
          {display}
        </Text>
      </View>
      <View
        testID="onboarding-percentage-slider"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Teilzeit in Prozent"
        accessibilityHint="In Schritten von einem Prozent anpassen. Die Wochenstunden werden daraus berechnet."
        accessibilityValue={{ min: 10, max: 100, now: clamped, text: display }}
        accessibilityActions={[
          { name: "increment", label: "Ein Prozent mehr" },
          { name: "decrement", label: "Ein Prozent weniger" },
        ]}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === "increment") choose(Math.round(clamped) + 1);
          if (action === "decrement") choose(Math.round(clamped) - 1);
        }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => {
          origin.current = {
            pageX: event.nativeEvent.pageX,
            locationX: event.nativeEvent.locationX,
          };
          onInteractionChange(true);
          touch(event.nativeEvent.locationX);
        }}
        onResponderMove={(event) =>
          touch(origin.current.locationX + event.nativeEvent.pageX - origin.current.pageX)
        }
        onResponderRelease={() => onInteractionChange(false)}
        onResponderTerminate={() => onInteractionChange(false)}
        style={styles.slider}
      >
        <View pointerEvents="none" style={[styles.track, { backgroundColor: p.control }]}>
          <View style={[styles.fill, { width: `${position}%`, backgroundColor: p.accent }]} />
          <View
            style={[
              styles.thumb,
              { left: `${position}%`, backgroundColor: p.accent, borderColor: p.onAccent },
            ]}
          />
        </View>
      </View>
      <SelectField
        compact
        label="100 % entsprechen"
        value={basis}
        options={[38.5, 39, 40].map((value) => ({
          value,
          label: `${String(value).replace(".", ",")} h`,
        }))}
        onChange={onBasisChange}
      />
      {percentage != null && (percentage < 10 || percentage > 100) ? (
        <Text style={[styles.caption, { color: p.muted }]}>
          Deine Stunden liegen außerhalb von 10–100 %.
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { gap: SPACING.md },
  heading: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  label: ONBOARDING_TYPOGRAPHY.label,
  caption: ONBOARDING_TYPOGRAPHY.caption,
  slider: {
    minHeight: CONTROL_HEIGHT.compact,
    justifyContent: "center",
    marginHorizontal: SPACING.md,
  },
  track: { height: 6, borderRadius: RADII.pill },
  fill: { height: "100%", borderRadius: RADII.pill },
  thumb: {
    position: "absolute",
    width: 28,
    height: 28,
    marginLeft: -14,
    top: -11,
    borderRadius: RADII.pill,
    borderWidth: 3,
  },
});
