import { Easing as NativeEasing } from "react-native";
import { Easing as ReanimatedEasing, ReduceMotion } from "react-native-reanimated";

const calmEasing = ReanimatedEasing.bezier(0.22, 1, 0.36, 1);
const navigationEasing = NativeEasing.bezier(0.22, 1, 0.36, 1);

export const MOTION = {
  duration: {
    instant: 100,
    fast: 160,
    normal: 240,
    deliberate: 280,
    scene: 320,
  },
  distance: {
    subtle: 4,
    small: 8,
    medium: 12,
    scene: 36,
  },
  scale: {
    press: 0.98,
    emphasis: 0.97,
    enter: 0.985,
  },
  easing: {
    calm: calmEasing,
    navigation: navigationEasing,
    standard: calmEasing,
    emphasized: calmEasing,
  },
  spring: {
    press: {
      damping: 29,
      stiffness: 320,
      mass: 0.65,
      overshootClamping: true,
      restDisplacementThreshold: 0.001,
      restSpeedThreshold: 0.001,
    },
    settle: {
      damping: 27,
      stiffness: 210,
      mass: 0.85,
      overshootClamping: true,
      restDisplacementThreshold: 0.001,
      restSpeedThreshold: 0.001,
    },
  },
  reduceMotion: ReduceMotion.System,
} as const;
