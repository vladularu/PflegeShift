import { router, useNavigation } from "expo-router";
import { usePreventRemove, type NavigationAction } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

export function useProfileLeaveGuard(dirty: boolean, saving: boolean) {
  const navigation = useNavigation();
  const [exit, setExit] = useState<{ action?: NavigationAction } | null>(null);
  const alertOpen = useRef(false);
  const handled = useRef(false);
  usePreventRemove((dirty || saving) && exit === null, ({ data }) => {
    if (saving || alertOpen.current) return;
    alertOpen.current = true;
    Alert.alert("Änderungen verwerfen?", "Deine Änderungen sind noch nicht gespeichert.", [
      {
        text: "Weiter bearbeiten",
        style: "cancel",
        onPress: () => {
          alertOpen.current = false;
        },
      },
      {
        text: "Änderungen verwerfen",
        style: "destructive",
        onPress: () => {
          alertOpen.current = false;
          setExit({ action: data.action });
        },
      },
    ]);
  });
  useEffect(() => {
    if (!exit || handled.current) return;
    handled.current = true;
    if (exit.action) navigation.dispatch(exit.action);
    else router.back();
  }, [exit, navigation]);
  return {
    cancel: () => {
      if (!saving) setExit({});
    },
    saved: () => setExit({}),
  };
}
