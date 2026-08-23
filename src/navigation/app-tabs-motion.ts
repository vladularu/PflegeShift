import type { Animated } from "react-native";

import { MOTION } from "@/theme/motion";

export const APP_TAB_SCENE_MOTION = Object.freeze({
  inputRange: [-1, 0, 1] as const,
  opacityRange: [0, 1, 0] as const,
  translateRange: [-MOTION.distance.scene, 0, MOTION.distance.scene] as const,
});

export function interpolateAppTabScene({ current }: { current: { progress: Animated.Value } }) {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [...APP_TAB_SCENE_MOTION.inputRange],
        outputRange: [...APP_TAB_SCENE_MOTION.opacityRange],
      }),
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [...APP_TAB_SCENE_MOTION.inputRange],
            outputRange: [...APP_TAB_SCENE_MOTION.translateRange],
          }),
        },
      ],
    },
  };
}

export function appTabMotionOptions(reduceMotion: boolean) {
  if (reduceMotion) {
    return { animation: "none" as const };
  }

  return {
    animation: "shift" as const,
    sceneStyleInterpolator: interpolateAppTabScene,
    transitionSpec: {
      animation: "timing" as const,
      config: {
        duration: MOTION.duration.scene,
        easing: MOTION.easing.navigation,
      },
    },
  };
}
