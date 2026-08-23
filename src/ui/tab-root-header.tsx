import { TabScreenHeader, type ScreenSurface } from "@/ui/screen-layout";

export function TabRootHeader({
  surface = "background",
  title,
}: {
  readonly surface?: ScreenSurface;
  readonly title: string;
}) {
  return <TabScreenHeader surface={surface} title={title} />;
}
