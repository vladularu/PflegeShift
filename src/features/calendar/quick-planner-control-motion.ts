import { MOTION } from "@/theme/motion";

/** Both controls share one resting center and the same downward travel. */
export function quickPlannerControlMotion(
  progress: number,
  control: "add" | "close",
  reduceMotion: boolean,
) {
  "worklet";
  const phase = Math.min(1, Math.max(0, control === "add" ? progress * 2 : progress * 2 - 1));
  const visibility = control === "add" ? 1 - phase : phase;
  return {
    opacity: visibility,
    transform: reduceMotion ? [] : [{ translateY: (1 - visibility) * MOTION.distance.scene }],
  };
}
