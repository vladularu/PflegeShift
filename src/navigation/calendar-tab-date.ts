import { useEffect, useState } from "react";
import { AppState } from "react-native";

function calendarTabDate(now: Date) {
  const day = now.getDate();
  const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${day}`;
  return {
    day,
    dateKey,
    accessibilityLabel: `Kalender, heute ${new Intl.DateTimeFormat("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now)}`,
  };
}

/** The tab icon follows the device's local day, independently of the browsed month. */
export function useCalendarTabDate() {
  const [date, setDate] = useState(() => calendarTabDate(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = AppState.currentState === null || AppState.currentState === "active";
    function clearTimer() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    }
    function refresh() {
      clearTimer();
      const now = new Date();
      const next = calendarTabDate(now);
      setDate((previous) => (previous.dateKey === next.dateKey ? previous : next));
      if (active) {
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 50);
        // Local midnight handles DST. The minute cap also catches system clock/zone changes.
        timer = setTimeout(
          refresh,
          Math.min(60_000, Math.max(1, midnight.getTime() - now.getTime())),
        );
      }
    }
    const subscription = AppState.addEventListener("change", (state) => {
      active = state === "active";
      if (active) refresh();
      else clearTimer();
    });
    refresh();
    return () => {
      clearTimer();
      subscription.remove();
    };
  }, []);

  return date;
}
