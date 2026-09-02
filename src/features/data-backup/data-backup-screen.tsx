import { Stack } from "expo-router";
import { Alert, Text, View } from "react-native";

import { useLocalBackupExport } from "@/features/data-backup/use-local-backup-export";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { InlineNotice, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { useFeedback } from "@/ui/feedback";
import { PrimaryButton } from "@/ui/form-controls";
import { ScreenScrollView } from "@/ui/screen-layout";

export function DataBackupScreen() {
  const palette = usePalette();
  const { busy, createAndShare } = useLocalBackupExport();
  const { showFeedback } = useFeedback();

  async function createBackup() {
    try {
      const result = await createAndShare();
      if (result === "shared") {
        showFeedback({ message: "Backup wurde an iOS übergeben." });
      }
    } catch (error) {
      const blocked = error instanceof Error && error.name === "LocalBackupBlockedError";
      Alert.alert(
        blocked ? "Testlauf zuerst abschließen" : "Backup fehlgeschlagen",
        blocked && error instanceof Error
          ? error.message
          : "Die Backup-Datei konnte nicht erstellt oder geteilt werden. Deine Daten wurden nicht verändert.",
      );
    }
  }

  return (
    <ScreenScrollView surface="groupedBackground">
      <Stack.Screen options={{ title: "Datensicherung" }} />

      <View style={{ gap: SPACING.sm }}>
        <SectionHeader
          caption="Eine vollständige Kopie deiner aktuellen LUNA-Shift-Daten."
          title="Lokales Backup"
        />
        <SurfaceCard style={{ padding: SPACING.lg, gap: SPACING.sm }}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
          >
            Enthalten
          </Text>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
          >
            Profil, Dienstvorlagen, Dienste, Termine, Tarifentscheidungen und sichtbare
            Einstellungen.
          </Text>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
          >
            Nicht enthalten
          </Text>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
          >
            Testlabor-Zustand, geplante Systemmitteilungen und der lokale Regelwerkscache.
          </Text>
        </SurfaceCard>
      </View>

      <InlineNotice
        message="Die JSON-Datei enthält persönliche Daten und ist außerhalb der App nicht verschlüsselt. Lege sie nur an einem geschützten Ort ab."
        tone="warning"
      />

      <PrimaryButton
        busy={busy}
        busyLabel="Backup wird erstellt"
        onPress={() => void createBackup()}
      >
        Backup erstellen und teilen
      </PrimaryButton>

      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, textAlign: "center", ...TYPOGRAPHY.caption }}
      >
        Beim Erstellen wird die lokale Datenbank nicht verändert.
      </Text>
    </ScreenScrollView>
  );
}
