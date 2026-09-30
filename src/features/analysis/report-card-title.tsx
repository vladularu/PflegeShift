import { CardHeader } from "@/ui/design-system";

export function ReportCardTitle({ title }: { readonly title: string }) {
  return <CardHeader title={title} />;
}
