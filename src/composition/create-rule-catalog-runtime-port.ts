import type { SQLiteDatabase } from "expo-sqlite";

import type { LoadStoredRuleCatalog } from "@/application/rule-catalog-runtime";
import { loadActiveRuleCatalog } from "@/infrastructure/database/rule-catalog-repository";
import { recordDiagnostic } from "@/infrastructure/diagnostics";
import { isRuleCatalogRuntimeCompatible } from "@/rules/rule-resolver";

export interface RuleCatalogRuntimePort {
  readonly loadStoredCatalog: LoadStoredRuleCatalog;
  readonly recordDiagnostic: (code: string, error: unknown) => void;
}

export function createRuleCatalogRuntimePort(db: SQLiteDatabase): RuleCatalogRuntimePort {
  return Object.freeze({
    loadStoredCatalog: () => loadActiveRuleCatalog(db, isRuleCatalogRuntimeCompatible),
    recordDiagnostic: (code: string, error: unknown) =>
      recordDiagnostic("rule-catalog", code, error),
  });
}
