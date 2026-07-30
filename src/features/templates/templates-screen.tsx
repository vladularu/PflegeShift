import { router } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { useMediShift } from "@/application/medishift-provider";
import type { ShiftTemplate } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { PrimaryButton } from "@/ui/form-controls";
import { LoadingView } from "@/ui/loading-view";

export function TemplatesScreen() {
  const palette = usePalette();
  const { templates, ready, error, removeTemplate, moveTemplate } = useMediShift();

  if (!ready) return <LoadingView label="Vorlagen werden geladen …" />;

  function confirmDelete(template: ShiftTemplate) {
    Alert.alert(
      "Vorlage löschen?",
      `„${template.name}“ wird aus der Auswahl entfernt. Bereits eingetragene Dienste bleiben unverändert.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: () => void removeTemplate(template),
        },
      ],
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 14, padding: 18, paddingBottom: 36 }}
    >
      <View style={{ gap: 4 }}>
        <Text selectable style={{ color: palette.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 }}>
          Schnelle Dienste
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 13, lineHeight: 19 }}>
          Änderungen gelten nur für neue Einträge. Bestehende Dienste behalten ihre gespeicherten Zeiten und Farben.
        </Text>
      </View>

      {templates.map((template, index) => (
        <Pressable
          key={template.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/template-editor", params: { id: template.id } })}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 17,
            borderCurve: "continuous",
            backgroundColor: palette.surface,
            opacity: pressed ? 0.78 : 1,
            padding: 13,
            boxShadow: palette.dark ? undefined : "0 2px 10px rgba(24,32,30,0.05)",
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 13,
              borderCurve: "continuous",
              backgroundColor: template.color,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900" }}>{template.symbol}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={{ color: palette.text, fontSize: 16, fontWeight: "800" }}>
              {template.name}
            </Text>
            <Text selectable style={{ color: palette.textMuted, fontSize: 13, fontVariant: ["tabular-nums"] }}>
              {template.startTime}–{template.endTime} · {template.breakMinutes} Min. Pause
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <Pressable
              accessibilityLabel={`${template.name} nach oben`}
              disabled={index === 0}
              onPress={() => void moveTemplate(template, -1)}
              style={{ opacity: index === 0 ? 0.25 : 1, padding: 8 }}
            >
              <Text style={{ color: palette.primary, fontSize: 18, fontWeight: "900" }}>↑</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`${template.name} nach unten`}
              disabled={index === templates.length - 1}
              onPress={() => void moveTemplate(template, 1)}
              style={{ opacity: index === templates.length - 1 ? 0.25 : 1, padding: 8 }}
            >
              <Text style={{ color: palette.primary, fontSize: 18, fontWeight: "900" }}>↓</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`${template.name} löschen`}
              onPress={() => confirmDelete(template)}
              style={{ padding: 8 }}
            >
              <Text style={{ color: palette.danger, fontSize: 17, fontWeight: "900" }}>×</Text>
            </Pressable>
          </View>
        </Pressable>
      ))}

      {error ? (
        <Text accessibilityRole="alert" selectable style={{ color: palette.danger, fontWeight: "700" }}>
          {error}
        </Text>
      ) : null}

      <PrimaryButton onPress={() => router.push("/template-editor")}>Neue Vorlage</PrimaryButton>
    </ScrollView>
  );
}
