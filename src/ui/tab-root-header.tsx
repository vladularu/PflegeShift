import type { ReactNode } from "react";
import { TabScreenHeader, type ScreenSurface } from "@/ui/screen-layout";

export function TabRootHeader({
  accessory,
  surface = "background",
  title,
}: {
  readonly accessory?: ReactNode;
  readonly surface?: ScreenSurface;
  readonly title: string;
}) {
  return <TabScreenHeader accessory={accessory} surface={surface} title={title} />;
}
