import { useSQLiteContext } from "expo-sqlite";
import { useMemo, type PropsWithChildren } from "react";

import { PflegeShiftProvider } from "@/application/pflegeshift-provider";
import { createPflegeShiftPorts } from "@/composition/create-pflegeshift-ports";
import { useActiveMonth } from "@/navigation/active-month";

export function PflegeShiftRuntimeProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const activeMonth = useActiveMonth();
  const ports = useMemo(() => createPflegeShiftPorts(db), [db]);

  return (
    <PflegeShiftProvider activeMonth={activeMonth} ports={ports}>
      {children}
    </PflegeShiftProvider>
  );
}
