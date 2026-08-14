import { Easing, ReduceMotion } from "react-native-reanimated";

export const MOTION = {
  duration: {
    instant: 100,
    fast: 160,
    normal: 220,
    deliberate: 280,
  },
  distance: {
    subtle: 4,
    small: 8,
    medium: 12,
  },
  scale: {
    press: 0.98,
    emphasis: 0.97,
    enter: 0.985,
  },
  easing: {
    standard: Easing.bezier(0.4, 0, 0.2, 1),
    emphasized: Easing.bezier(0.22, 1, 0.36, 1),
  },
  spring: {
    damping: 18,
    stiffness: 260,
    mass: 0.7,
  },
  reduceMotion: ReduceMotion.System,
} as const;
