import { router, Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import type { SettingsInfoSection } from "@/navigation/routes";
import { APP_RUNTIME_LABEL } from "@/infrastructure/app-version";
import { parseEnumRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { SurfaceCard } from "@/ui/design-system";
import { LoadFailureView } from "@/ui/loading-view";

interface InfoContent {
  readonly title: string;
  readonly intro: string;
  readonly items: readonly {
    readonly title: string;
    readonly text: string;
  }[];
}

const INFO_CONTENT: Readonly<Record<SettingsInfoSection, InfoContent>> = {
  STORAGE: {
    title: "Lokale Datenspeicherung",
    intro:
      "MediShift arbeitet offline und speichert deine Angaben ausschließlich auf diesem Gerät.",
    items: [
      {
        title: "Kein Konto erforderlich",
        text: "Dienste, Termine, Tarifprofil und Einstellungen liegen in einer lokalen SQLite-Datenbank.",
      },
      {
        title: "Keine vorgetäuschte Synchronisation",
        text: "Aktuell gibt es weder Cloud-Sync noch ein automatisches Backup. Eine Deinstallation kann lokale Daten entfernen.",
      },
      {
        title: "Datenschutz",
        text: "Die App überträgt diese Daten nicht an einen MediShift-Server.",
      },
    ],
  },
  CALCULATION: {
    title: "Berechnungshinweise",
    intro:
      "Alle Auswertungen werden lokal aus deinem Arbeitszeitmodell, deinen Diensten und deinem Tarifprofil abgeleitet.",
    items: [
      {
        title: "Arbeitszeit",
        text: "Ist-Zeit entspricht der Dienstzeit abzüglich Pause. Termine zählen nicht als Arbeitszeit; Abwesenheiten werden nach dem hinterlegten Tages-Soll bewertet.",
      },
      {
        title: "Feiertage und Zuschläge",
        text: "Bundesland, Uhrzeit und Tarifstand bestimmen Feiertage und Zuschläge. Überschneidungen werden minutengenau aufgeteilt.",
      },
      {
        title: "Schätzung statt Abrechnung",
        text: "Gehalt und Hinweise sind eine Orientierung, keine Lohnabrechnung oder Rechtsberatung. Maßgeblich bleiben Dienstvereinbarung, Tarifvertrag und Abrechnung.",
      },
    ],
  },
  TVOED_ALLOWANCE: {
    title: "TVöD-Zulage",
    intro:
      "Die allgemeine TVöD-Zulage wird automatisch aus deinem Tarifprofil und Beschäftigungsumfang abgeleitet.",
    items: [
      {
        title: "Vollzeitbetrag",
        text: "MediShift berücksichtigt 25 Euro pro Monat bei Vollzeit. Bei Teilzeit wird der Betrag entsprechend der hinterlegten Wochenarbeitszeit anteilig berechnet.",
      },
      {
        title: "Geltungsbereich",
        text: "Die Zulage wird nur für unterstützte TVöD-P-Tarifprofile und den jeweils gültigen Tarifzeitraum berücksichtigt.",
      },
      {
        title: "Hinweis",
        text: "Dienstvereinbarungen oder abweichende Arbeitgeberregelungen können die tatsächliche Abrechnung verändern.",
      },
    ],
  },
  CARE_ALLOWANCE: {
    title: "Pflegezulage TVöD-P",
    intro:
      "Die Pflegezulage wird aus dem gültigen Tarifstand und deinem Beschäftigungsumfang berechnet.",
    items: [
      {
        title: "Automatische Höhe",
        text: "MediShift verwendet den im gewählten Monat gültigen Vollzeitbetrag und rechnet ihn bei Teilzeit proportional zur Wochenarbeitszeit um.",
      },
      {
        title: "Tarifprofil",
        text: "Die Berechnung setzt ein unterstütztes TVöD-P-Profil mit Gruppe, Stufe und Bereich voraus.",
      },
      {
        title: "Schätzung",
        text: "Der angezeigte Wert dient der Orientierung und ersetzt nicht die individuelle Entgeltabrechnung.",
      },
    ],
  },
  ABOUT: {
    title: "Über MediShift",
    intro: "Ein unabhängiger, offline-first Dienstplaner für Schichtarbeit im Gesundheitswesen.",
    items: [
      {
        title: "Version",
        text: APP_RUNTIME_LABEL,
      },
      {
        title: "Produktprinzip",
        text: "Schnelle Dienstplanung, nachvollziehbare Berechnungen und möglichst wenige dauerhaft sichtbare Bedienelemente.",
      },
      {
        title: "Hinweis",
        text: "MediShift ist eigenständig und nicht mit SuperShift oder einem Tarifpartner verbunden.",
      },
    ],
  },
};

export function SettingsInfoDetailsScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ section?: RouteParam }>();
  const parsedSection = parseEnumRouteParam(params.section, [
    "STORAGE",
    "CALCULATION",
    "ABOUT",
    "TVOED_ALLOWANCE",
    "CARE_ALLOWANCE",
  ] as const);
  if (parsedSection.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zur Information enthält einen unbekannten Bereich."
        onRetry={() => router.back()}
        title="Information kann nicht geöffnet werden"
      />
    );
  }
  const section: SettingsInfoSection = parsedSection.value;
  const content = INFO_CONTENT[section];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 32 }}
    >
      <Stack.Screen options={{ title: content.title }} />
      <Text selectable style={{ color: palette.textSecondary, fontSize: 14, lineHeight: 21 }}>
        {content.intro}
      </Text>
      <SurfaceCard>
        {content.items.map((item, index) => (
          <View
            key={item.title}
            style={{
              gap: 4,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: palette.separator,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text selectable style={{ color: palette.text, fontSize: 15, fontWeight: "800" }}>
              {item.title}
            </Text>
            <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 18 }}>
              {item.text}
            </Text>
          </View>
        ))}
      </SurfaceCard>
    </ScrollView>
  );
}
