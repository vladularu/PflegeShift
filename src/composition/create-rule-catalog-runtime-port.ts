import type { SQLiteDatabase } from "expo-sqlite";

import {
  buildRuleCatalogRuntimePort,
  type RuleCatalogRuntimePort,
  type RuleCatalogRuntimePortOptions,
} from "@/composition/rule-catalog-runtime-port-factory";

export type { RuleCatalogRuntimePort } from "@/composition/rule-catalog-runtime-port-factory";

export function createRuleCatalogRuntimePort(
  db: SQLiteDatabase,
  options: RuleCatalogRuntimePortOptions = {},
): RuleCatalogRuntimePort {
  return buildRuleCatalogRuntimePort(db, options);
}
