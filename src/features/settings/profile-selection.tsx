import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Keyboard, Text, View } from "react-native";
import { profileSelectionRoute } from "@/navigation/routes";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CardSeparator, RowButton, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { Field, type DropdownOption } from "@/ui/form-controls";
import { ProfilePage, ProfilePageTitleContext } from "./profile-page";
import { LoadFailureView } from "@/ui/loading-view";

type ChoiceValue = string | number;
interface SelectionRequest {
  readonly id: string;
  readonly title: string;
  readonly returnTo: string;
  readonly value: ChoiceValue;
  readonly options: readonly DropdownOption<ChoiceValue>[];
  readonly onChange: (value: ChoiceValue) => void;
}
interface SelectionContextValue {
  readonly request: SelectionRequest | null;
  readonly open: (request: Omit<SelectionRequest, "id">) => void;
  readonly clear: (requestId?: string) => void;
}
const SelectionContext = createContext<SelectionContextValue | null>(null);
export const ProfileEditorBusyContext = createContext(false);
export function ProfileSelectionProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<SelectionRequest | null>(null);
  const sequence = useRef(0);
  const clear = useCallback(
    (requestId?: string) =>
      setRequest((current) =>
        requestId === undefined || current?.id === requestId ? null : current,
      ),
    [],
  );
  return (
    <SelectionContext.Provider
      value={{
        request,
        open: (next) => {
          Keyboard.dismiss();
          const id = `profile-choice-${++sequence.current}`;
          setRequest({ ...next, id });
          router.push(profileSelectionRoute(id));
        },
        clear,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}
export function ProfileChoice<T extends ChoiceValue>({
  label,
  value,
  options,
  onChange,
  modalTitle,
  disabled = false,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly DropdownOption<T>[];
  readonly onChange: (value: T) => void;
  readonly modalTitle?: string;
  readonly disabled?: boolean;
}) {
  const context = useContext(SelectionContext);
  const busy = useContext(ProfileEditorBusyContext);
  const returnTo = useContext(ProfilePageTitleContext);
  const selected = options.find((option) => option.value === value);
  const valueLabel = selected?.selectionLabel ?? selected?.label ?? "Bitte auswählen";
  if (!context) throw new Error("ProfileSelectionProvider fehlt.");
  return (
    <RowButton
      title={label}
      subtitle={valueLabel}
      disabled={busy || disabled}
      accessibilityLabel={`${label}: ${valueLabel}`}
      accessibilityHint="Öffnet eine Auswahlseite. Auswahl wird erst beim Speichern übernommen."
      onPress={() =>
        context.open({
          title: modalTitle ?? label,
          returnTo,
          value,
          options,
          onChange: (next) => {
            const option = options.find((candidate) => candidate.value === next);
            if (option) onChange(option.value);
          },
        })
      }
    />
  );
}
export function ProfileSelectionScreen() {
  const context = useContext(SelectionContext);
  const params = useLocalSearchParams<{ requestId?: string }>();
  const matchingRequest =
    context?.request && (!params.requestId || params.requestId === context.request.id)
      ? context.request
      : null;
  const [initialRequest] = useState(matchingRequest);
  const request = matchingRequest ?? initialRequest;
  if (!request)
    return (
      <LoadFailureView
        title="Auswahl nicht verfügbar"
        message="Öffne die Auswahl erneut in deinem Arbeitsprofil."
        actionLabel="Zurück"
        onRetry={() => router.back()}
      />
    );
  return <SelectionPage key={request.id} request={request} clear={context!.clear} />;
}
function SelectionPage({
  request,
  clear,
}: {
  readonly request: SelectionRequest;
  readonly clear: (requestId?: string) => void;
}) {
  const palette = usePalette();
  const [query, setQuery] = useState("");
  const choosing = useRef(false);
  useEffect(() => () => clear(request.id), [clear, request.id]);
  const search = query.trim().toLocaleLowerCase("de-DE");
  const options = request.options
    .filter((option) => option.value !== "UNSET")
    .filter((option) =>
      `${option.label} ${option.subtitle ?? ""} ${option.group ?? ""}`
        .toLocaleLowerCase("de-DE")
        .includes(search),
    );
  const groups = [...new Set(options.map((option) => option.group ?? ""))];
  return (
    <ProfilePage
      title={request.title}
      backLabel={`Zurück zu ${request.returnTo}`}
      onBack={() => {
        if (choosing.current) return;
        choosing.current = true;
        clear(request.id);
        router.back();
      }}
      testID="profile-selection-content"
    >
      <Stack.Screen
        options={{
          title: request.title,
          presentation: "card",
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          statusBarStyle: palette.dark ? "light" : "dark",
        }}
      />
      {request.title === "Tarifvertrag" ? (
        <Field
          label="Tarif suchen"
          value={query}
          onChangeText={setQuery}
          placeholder="Tarif suchen"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      ) : null}
      {groups.map((group) => (
        <View key={group} style={{ gap: SPACING.sm }}>
          {group ? <SectionHeader title={group} /> : null}
          <SurfaceCard>
            {options
              .filter((option) => (option.group ?? "") === group)
              .map((option, index) => (
                <View key={option.value}>
                  {index ? <CardSeparator /> : null}
                  <RowButton
                    title={option.label}
                    subtitle={option.subtitle}
                    accessibilityLabel={option.selectionLabel ?? option.label}
                    accessibilityState={{ selected: option.value === request.value }}
                    trailing={
                      option.value === request.value ? (
                        <Ionicons
                          accessibilityElementsHidden
                          name="checkmark"
                          size={22}
                          color={palette.primary}
                        />
                      ) : (
                        <View style={{ width: 22 }} />
                      )
                    }
                    onPress={() => {
                      if (choosing.current) return;
                      choosing.current = true;
                      request.onChange(option.value);
                      clear(request.id);
                      router.back();
                    }}
                  />
                </View>
              ))}
          </SurfaceCard>
        </View>
      ))}
      {!options.length ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
        >
          Keine passenden Tarife gefunden.
        </Text>
      ) : null}
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: palette.textMuted, ...TYPOGRAPHY.footnote }}
      >
        Auswahl wird in deinen Entwurf übernommen.
      </Text>
    </ProfilePage>
  );
}
export function useProfileSelection() {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("ProfileSelectionProvider fehlt.");
  return context;
}
