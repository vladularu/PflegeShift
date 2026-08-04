import { Temporal } from "@js-temporal/polyfill";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

function currentReferenceDate(timeZone: string): string {
  return Temporal.Now.plainDateISO(timeZone).toString();
}

export function useLocalReferenceDate(timeZone: string): string {
  const [state, setState] = useState(() => ({
    timeZone,
    date: currentReferenceDate(timeZone),
  }));
  const referenceDate = state.timeZone === timeZone ? state.date : currentReferenceDate(timeZone);

  useEffect(() => {
    const update = () => {
      const date = currentReferenceDate(timeZone);
      setState((current) =>
        current.timeZone === timeZone && current.date === date ? current : { timeZone, date },
      );
    };
    update();
    const interval = setInterval(update, 60_000);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") update();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [timeZone]);

  return referenceDate;
}
