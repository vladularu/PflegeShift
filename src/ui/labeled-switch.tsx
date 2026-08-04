import { Switch, type SwitchProps } from "react-native";

export function LabeledSwitch({ label, ...props }: SwitchProps & { readonly label: string }) {
  return <Switch accessibilityLabel={label} {...props} />;
}
