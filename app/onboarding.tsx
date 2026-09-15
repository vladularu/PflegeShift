import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { DEV_TOOLS_AVAILABLE } from "@/infrastructure/dev-tools-policy";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function OnboardingRoute() {
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  return (
    // This native full-screen modal needs insets measured within its own presentation.
    <SafeAreaProvider>
      <OnboardingScreen preview={DEV_TOOLS_AVAILABLE && preview === "1"} />
    </SafeAreaProvider>
  );
}
