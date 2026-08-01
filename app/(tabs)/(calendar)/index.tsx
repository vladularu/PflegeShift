import { CalendarScreen } from "@/features/calendar/calendar-screen";
import { AccessibleTabScreen } from "@/ui/accessible-tab-screen";

export default function CalendarRoute() {
  return <AccessibleTabScreen><CalendarScreen /></AccessibleTabScreen>;
}
