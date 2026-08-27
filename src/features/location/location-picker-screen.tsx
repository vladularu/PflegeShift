import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { EntryLocation } from "@/domain/types";
import {
  consumeLocationPickerQuery,
  publishLocationSelection,
} from "@/features/location/location-selection";
import {
  type LocationSearchResult,
  useLocationSearch,
} from "@/features/location/use-location-search";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE } from "@/theme/typography";

type PickerRow =
  | { readonly id: "custom"; readonly kind: "CUSTOM"; readonly query: string }
  | {
      readonly id: string;
      readonly kind: "ADDRESS";
      readonly result: LocationSearchResult;
    };

export function LocationPickerScreen() {
  const palette = usePalette();
  const [initialQuery] = useState(() => consumeLocationPickerQuery().trim());
  const [query, setQuery] = useState(initialQuery);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const trimmedQuery = query.trim();
  const { error, loading, resolveResult, results } = useLocationSearch(query);
  const rows = useMemo<readonly PickerRow[]>(() => {
    if (!trimmedQuery) return [];
    return [
      { id: "custom", kind: "CUSTOM", query: trimmedQuery },
      ...results.map((result) => ({
        id: result.id,
        kind: "ADDRESS" as const,
        result,
      })),
    ];
  }, [results, trimmedQuery]);

  function choose(location: EntryLocation) {
    publishLocationSelection(location);
    router.back();
  }

  function submitCustomLocation() {
    if (!trimmedQuery) {
      if (initialQuery) publishLocationSelection(null);
      router.back();
      return;
    }
    if (trimmedQuery === initialQuery) {
      router.back();
      return;
    }
    choose({ name: trimmedQuery });
  }

  function chooseSearchResult(result: LocationSearchResult) {
    if (resolvingId) return;
    setResolvingId(result.id);
    setSelectionError(null);
    void (async () => {
      try {
        const location = await resolveResult(result);
        setResolvingId(null);
        choose(location);
      } catch {
        setResolvingId(null);
        setSelectionError(
          "Adresse konnte nicht geladen werden. Du kannst den Ort als freien Ort übernehmen.",
        );
      }
    })();
  }

  function renderRow({ item }: { readonly item: PickerRow }) {
    if (item.kind === "CUSTOM") {
      return (
        <Pressable
          accessibilityHint="Übernimmt die Eingabe ohne Kartenposition"
          accessibilityLabel={`${item.query} als eigenen Ort verwenden`}
          accessibilityRole="button"
          disabled={resolvingId !== null}
          onPress={() => choose({ name: item.query })}
          style={({ pressed }) => [
            styles.resultRow,
            {
              backgroundColor: pressed ? palette.surfaceMuted : "transparent",
              opacity: resolvingId ? 0.5 : 1,
            },
          ]}
          testID="location-custom-result"
        >
          <Ionicons color={palette.textSecondary} name="location-outline" size={26} />
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={[styles.customResultText, { color: palette.text }]}
          >
            {item.query}
          </Text>
        </Pressable>
      );
    }

    const accessibilityLabel = [item.result.name, item.result.address].filter(Boolean).join(", ");
    return (
      <Pressable
        accessibilityHint="Übernimmt diese Adresse"
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        disabled={resolvingId !== null}
        onPress={() => chooseSearchResult(item.result)}
        style={({ pressed }) => [
          styles.resultRow,
          {
            backgroundColor: pressed ? palette.surfaceMuted : "transparent",
            opacity: resolvingId && resolvingId !== item.id ? 0.5 : 1,
          },
        ]}
        testID="location-address-result"
      >
        {resolvingId === item.id ? (
          <ActivityIndicator color={palette.primary} size="small" />
        ) : (
          <Ionicons color={palette.danger} name="location" size={27} />
        )}
        <View style={styles.resultTextColumn}>
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={[styles.resultTitle, { color: palette.text }]}
          >
            {item.result.name}
          </Text>
          {item.result.address ? (
            <Text
              ellipsizeMode="tail"
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              numberOfLines={2}
              style={[styles.resultAddress, { color: palette.textMuted }]}
            >
              {item.result.address}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.surface }]} testID="location-picker">
      <View
        style={[styles.header, { borderBottomColor: palette.separator }]}
        testID="location-picker-header"
      >
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={[styles.title, { color: palette.text }]}
        >
          Ort
        </Text>
      </View>

      <View
        style={[styles.inputRow, { borderBottomColor: palette.separator }]}
        testID="location-picker-input-row"
      >
        <TextInput
          accessibilityLabel="Ort oder Adresse"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          onChangeText={(value) => {
            setSelectionError(null);
            setQuery(value);
          }}
          onSubmitEditing={submitCustomLocation}
          placeholder="Gib einen Ort ein"
          placeholderTextColor={palette.textMuted}
          returnKeyType="done"
          selectionColor={palette.primary}
          style={[styles.input, { color: palette.text }]}
          value={query}
        />
        {loading ? (
          <View accessibilityLabel="Adressen werden gesucht" accessibilityRole="progressbar">
            <ActivityIndicator color={palette.primary} size="small" />
          </View>
        ) : null}
        {query.length > 0 ? (
          <Pressable
            accessibilityLabel="Ortseingabe löschen"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              setSelectionError(null);
              setQuery("");
            }}
            style={({ pressed }) => [styles.clearButton, { opacity: pressed ? 0.55 : 1 }]}
          >
            <Ionicons color={palette.textMuted} name="close-circle" size={22} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.resultsContent}
        data={rows}
        initialNumToRender={6}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: palette.separator }]} />
        )}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListFooterComponent={
          (selectionError ?? error) ? (
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={[styles.error, { color: palette.textMuted }]}
            >
              {selectionError ?? error}
            </Text>
          ) : null
        }
        renderItem={renderRow}
        style={styles.results}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  header: {
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600",
  },
  inputRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 22,
    paddingRight: 10,
  },
  input: {
    minHeight: 58,
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    paddingVertical: 0,
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  results: {
    flex: 1,
  },
  resultsContent: {
    flexGrow: 1,
  },
  resultRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  customResultText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
  },
  resultTextColumn: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
  },
  resultAddress: {
    fontSize: 14,
    lineHeight: 18,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
  error: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    fontSize: 13,
    lineHeight: 18,
  },
});
