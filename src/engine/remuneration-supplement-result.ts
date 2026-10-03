import type { SupplementPosition, SupplementResult } from "@/domain/remuneration-supplement";

export function summarizeSupplements(positions: readonly SupplementPosition[]): SupplementResult {
  const complete = positions.every((position) => position.amountCents !== null);
  const knownSubtotalCents = positions.reduce(
    (sum, position) => sum + (position.amountCents ?? 0),
    0,
  );
  return {
    positions,
    complete,
    knownSubtotalCents,
    totalCents: complete ? knownSubtotalCents : null,
    status: !complete
      ? "unavailable"
      : positions.some((position) => position.status === "estimated")
        ? "estimated"
        : "calculated",
  };
}
