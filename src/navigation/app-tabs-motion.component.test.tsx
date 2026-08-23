import { describe, expect, it, jest } from "@jest/globals";

import {
  APP_TAB_SCENE_MOTION,
  appTabMotionOptions,
  interpolateAppTabScene,
} from "@/navigation/app-tabs-motion";
import { MOTION } from "@/theme/motion";

describe("app tab motion", () => {
  it("moves lower tabs left and higher tabs right over 36 points", () => {
    expect(APP_TAB_SCENE_MOTION.translateRange).toEqual([-36, 0, 36]);

    const interpolate = jest.fn((config: { outputRange: number[] }) => config.outputRange);
    const result = interpolateAppTabScene({
      current: { progress: { interpolate } as never },
    });

    expect(interpolate).toHaveBeenNthCalledWith(1, {
      inputRange: [-1, 0, 1],
      outputRange: [0, 1, 0],
    });
    expect(interpolate).toHaveBeenNthCalledWith(2, {
      inputRange: [-1, 0, 1],
      outputRange: [-36, 0, 36],
    });
    expect(result.sceneStyle.transform).toHaveLength(1);
  });

  it("uses the shared 420 millisecond scene transition", () => {
    const options = appTabMotionOptions(false);

    expect(options.animation).toBe("shift");
    expect(options.transitionSpec).toMatchObject({
      animation: "timing",
      config: { duration: MOTION.duration.scene },
    });
  });

  it("removes the complete scene transition for reduced motion", () => {
    expect(appTabMotionOptions(true)).toEqual({ animation: "none" });
  });
});
