import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import { AnnualBasisFields, AnnualAlternateBasisFields } from "./tariff-annual-basis-fields";
import { prepareTariffAnnualClaim, tariffAnnualDraft } from "./tariff-annual-model";
import { annualBasisMonth, tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";

jest.mock("@/ui/form-layout", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return { FormStatus: ({ message }: { message?: string }) => <Text>{message}</Text> };
});
jest.mock("@/ui/form-controls", () => {
  const { TextInput, View, Button } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Field: ({ label, ...props }: { label: string }) => (
      <TextInput accessibilityLabel={label} {...props} />
    ),
    SecondaryButton: ({ children, onPress }: { children: string; onPress: () => void }) => (
      <Button title={children} onPress={onPress} />
    ),
    DropdownField: ({
      label,
      options,
      onChange,
    }: {
      label: string;
      options: { value: string; label: string }[];
      onChange: (v: string) => void;
    }) => (
      <View>
        {options.map((o) => (
          <Button key={o.value} title={label + ": " + o.label} onPress={() => onChange(o.value)} />
        ))}
      </View>
    ),
  };
});
function draft(extra = 0) {
  const { claim } = tariffAnnualFixture(true);
  claim.selection = {
    packageId: "tval-pflege-tdl",
    variant: "CARE",
    region: "WEST_38_5",
    group: "regular",
    confirmed: true,
  };
  claim.basis.months = [annualBasisMonth("2026-11", 144070)];
  claim.basis.months[0]!.fixedCents = extra;
  return tariffAnnualDraft({ claim, saved: null, profilesToken: "[]" });
}
describe("TVA-L November annual input", () => {
  it("edits and confirms November pay without irrelevant employee basis fields", async () => {
    let latest = draft();
    function Form() {
      const [value, update] = useState(latest);
      return (
        <AnnualBasisFields
          value={value}
          onChange={(v) => {
            latest = v;
            update(v);
          }}
          disabled={false}
        />
      );
    }
    const screen = await render(<Form />);
    expect(screen.queryByLabelText("Feste Bestandteile in Euro")).toBeNull();
    expect(screen.queryByLabelText("Kalendertage mit berücksichtigungsfähigem Entgelt")).toBeNull();
    await fireEvent.changeText(
      screen.getByLabelText("Zustehendes November-Ausbildungsentgelt in Euro"),
      "1500",
    );
    expect(latest.months[0]!.componentsConfirmed).toBe(false);
    await fireEvent.press(
      screen.getByRole("button", { name: "Bestandteile für diesen Monat geprüft: Bestätigt" }),
    );
    const saved = prepareTariffAnnualClaim(latest, null);
    expect(saved.claim.basis.months[0]).toMatchObject({
      baseCents: 150000,
      componentsConfirmed: true,
    });
    const reopened = tariffAnnualDraft({ claim: saved.claim, saved: null, profilesToken: "[]" });
    expect(reopened.months[0]!.baseCents).toBe("1500,00");
  });
  it("keeps incompatible existing additions editable instead of silently dropping them", async () => {
    const screen = await render(
      <AnnualBasisFields value={draft(12300)} onChange={() => {}} disabled={false} />,
    );
    expect(screen.getByLabelText("Feste Bestandteile in Euro").props.value).toBe("123,00");
  });
  it("asks only for the explicit takeover training basis in the special section", async () => {
    const screen = await render(
      <AnnualAlternateBasisFields value={draft()} onChange={() => {}} disabled={false} />,
    );
    expect(
      screen.getByLabelText("Bestätigte November-Ausbildungsgrundlage bei Übernahme in Euro"),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Letzter voller Entgeltmonat (MM.JJJJ)")).toBeNull();
    expect(screen.getByText(/gehört dieser Monat zum Arbeitnehmeranteil/)).toBeTruthy();
  });
});
