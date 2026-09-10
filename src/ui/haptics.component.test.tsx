import { describe, expect, it, jest } from "@jest/globals";
import * as Haptics from "expo-haptics";
import { planningModeFeedback } from "./haptics";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Soft: "soft" },
  impactAsync: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

describe("calendar planning feedback", () => {
  it("uses a soft iOS impact, never a medium impact", () => {
    planningModeFeedback();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Soft);
  });
});
