import { Redirect, useLocalSearchParams } from "expo-router";
import { calendarDesignRoute } from "@/navigation/calendar-design-route";

export default function CalendarViewRoute() {
  const { notice } = useLocalSearchParams<{ notice?: string | string[] }>();
  return <Redirect href={calendarDesignRoute("calendar", notice)} />;
}
