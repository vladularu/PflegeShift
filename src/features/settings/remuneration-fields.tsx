import { View, type TextInput } from "react-native";
import { INDUSTRIES, INDUSTRY_LABELS, type Industry } from "@/domain/types";
import { type Ref } from "react";
import { DropdownField, Field } from "@/ui/form-controls";
import { FormSection, FormStatus } from "@/ui/form-layout";
import type { RemunerationFormValues } from "./remuneration-editor-values";
import type { remunerationTariffOptions } from "./remuneration-tariff-options";
import { OwnRemunerationFields } from "./own-remuneration-fields";
import { TvlCareAllowanceFields } from "./tvl-care-allowance-fields";
import { TvalCareAllowanceFields } from "./tval-care-allowance-fields";

export function RemunerationFields({
  values,
  onChange,
  busy,
  weeklyRef,
  amountRef,
  catalog,
  compact = false,
  industry,
  onIndustryChange,
}: {
  readonly values: RemunerationFormValues;
  readonly onChange: (change: Partial<RemunerationFormValues>) => void;
  readonly busy: boolean;
  readonly weeklyRef: Ref<TextInput>;
  readonly amountRef: Ref<TextInput>;
  readonly catalog: ReturnType<typeof remunerationTariffOptions> | null;
  readonly compact?: boolean;
  readonly industry?: Industry;
  readonly onIndustryChange?: (industry: Industry | null) => void;
}) {
  const tariff = catalog?.available.find((item) => item.id === values.packageId);
  const training = tariff?.employmentKind === "APPRENTICE";
  const variant = tariff?.variants.find((item) => item.id === values.sector);
  const region = variant?.regions.find((item) => item.id === values.tariffRegion);
  const group = tariff?.groups.find((item) => item.id === values.payGroup);
  const shortNames: Readonly<Record<string, string>> = {
    "tvoed-vka-bt-k": "TVöD-P",
    "tvl-kr-tdl": "TV-L · Pflege",
    "tvaoed-pflege-vka": "TVAöD · Pflege",
    "tval-pflege-tdl": "TVA-L · Pflege",
  };
  const choices = (items: readonly { value: string; label: string }[], value: string) =>
    items.some((item) => item.value === value)
      ? items
      : [{ value, label: value ? `${value} · nicht verfügbar` : "Bitte auswählen" }, ...items];
  const packageChoices = (catalog?.available ?? []).map((item) => ({
    value: item.id,
    label: shortNames[item.id] ?? item.label,
  }));
  return (
    <View
      pointerEvents={busy ? "none" : "auto"}
      accessibilityElementsHidden={busy}
      importantForAccessibility={busy ? "no-hide-descendants" : "auto"}
    >
      <FormSection
        title={compact ? "Gehaltsgrundlage" : "Vergütung"}
        caption={
          compact
            ? "Tarif berechnen oder einen eigenen Monatswert hinterlegen."
            : training
              ? "Kategorie und vergüteten Ausbildungszeitraum laut Vertrag bestätigen. Anrechenbare Verkürzungen berücksichtigen; Änderungen mit ihrem Gültigkeitsdatum als neuen Vergütungsstand speichern. Kein automatischer Ausbildungsjahrwechsel. Zuschläge und Zulagen sind noch nicht vollständig berechenbar."
              : "Wochenstunden gelten für diesen Vergütungsstand. Ein eigenes Monatsbrutto ist dein persönlicher Betrag und wird nicht nochmals wegen Teilzeit gekürzt."
        }
      >
        {compact ? (
          <DropdownField
            label="Berufsbereich"
            value={industry ?? "UNKNOWN"}
            onChange={(value) => onIndustryChange?.(value === "UNKNOWN" ? null : value)}
            options={[
              { value: "UNKNOWN" as const, label: "Nicht angegeben" },
              ...INDUSTRIES.map((value) => ({ value, label: INDUSTRY_LABELS[value] })),
            ]}
          />
        ) : null}
        {!compact ? (
          <Field
            label={compact ? "Wochenstunden" : "Wochenstunden für diese Vergütung"}
            value={values.weeklyHours}
            inputRef={weeklyRef}
            keyboardType="decimal-pad"
            returnKeyType="done"
            editable={!busy}
            onChangeText={(weeklyHours) => onChange({ weeklyHours })}
          />
        ) : null}
        <DropdownField
          label="Berechnung"
          value={compact && values.salaryMode === "TARIFF" ? values.packageId : values.salaryMode}
          onChange={(value) => {
            if (value === "UNSET" || value === "MANUAL" || (!compact && value === "TARIFF")) {
              onChange({ salaryMode: value });
              return;
            }
            onChange({
              salaryMode: "TARIFF",
              ...(value !== values.packageId
                ? {
                    packageId: value,
                    sector: "",
                    tariffRegion: "",
                    payGroup: "",
                    payLevel: "",
                    specialDutyAllowance: null,
                    tvlEmploymentCategory: null,
                    tvlCareAllowances: null,
                    tvalEmployerScope: null,
                    tvalCareAllowances: null,
                  }
                : {}),
            });
          }}
          options={
            compact
              ? [
                  { value: "UNSET", label: "Bitte wählen" },
                  ...(catalog === null
                    ? values.packageId
                      ? [
                          {
                            value: values.packageId,
                            label: shortNames[values.packageId] ?? "Gespeicherter Tarif",
                          },
                        ]
                      : []
                    : values.packageId
                      ? choices(packageChoices, values.packageId)
                      : packageChoices),
                  { value: "MANUAL", label: "Eigener Monatswert" },
                ]
              : [
                  { value: "UNSET", label: "Bitte wählen" },
                  { value: "TARIFF", label: "Tarif" },
                  { value: "MANUAL", label: "Eigene Vergütung" },
                ]
          }
        />
        {values.salaryMode === "TARIFF" ? (
          <>
            <FormStatus message={tariff?.supportNote} />
            <FormStatus
              message={
                catalog === null
                  ? "Bitte ein vollständiges Datum im Format TT.MM.JJJJ eingeben."
                  : undefined
              }
            />
            {catalog !== null ? (
              <>
                {!compact ? (
                  <DropdownField
                    label="Tarif"
                    value={values.packageId}
                    onChange={(packageId) =>
                      packageId !== values.packageId &&
                      onChange({
                        packageId,
                        tvalEmployerScope: null,
                        tvalCareAllowances: null,
                        sector: "",
                        tariffRegion: "",
                        payGroup: "",
                        payLevel: "",
                        specialDutyAllowance: null,
                        tvlEmploymentCategory: null,
                        tvlCareAllowances: null,
                      })
                    }
                    options={choices(
                      (catalog?.available ?? []).map((item) => ({
                        value: item.id,
                        label: compact ? (shortNames[item.id] ?? item.label) : item.label,
                      })),
                      values.packageId,
                    )}
                  />
                ) : null}
                <>
                  <DropdownField
                    label="Tarifbereich"
                    value={values.sector}
                    onChange={(sector) =>
                      sector !== values.sector &&
                      onChange({
                        sector,
                        tvalEmployerScope: null,
                        tvalCareAllowances: null,
                        tariffRegion: "",
                        specialDutyAllowance: null,
                        tvlEmploymentCategory: null,
                        tvlCareAllowances: null,
                      })
                    }
                    options={choices(
                      (tariff?.variants ?? []).map((item) => ({
                        value: item.id,
                        label: item.label,
                      })),
                      values.sector,
                    )}
                  />
                  <DropdownField
                    label="Tarifgebiet"
                    value={values.tariffRegion}
                    onChange={(tariffRegion) =>
                      tariffRegion !== values.tariffRegion &&
                      onChange({
                        tariffRegion,
                        tvalEmployerScope: null,
                        tvalCareAllowances: null,
                        specialDutyAllowance: null,
                        tvlEmploymentCategory: null,
                        tvlCareAllowances: null,
                      })
                    }
                    options={choices(
                      (variant?.regions ?? []).map((item) => ({
                        value: item.id,
                        label: item.label,
                      })),
                      values.tariffRegion,
                    )}
                  />
                </>
                <DropdownField
                  label={training ? "Ausbildungskategorie laut Tarifvertrag" : "Entgeltgruppe"}
                  value={values.payGroup}
                  options={choices(
                    (tariff?.groups ?? []).map((item) => ({
                      value: item.id,
                      label: item.label ?? item.id,
                    })),
                    values.payGroup,
                  )}
                  onChange={(payGroup) =>
                    onChange({
                      payGroup,
                      ...(payGroup !== values.payGroup
                        ? { tvlCareAllowances: null, tvalCareAllowances: null }
                        : {}),
                      payLevel:
                        values.packageId === "tval-pflege-tdl" && payGroup !== values.payGroup
                          ? ""
                          : tariff?.groups
                                .find((item) => item.id === payGroup)
                                ?.levels.includes(values.payLevel)
                            ? values.payLevel
                            : "",
                    })
                  }
                />
                <DropdownField
                  label={
                    group?.periodKind === "TRAINING_MONTH_BRACKET"
                      ? "Vergüteter Ausbildungszeitraum"
                      : training
                        ? "Vergütetes Ausbildungsjahr"
                        : "Stufe"
                  }
                  value={values.payLevel}
                  onChange={(payLevel) => onChange({ payLevel })}
                  options={choices(
                    (group?.levels ?? []).map((value) => ({
                      value,
                      label:
                        group?.levelLabels?.[value] ??
                        (training ? `${value}. Ausbildungsjahr` : `Stufe ${value}`),
                    })),
                    values.payLevel,
                  )}
                />
                {values.packageId === "tval-pflege-tdl" ? (
                  <>
                    <DropdownField
                      label="TVA-L-Arbeitgeberregelung"
                      value={values.tvalEmployerScope ?? "UNKNOWN"}
                      onChange={(value) =>
                        onChange({ tvalEmployerScope: value === "UNKNOWN" ? null : value })
                      }
                      options={[
                        { value: "UNKNOWN", label: "Noch ungeklärt" },
                        { value: "GENERAL", label: "Allgemeine TV-L-Regel bestätigt" },
                        { value: "SECTION_43", label: "Krankenhausregelung nach § 43 bestätigt" },
                      ]}
                    />
                    <FormStatus message="Maßgeblich ist die Regelung für die Beschäftigten deines Ausbildenden, nicht dein Ausbildungsberuf oder Bundesland. Bei Bedarf mit der Personalstelle klären. Den Schichtzulagenanspruch bestätigst du zusätzlich für den jeweiligen Zeitraum in der Auswertung." />
                  </>
                ) : null}
                {values.packageId === "tvl-kr-tdl" || values.packageId === "tval-pflege-tdl" ? (
                  <>
                    <DropdownField
                      label={
                        values.packageId === "tval-pflege-tdl"
                          ? "TVA-L-Bezugsregelung"
                          : "TV-L-Beschäftigtenkategorie"
                      }
                      value={values.tvlEmploymentCategory ?? "UNKNOWN"}
                      onChange={(value) =>
                        onChange({ tvlEmploymentCategory: value === "UNKNOWN" ? null : value })
                      }
                      options={[
                        { value: "UNKNOWN", label: "Noch ungeklärt" },
                        {
                          value: "SALARIED_SECTION_38_5_1",
                          label: "Angestelltenregelung · § 38 Abs. 5 Satz 1",
                        },
                        { value: "OTHER", label: "Übrige Beschäftigte" },
                      ]}
                    />
                    <FormStatus
                      message={
                        values.packageId === "tval-pflege-tdl"
                          ? "Bestätige die für deine Ausbildung sinngemäß geltende Beschäftigtenregelung mit der Personalstelle. Nicht aus dem Ausbildungsberuf ableiten. Relevant für Samstagsarbeit unter der Krankenhausregelung; der Schichtarbeitsbezug wird zusätzlich je Dienst angegeben."
                          : "Maßgeblich ist die tarifliche Einordnung der Tätigkeit nach § 38 Abs. 5 TV-L, nicht dein Alter oder Einstellungsdatum. Bitte bei Bedarf mit der Personalstelle klären. Die Kategorie allein bestätigt noch keinen Schichtarbeitsbezug eines Samstagsdienstes."
                      }
                    />
                  </>
                ) : null}
                {values.packageId === "tvaoed-pflege-vka" ? (
                  <>
                    <DropdownField
                      label="Tätigkeitszulagen"
                      value={values.specialDutyAllowance ?? "UNKNOWN"}
                      onChange={(value) =>
                        onChange({ specialDutyAllowance: value === "UNKNOWN" ? null : value })
                      }
                      options={[
                        { value: "UNKNOWN", label: "Noch ungeklärt" },
                        { value: "NONE", label: "Keine Tätigkeitszulagen zutreffend" },
                        { value: "PE1_ONLY", label: "Nur Protokollerklärung Nr. 1 bestätigt" },
                        { value: "OTHER_OR_MULTIPLE", label: "Weitere oder kombinierte Ansprüche" },
                      ]}
                    />
                    <FormStatus message="Gemeint sind tätigkeitsabhängige Zulagen nach § 8b Abs. 2 TVAöD-Pflege, nicht Schichtzulagen. Nr. 1 setzt zeitlich überwiegende Grund- und Behandlungspflege in den genannten Fällen voraus, etwa Geriatrie, bestimmte psychiatrische Bereiche, Infektionsstationen oder onkologische Behandlungen. Bitte anhand deiner Anspruchsgrundlage bestätigen. Weitere BAT-Zulagen oder Kombinationen sind noch nicht vollständig berechenbar." />
                  </>
                ) : null}
                <Field
                  editable={false}
                  label="Tarifliche Vollzeit pro Woche"
                  value={
                    region
                      ? String(region.fullTimeWeeklyMinutes / 60).replace(".", ",")
                      : "Nicht verfügbar"
                  }
                />
                {catalog?.unavailable
                  .filter((item) => catalog.available.length === 0 || item.id === values.packageId)
                  .map((item) => (
                    <FormStatus key={item.id} message={`${item.label}: ${item.reason}`} />
                  ))}
              </>
            ) : null}
          </>
        ) : null}
      </FormSection>
      {values.salaryMode === "TARIFF" && values.packageId === "tvl-kr-tdl" ? (
        <TvlCareAllowanceFields
          value={values.tvlCareAllowances ?? null}
          onChange={(tvlCareAllowances) => onChange({ tvlCareAllowances })}
        />
      ) : null}
      {values.salaryMode === "MANUAL" ? (
        <OwnRemunerationFields
          values={values}
          onChange={onChange}
          amountRef={amountRef}
          busy={busy}
        />
      ) : null}
      {values.salaryMode === "TARIFF" && values.packageId === "tval-pflege-tdl" ? (
        <TvalCareAllowanceFields
          value={values.tvalCareAllowances ?? null}
          onChange={(tvalCareAllowances) => onChange({ tvalCareAllowances })}
        />
      ) : null}
    </View>
  );
}
