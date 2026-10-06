import { useSQLiteContext } from "expo-sqlite";
import { useMemo, type PropsWithChildren } from "react";

import { PflegeShiftProvider } from "@/application/pflegeshift-provider";
import { RuleCatalogRuntimeProvider } from "@/application/rule-catalog-runtime-provider";
import { createPflegeShiftPorts } from "@/composition/create-pflegeshift-ports";
import { createRuleCatalogRuntimePort } from "@/composition/create-rule-catalog-runtime-port";
import { useActiveMonth } from "@/navigation/active-month";
export function PflegeShiftRuntimeProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const activeMonth = useActiveMonth();
  const ports = useMemo(() => createPflegeShiftPorts(db), [db]);
  const ruleCatalog = useMemo(() => createRuleCatalogRuntimePort(db), [db]);

  return (
    <PflegeShiftProvider activeMonth={activeMonth} ports={ports}>
      <RuleCatalogRuntimeProvider
        loadStoredCatalog={ruleCatalog.loadStoredCatalog}
        synchronizeCatalog={ruleCatalog.synchronizeCatalog}
        recordDiagnostic={ruleCatalog.recordDiagnostic}
      >
        {children}
      </RuleCatalogRuntimeProvider>
    </PflegeShiftProvider>
  );
}
