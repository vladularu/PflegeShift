import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { RemunerationPosition } from "@/domain/remuneration-result";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SecondaryButton } from "@/ui/form-controls";
import { RemunerationPositions } from "./remuneration-positions";

export function RemunerationDetailSheet({
  title,
  positions,
  onClose,
  action,
}: {
  readonly title: string;
  readonly positions: readonly RemunerationPosition[] | null;
  readonly onClose: () => void;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}) {
  const palette = usePalette();
  return (
    <Modal
      visible={positions !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <View
          style={{
            padding: SPACING.lg,
            flexDirection: "row",
            gap: SPACING.md,
            alignItems: "center",
          }}
        >
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ flex: 1, color: palette.text, ...TYPOGRAPHY.sectionTitle }}
          >
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Details schließen"
            onPress={onClose}
            style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}
          >
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{ color: palette.text, ...TYPOGRAPHY.label }}
            >
              Schließen
            </Text>
          </Pressable>
        </View>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }}
        >
          {action ? (
            <SecondaryButton
              onPress={() => {
                onClose();
                action.onPress();
              }}
            >
              {action.label}
            </SecondaryButton>
          ) : null}
          {positions !== null ? <RemunerationPositions positions={positions} /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
