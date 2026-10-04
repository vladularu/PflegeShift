import candidateValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import type { RuleTariffPackage } from "./contracts.generated";

/** Synthetic contract fixture only; not a reviewed or distributable tariff package. */
export function selectionCandidate(): RuleTariffPackage {
  const result = structuredClone(candidateValue) as RuleTariffPackage;
  result.engineContractVersion = 11;
  result.rules.selection = {
    familyId: "tvoed-p",
    engineId: "tvoed-p-v3",
    employmentKind: "EMPLOYEE",
    variants: [
      {
        id: "BT_K",
        label: "Krankenhaus",
        specialPartId: "bt-k",
        sourceIds: [result.sources[0].id],
        regions: [
          { id: "OTHER", label: "Übrige Tarifgebiete", sourceIds: [result.sources[0].id] },
          { id: "KAV_BW", label: "KAV Baden-Württemberg", sourceIds: [result.sources[0].id] },
        ],
      },
      {
        id: "BT_B",
        label: "Pflege und Betreuung",
        specialPartId: "bt-b",
        sourceIds: [result.sources[1].id],
        regions: [
          { id: "OTHER", label: "Übrige Tarifgebiete", sourceIds: [result.sources[1].id] },
          { id: "KAV_BW", label: "KAV Baden-Württemberg", sourceIds: [result.sources[1].id] },
        ],
      },
    ],
    capabilities: {
      basePay: "SUPPORTED",
      timePremiums: "SUPPORTED",
      allowances: "SUPPORTED",
      overtime: "SUPPORTED",
      annualPayment: "SUPPORTED",
    },
  };
  return result;
}
