import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { MOTION } from "@/theme/motion";

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function usePressMotion(
  restingScale: number = 1,
  pressedScale: number = MOTION.scale.press,
) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(false);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduceMotion
          ? 1
          : pressed.value
            ? withSpring(pressedScale, MOTION.spring.press)
            : withSpring(restingScale, MOTION.spring.settle),
      },
    ],
  }));

  return {
    animatedStyle,
    onPressIn: () => {
      pressed.value = true;
    },
    onPressOut: () => {
      pressed.value = false;
    },
  } as const;
}
