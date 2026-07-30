import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";

import { formatDateTitle } from "@/engine/calendar";
import { calculateQuickEntryLayout } from "@/features/calendar/quick-entry-layout";
import { usePalette } from "@/theme/palette";

export interface QuickEntryAnchor {
  readonly date: string;
  readonly x: number;
  readonly y: number;
}

export function QuickEntryPopover({
  anchor,
  onClose,
  onSelectAppointment,
  onSelectShift,
}: {
  readonly anchor: QuickEntryAnchor | null;
  readonly onClose: () => void;
  readonly onSelectAppointment: () => void;
  readonly onSelectShift: () => void;
}) {
  const palette = usePalette();
  const { height, width } = useWindowDimensions();

  if (anchor === null) return null;

  const layout = calculateQuickEntryLayout(width, height, anchor.x, anchor.y);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <View
        accessibilityViewIsModal
        style={{ flex: 1 }}
      >
        <Pressable
          accessibilityLabel="Auswahl schließen"
          accessibilityRole="button"
          onPress={onClose}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: palette.dark
              ? "rgba(0,0,0,0.24)"
              : "rgba(24,32,30,0.12)",
          }}
        />

        <View
          style={{
            position: "absolute",
            left: layout.pointerLeft,
            top: layout.pointerTop,
            width: 18,
            height: 18,
            pointerEvents: "none",
            borderRadius: 3,
            backgroundColor: palette.surfaceRaised,
            transform: [{ rotate: "45deg" }],
          }}
        />

        <View
          accessibilityLabel={`Eintrag für ${formatDateTitle(anchor.date)} auswählen`}
          accessibilityRole="summary"
          style={{
            position: "absolute",
            left: layout.cardLeft,
            top: layout.cardTop,
            width: layout.cardWidth,
            height: layout.cardHeight,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 22,
            borderCurve: "continuous",
            backgroundColor: palette.surfaceRaised,
            boxShadow: palette.dark
              ? "0 12px 34px rgba(0,0,0,0.48)"
              : "0 12px 34px rgba(24,32,30,0.22)",
          }}
        >
          <View
            style={{
              height: 54,
              justifyContent: "center",
              borderBottomWidth: 1,
              borderBottomColor: palette.border,
              paddingHorizontal: 18,
            }}
          >
            <Text
              selectable
              style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}
            >
              {formatDateTitle(anchor.date)}
            </Text>
            <Text
              style={{ color: palette.textMuted, fontSize: 12, fontWeight: "600" }}
            >
              Was möchtest du eintragen?
            </Text>
          </View>

          <View style={{ flex: 1, flexDirection: "row" }}>
            <QuickEntryAction label="Dienst" onPress={onSelectShift} />
            <View style={{ width: 1, backgroundColor: palette.border }} />
            <QuickEntryAction label="Termin" onPress={onSelectAppointment} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function QuickEntryAction({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();

  return (
    <Pressable
      accessibilityLabel={`${label} eintragen`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: pressed ? palette.primarySoft : palette.surfaceRaised,
      })}
    >
      <Text
        style={{
          color: palette.primary,
          fontSize: 28,
          fontWeight: "300",
          lineHeight: 30,
        }}
      >
        +
      </Text>
      <Text style={{ color: palette.text, fontSize: 17, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}
