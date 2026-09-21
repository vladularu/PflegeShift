import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { UserProfile } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { selectionFeedback } from "@/ui/haptics";
import { profileSalaryLabel, profileWorkLabel } from "./work-profile-summary";
export function WorkProfileCard({ profile }: { readonly profile: UserProfile }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Arbeitsprofil bearbeiten"
      onPress={() => {
        selectionFeedback();
        router.push("/work-profile");
      }}
      style={({ pressed }) => ({
        minHeight: CONTROL_HEIGHT.large,
        padding: SPACING.xl,
        gap: SPACING.lg,
        backgroundColor: palette.secondarySoft,
        borderRadius: RADII.card,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
        <View
          accessibilityElementsHidden
          style={{
            width: 48,
            minHeight: 48,
            borderRadius: RADII.control,
            backgroundColor: palette.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ ...TYPOGRAPHY.sectionTitle, color: palette.primary }}>
            {profile.displayName?.trim().slice(0, 1).toLocaleUpperCase("de-DE") ?? "•"}
          </Text>
        </View>
        <View style={{ flex: 1, gap: SPACING.xs }}>
          <Text style={{ ...TYPOGRAPHY.sectionTitle, color: palette.text }}>
            {profile.displayName || "Dein Arbeitsprofil"}
          </Text>
          <Text style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}>
            {profile.employerName || "Name und Arbeitgeber ergänzen"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={palette.primary} />
      </View>
      <View style={{ gap: SPACING.xs }}>
        <Text style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}>
          {profileWorkLabel(profile)}
        </Text>
        <Text style={{ ...TYPOGRAPHY.caption, color: palette.textMuted }}>
          {profileSalaryLabel(profile)}
        </Text>
      </View>
    </Pressable>
  );
}
