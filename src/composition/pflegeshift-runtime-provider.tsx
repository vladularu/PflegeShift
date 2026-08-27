import { useSQLiteContext } from "expo-sqlite";
import { useMemo, type PropsWithChildren } from "react";

import { PflegeShiftProvider } from "@/application/pflegeshift-provider";
import { createPflegeShiftPorts } from "@/composition/create-pflegeshift-ports";

export function PflegeShiftRuntimeProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const ports = useMemo(() => createPflegeShiftPorts(db), [db]);

  return <PflegeShiftProvider ports={ports}>{children}</PflegeShiftProvider>;
}
