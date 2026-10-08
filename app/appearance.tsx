import { Redirect } from "expo-router";
import { calendarDesignRoute } from "@/navigation/calendar-design-route";

export default function AppearanceRoute() {
  return <Redirect href={calendarDesignRoute("settings")} />;
}
