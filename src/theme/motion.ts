import { Easing } from "react-native";
import { ReduceMotion } from "react-native-reanimated";

const calmEasing = Easing.bezier(0.22, 1, 0.36, 1);

export const MOTION = {
  duration: {
    instant: 100,
    fast: 180,
    normal: 300,
    deliberate: 380,
    scene: 420,
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
