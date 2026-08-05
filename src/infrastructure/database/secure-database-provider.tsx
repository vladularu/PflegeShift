import { type PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

export function SecureDatabaseProvider(_props: PropsWithChildren) {
  return (
    <View accessibilityRole="alert" style={styles.centered}>
      <Text accessibilityRole="header" style={styles.title}>
        PflegeShift ist für iPhone und Android verfügbar
      </Text>
      <Text style={styles.body}>
        Die verschlüsselte lokale Datenbank wird im Web nicht unterstützt. Nutze einen nativen
        Development- oder Production-Build, damit keine sensiblen Dienstplandaten unverschlüsselt
        gespeichert werden.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    color: "#40504A",
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 520,
    textAlign: "center",
  },
  centered: {
    alignItems: "center",
    backgroundColor: "#F5F7F6",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#17211E",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
});
