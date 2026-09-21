import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ComponentProps } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import {
  ANALYSIS_CARD_TITLES,
  DEFAULT_ANALYSIS_VIEW,
  moveAnalysisCard,
  type AnalysisCardId,
} from "@/domain/analysis-view";
import { usePalette } from "@/theme/palette";
import { SPACING, RADII } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { SurfaceCard } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";
import { useAnalysisView } from "./analysis-view-preferences";

const CARD_ICONS: Record<AnalysisCardId, ComponentProps<typeof Ionicons>["name"]> = {
  WORK: "time-outline",
  CHECK: "shield-checkmark-outline",
  PAY: "wallet-outline",
  SHIFTS: "calendar-outline",
};

export function AnalysisViewControls({ compact = false }: { readonly compact?: boolean }) {
  const p = usePalette();
  const state = useAnalysisView();
  const [open, setOpen] = useState(false);
  const [sorting, setSorting] = useState(false);
  const reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3;
  const error = state.error ? (
    <View accessibilityRole="alert" style={{ gap: SPACING.sm }}>
      <Text style={{ color: p.text, ...TYPOGRAPHY.body }}>{state.error}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={state.retry}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: p.primary, ...TYPOGRAPHY.bodyStrong }}>Erneut versuchen</Text>
      </Pressable>
    </View>
  ) : null;
  return (
    <View style={{ gap: SPACING.sm }}>
      {compact ? null : error}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ansicht anpassen"
        disabled={!state.ready}
        accessibilityState={{ disabled: !state.ready }}
        onPress={() => {
          selectionFeedback();
          setSorting(false);
          setOpen(true);
        }}
        style={({ pressed }) => ({
          minHeight: 44,
          minWidth: 44,
          width: compact ? 44 : undefined,
          borderRadius: compact ? RADII.pill : undefined,
          borderWidth: compact ? 1 : 0,
          borderColor: p.separator,
          backgroundColor: compact ? p.surface : undefined,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: SPACING.sm,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Ionicons name="options-outline" color={p.textMuted} size={19} />
        {compact ? null : (
          <Text style={{ color: p.textMuted, ...TYPOGRAPHY.body }}>
            {state.ready ? "Ansicht anpassen" : "Ansicht wird geladen …"}
          </Text>
        )}
      </Pressable>
      <Modal
        visible={open}
        presentationStyle="pageSheet"
        animationType={reduced ? "none" : "slide"}
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: p.groupedBackground }}>
            <View
              style={{
                padding: SPACING.lg,
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.md,
              }}
            >
              <Text
                accessibilityRole="header"
                style={{ flex: 1, color: p.text, ...TYPOGRAPHY.screenTitle }}
              >
                Ansicht anpassen
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ansicht schließen"
                onPress={() => setOpen(false)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  minWidth: 44,
                  borderRadius: RADII.pill,
                  backgroundColor: p.surfaceMuted,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Ionicons name="close" size={22} color={p.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
              <View
                style={{
                  flexDirection: stacked ? "column" : "row",
                  alignItems: stacked ? "stretch" : "center",
                  justifyContent: "flex-end",
                  gap: SPACING.sm,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={sorting ? "Auswahl anzeigen" : "Reihenfolge ändern"}
                  accessibilityState={{ selected: sorting }}
                  onPress={() => {
                    selectionFeedback();
                    setSorting((value) => !value);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: SPACING.md,
                    flexDirection: "row",
                    gap: SPACING.sm,
                    alignItems: "center",
                    justifyContent: "center",
                    alignSelf: "flex-end",
                    borderRadius: RADII.control,
                    backgroundColor: p.surface,
                    borderColor: p.separator,
                    borderWidth: 1,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <Ionicons
                    name={sorting ? "checkmark" : "swap-vertical-outline"}
                    size={18}
                    color={p.textMuted}
                  />
                  <Text style={{ color: p.text, ...TYPOGRAPHY.body }}>
                    {sorting ? "Auswahl" : "Sortieren"}
                  </Text>
                </Pressable>
              </View>
              <SurfaceCard>
                {state.preferences.order.map((id, index) => {
                  const visible = !state.preferences.hidden.includes(id);
                  return (
                    <View
                      key={id}
                      testID={`analysis-setting-${id}`}
                      style={{
                        minHeight: 72,
                        borderTopWidth: index > 0 ? 1 : 0,
                        borderTopColor: p.separator,
                        paddingHorizontal: SPACING.lg,
                        paddingVertical: SPACING.sm,
                        gap: SPACING.md,
                        flexDirection: stacked ? "column" : "row",
                        alignItems: stacked ? "stretch" : "center",
                      }}
                    >
                      <View
                        style={{
                          flex: stacked ? undefined : 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: SPACING.md,
                        }}
                      >
                        <Ionicons name={CARD_ICONS[id]} size={22} color={p.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: p.text, ...TYPOGRAPHY.body }}>
                            {ANALYSIS_CARD_TITLES[id]}
                          </Text>
                          {sorting && !visible ? (
                            <Text style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
                              Ausgeblendet
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      {sorting ? (
                        <View
                          style={{
                            flexDirection: "row",
                            gap: SPACING.xs,
                            alignSelf: stacked ? "flex-end" : undefined,
                          }}
                        >
                          {([-1, 1] as const).map((delta) => {
                            const disabled =
                              index + delta < 0 || index + delta >= state.preferences.order.length;
                            return (
                              <Pressable
                                key={delta}
                                accessibilityRole="button"
                                accessibilityLabel={
                                  ANALYSIS_CARD_TITLES[id] +
                                  (delta === -1 ? " nach oben" : " nach unten")
                                }
                                disabled={disabled}
                                accessibilityState={{ disabled }}
                                onPress={() => {
                                  selectionFeedback();
                                  state.update((current) => moveAnalysisCard(current, id, delta));
                                }}
                                style={({ pressed }) => ({
                                  minWidth: 44,
                                  minHeight: 44,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: RADII.control,
                                  backgroundColor: p.surfaceMuted,
                                  opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
                                })}
                              >
                                <Ionicons
                                  name={delta === -1 ? "chevron-up" : "chevron-down"}
                                  size={19}
                                  color={p.text}
                                />
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : (
                        <View
                          style={{
                            minHeight: 44,
                            justifyContent: "center",
                            alignSelf: stacked ? "flex-end" : undefined,
                          }}
                        >
                          <Switch
                            accessibilityLabel={ANALYSIS_CARD_TITLES[id] + " anzeigen"}
                            hitSlop={8}
                            value={visible}
                            trackColor={{ true: p.accent, false: p.surfaceMuted }}
                            onValueChange={(enabled) => {
                              selectionFeedback();
                              state.update((current) => ({
                                ...current,
                                hidden: enabled
                                  ? current.hidden.filter((key) => key !== id)
                                  : [...current.hidden, id],
                              }));
                            }}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </SurfaceCard>
              {error}
              {state.saving ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}
                >
                  Wird gespeichert …
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  selectionFeedback();
                  state.update(() => DEFAULT_ANALYSIS_VIEW);
                }}
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: SPACING.sm,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.sm,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <Ionicons name="refresh-outline" size={18} color={p.textMuted} />
                <Text style={{ color: p.textMuted, ...TYPOGRAPHY.body }}>
                  Standard wiederherstellen
                </Text>
              </Pressable>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={({ pressed }) => ({
                minHeight: 48,
                margin: SPACING.lg,
                padding: SPACING.md,
                borderRadius: RADII.control,
                alignItems: "center",
                backgroundColor: p.surface,
                borderColor: p.separator,
                borderWidth: 1,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: p.text, ...TYPOGRAPHY.bodyStrong }}>Fertig</Text>
            </Pressable>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
