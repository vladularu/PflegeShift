import { Stack } from "expo-router";
import { Alert, Text, View } from "react-native";
import { BackupTempCleanupError } from "@/features/data-backup/backup-temp-file";

import {
  LocalBackupReloadRequiredError,
  LocalBackupRestoreRecoveryError,
  LocalBackupSelectionError,
} from "@/features/data-backup/local-backup-restore-errors";
import { useLocalBackupExport } from "@/features/data-backup/use-local-backup-export";
import { useLocalBackupRestore } from "@/features/data-backup/use-local-backup-restore";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { InlineNotice, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { useFeedback } from "@/ui/feedback";
import { PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { ScreenScrollView } from "@/ui/screen-layout";

const BACKUP_DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function countLabel(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("de-DE")} ${count === 1 ? singular : plural}`;
}

function backupDate(value: string): string {
  return BACKUP_DATE_FORMATTER.format(new Date(value));
}

function dateRange(first: string | null, last: string | null): string {
  if (first === null || last === null) return "Keine Dienste oder Termine";
  if (first === last) return first.split("-").reverse().join(".");
  return `${first.split("-").reverse().join(".")} – ${last.split("-").reverse().join(".")}`;
}

export function DataBackupScreen() {
  const palette = usePalette();
  const { busy: exportBusy, createAndShare } = useLocalBackupExport();
  const { busy: restoreBusy, candidate, restoreSelected, selectBackup } = useLocalBackupRestore();
  const { showFeedback } = useFeedback();
  const busy = exportBusy || restoreBusy;

  async function createBackup() {
    try {
      const result = await createAndShare();
      if (result === "shared") {
        showFeedback({ message: "Backup wurde an iOS übergeben." });
      }
    } catch (error) {
      if (error instanceof BackupTempCleanupError) {
        Alert.alert(
          "Temporäre Datei verblieben",
          `${error.message} ${error.operationFailed ? "Der Export wurde nicht erfolgreich abgeschlossen." : "Der Teilen-Dialog ist beendet. Prüfe am gewählten Speicherort, ob deine Sicherung gespeichert wurde."} Deine App-Daten sind unverändert.`,
        );
        return;
      }
      const blocked = error instanceof Error && error.name === "LocalBackupBlockedError";
      Alert.alert(
        blocked ? "Testlauf zuerst abschließen" : "Backup fehlgeschlagen",
        blocked && error instanceof Error
          ? error.message
          : "Die Backup-Datei konnte nicht erstellt oder geteilt werden. Deine Daten wurden nicht verändert.",
      );
    }
  }

  async function chooseBackup() {
    try {
      const result = await selectBackup();
      if (result === "selected") showFeedback({ message: "Backup wurde geprüft." });
    } catch (error) {
      if (error instanceof BackupTempCleanupError) {
        Alert.alert(
          "Temporäre Datei verblieben",
          `${error.message} Die Wiederherstellung wurde nicht gestartet. Deine App-Daten und die ausgewählte Originaldatei sind unverändert.`,
        );
        return;
      }
      Alert.alert(
        "Backup nicht verwendbar",
        error instanceof LocalBackupSelectionError
          ? error.message
          : "Die Datei konnte nicht gelesen oder geprüft werden. Deine Daten wurden nicht verändert.",
      );
    }
  }

  async function restoreBackup() {
    try {
      await restoreSelected();
    } catch (error) {
      if (error instanceof Error && error.name === "LocalBackupBlockedError") {
        Alert.alert(
          "Testlauf zuerst abschließen",
          "Im Testlabor ist noch ein Testlauf offen. Stelle zuerst das Original wieder her oder übernimm die Testdaten.",
        );
        return;
      }
      if (error instanceof LocalBackupReloadRequiredError) {
        Alert.alert("Daten wiederhergestellt", error.message);
        return;
      }
      if (error instanceof LocalBackupRestoreRecoveryError) {
        Alert.alert("Neustart erforderlich", error.message);
        return;
      }
      Alert.alert(
        "Wiederherstellung fehlgeschlagen",
        "Deine Daten wurden nicht ersetzt. Prüfe die Datei und versuche es erneut.",
      );
    }
  }

  function confirmRestore() {
    if (candidate === null) return;
    confirmDestructiveAction({
      title: "Aktuelle Daten ersetzen?",
      message: `Das Backup vom ${backupDate(candidate.preview.createdAt)} ersetzt dein Profil, deine Vorlagen, Dienste, Termine, Tarifentscheidungen und sichtbaren Einstellungen. Dieser Schritt lässt sich nicht rückgängig machen.`,
      confirmLabel: "Daten ersetzen",
      onConfirm: () => void restoreBackup(),
    });
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
        busy={exportBusy}
        busyLabel="Backup wird erstellt"
        disabled={restoreBusy}
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

      <View style={{ gap: SPACING.sm }}>
        <SectionHeader
          caption="Eine lokale JSON-Sicherung auswählen und vor dem Ersetzen prüfen."
          title="Backup wiederherstellen"
        />

        <InlineNotice
          message="Beim Wiederherstellen werden deine aktuellen Daten ersetzt. Lege vorher ein aktuelles Backup an einem geschützten Ort ab."
          tone="warning"
        />

        {candidate === null ? (
          <SecondaryButton disabled={busy} onPress={() => void chooseBackup()}>
            Backup-Datei auswählen
          </SecondaryButton>
        ) : (
          <>
            <SurfaceCard style={{ padding: SPACING.lg, gap: SPACING.sm }}>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                numberOfLines={2}
                selectable
                style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
              >
                {candidate.fileName}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
              >
                Erstellt am {backupDate(candidate.preview.createdAt)}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ color: palette.text, ...TYPOGRAPHY.body }}
              >
                {countLabel(candidate.preview.shiftCount, "Dienst", "Dienste")} ·{" "}
                {countLabel(candidate.preview.appointmentCount, "Termin", "Termine")}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ color: palette.text, ...TYPOGRAPHY.body }}
              >
                {countLabel(candidate.preview.templateCount, "Vorlage", "Vorlagen")} ·{" "}
                {countLabel(
                  candidate.preview.monthlyTariffDecisionCount,
                  "Tarifmonat",
                  "Tarifmonate",
                )}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
              >
                Zeitraum:{" "}
                {dateRange(candidate.preview.firstEntryDate, candidate.preview.lastEntryDate)}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
              >
                Profil {candidate.preview.profileIncluded ? "enthalten" : "nicht enthalten"} ·{" "}
                {countLabel(
                  candidate.preview.preferenceCount,
                  "sichtbare Einstellung",
                  "sichtbare Einstellungen",
                )}
                {candidate.preview.deletedRecordCount > 0
                  ? ` · ${countLabel(candidate.preview.deletedRecordCount, "gelöschter Datensatz", "gelöschte Datensätze")}`
                  : ""}
              </Text>
            </SurfaceCard>

            <SecondaryButton disabled={busy} onPress={() => void chooseBackup()}>
              Andere Datei wählen
            </SecondaryButton>
            <PrimaryButton
              busy={restoreBusy}
              busyLabel="Daten werden wiederhergestellt"
              danger
              disabled={exportBusy}
              onPress={confirmRestore}
            >
              Aktuelle Daten ersetzen
            </PrimaryButton>
          </>
        )}
      </View>
    </ScreenScrollView>
  );
}
