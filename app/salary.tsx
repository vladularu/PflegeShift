import { Redirect, useLocalSearchParams } from "expo-router";

export default function LegacySalaryRoute() {
  const params = useLocalSearchParams<{ month?: string }>();
  return (
    <Redirect
      href={{
        pathname: "/analysis",
        params: { section: "salary", ...(params.month ? { month: params.month } : {}) },
      }}
    />
  );
}
