import { createContext, useContext, type PropsWithChildren } from "react";
import { Keyboard, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { usePalette } from "@/theme/palette";
import { SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import { FormScreen } from "@/ui/form-layout";
import { SheetBackFooter } from "@/ui/sheet-back-footer";

export const ProfilePageTitleContext = createContext("Arbeitsprofil");

export function ProfilePage({
  children,
  title,
  backLabel,
  onBack,
  backDisabled = false,
  testID,
}: PropsWithChildren<{
  readonly title: string;
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly backDisabled?: boolean;
  readonly testID?: string;
}>) {
  const palette = usePalette();
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <ProfilePageTitleContext.Provider value={title}>
      <View testID={testID} style={{ flex: 1, backgroundColor: palette.background }}>
        <View style={{ flex: 1 }}>
          <FormScreen bottomPadding={SPACING.xxl} testID="profile-scroll-content">
            {children}
          </FormScreen>
        </View>
        <View
          testID="profile-back-footer"
          style={{
            borderTopWidth: 1,
            borderTopColor: palette.separator,
            paddingTop: SPACING.md,
            paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
            paddingBottom: Math.max(insets?.bottom ?? 0, SPACING.md),
          }}
        >
          <SheetBackFooter
            disabled={backDisabled}
            label={backLabel}
            onPress={() => {
              Keyboard.dismiss();
              onBack();
            }}
          />
        </View>
      </View>
    </ProfilePageTitleContext.Provider>
  );
}
