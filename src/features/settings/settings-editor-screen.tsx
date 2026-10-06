import { getTvalPflegeFullTimeMinutes } from "@/engine/simple-tval-pflege-pay";
import {
  TVH_KR_GROUPS,
  tvhKrLevelsForGroup,
  type TvhKrGroup,
  type TvhKrPayLevel,
} from "@/domain/tvh-kr-tariff";
import {
  TVUK_NURSING_GROUPS,
  tvUkLevelsForGroup,
  type TvUkNursingGroup,
  type TvUkPayLevel,
} from "@/domain/tvuk-nursing-tariff";
import { Temporal } from "@js-temporal/polyfill";
import {
  TVL_KR_GROUPS,
  tvlKrLevelsForGroup,
  type TvlKrGroup,
  type TvlKrUniversityRegion,
} from "@/domain/tvl-kr-tariff";
import { getTvlKrUniversityFullTimeMinutes } from "@/engine/simple-tvl-kr-pay";
import { VKA_E_GROUPS, ePayLevels } from "@/domain/vka-e-tariff";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { TextInput } from "react-native";

import { usePflegeShiftProfile, usePflegeShiftStatus } from "@/application/pflegeshift-provider";
import {
  FEDERAL_STATES,
  FEDERAL_STATE_LABELS,
  HOLIDAY_REGION_LABELS,
  INDUSTRIES,
  INDUSTRY_LABELS,
  PAY_GROUPS,
  payLevelsForGroup,
  TARIFF_REGION_LABELS,
  type FederalState,
  type HolidayRegion,
  type Industry,
  type PayGroup,
  type PayLevel,
  type TariffRegion,
  type TariffSector,
  type UserProfile,
  type VkaETariff,
} from "@/domain/types";
import {
  defaultHolidayRegion,
  holidayRegionsForState,
  tariffFullTimeWeeklyMinutes,
} from "@/domain/employment-profile";
import { userFacingErrorMessage } from "@/domain/errors";
import { parseWeeklyHours } from "@/features/onboarding/onboarding-screen";
import { resolveSalaryUpdate } from "@/features/settings/profile-update";
import {
  evidenceBoolean,
  manualMonthlyGrossFieldError,
  parseManualMonthlyGrossCents,
  settingsFormValues,
  type EvidenceFormValue,
  type IndustryFormValue,
  type SalaryMode,
} from "@/features/settings/settings-form-values";
import { parseEnumRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { SALARY_BASIS_OPTIONS } from "@/features/settings/salary-basis-options";
import { DropdownField, Field } from "@/ui/form-controls";
import { FormScreen, FormSection, FormStatus, HeaderSaveAction } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { focusInvalidField, weeklyHoursFieldError } from "@/ui/form-validation";
import { SheetBackFooter } from "@/ui/sheet-back-footer";

type SettingsSection = "WORK" | "TARIFF";

export function SettingsEditorScreen() {
  const params = useLocalSearchParams<{ section?: RouteParam }>();
  const parsedSection = parseEnumRouteParam(params.section, ["WORK", "TARIFF"] as const);
  const section: SettingsSection = parsedSection.status === "valid" ? parsedSection.value : "WORK";
  const { ready, error: dataError, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();

  if (parsedSection.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zu den Einstellungen enthält einen unbekannten Bereich."
        onRetry={() => router.back()}
        title="Einstellungen können nicht geöffnet werden"
      />
    );
  }
  if (ready && dataError) {
    return <LoadFailureView message={dataError} onRetry={() => void reload()} />;
  }
  if (!ready || profile === null) return <LoadingView />;

  return (
    <SettingsEditorForm
      key={`${section}-${profile.createdAt}`}
      profile={profile}
      section={section}
    />
  );
}

function SettingsEditorForm({
  profile,
  section,
}: {
  readonly profile: UserProfile;
  readonly section: SettingsSection;
}) {
  const palette = usePalette();
  const { updateProfile } = usePflegeShiftProfile();
  const initialValues = settingsFormValues(profile);
  const [federalState, setFederalState] = useState<FederalState>(initialValues.federalState);
  const [holidayRegion, setHolidayRegion] = useState<HolidayRegion>(initialValues.holidayRegion);
  const [weeklyHours, setWeeklyHours] = useState(initialValues.weeklyHours);
  const [industry, setIndustry] = useState<IndustryFormValue>(initialValues.industry);
  const [salaryMode, setSalaryMode] = useState<SalaryMode>(initialValues.salaryMode);
  const [trainingYear, setTrainingYear] = useState<1 | 2 | 3 | "UNSET">(initialValues.trainingYear);
  const [manualMonthlyGross, setManualMonthlyGross] = useState(initialValues.manualMonthlyGross);
  const [regularRotatingNightWork, setRegularRotatingNightWork] = useState<EvidenceFormValue>(
    initialValues.regularRotatingNightWork,
  );
  const [sundayHolidayWorkEligible, setSundayHolidayWorkEligible] = useState<EvidenceFormValue>(
    initialValues.sundayHolidayWorkEligible,
  );
  const [allEmploymentWorkRecorded, setAllEmploymentWorkRecorded] = useState<EvidenceFormValue>(
    initialValues.allEmploymentWorkRecorded,
  );
  const [tvhPayGroup, setTvhPayGroup] = useState<TvhKrGroup>(initialValues.tvhPayGroup);
  const [tvhPayLevel, setTvhPayLevel] = useState<TvhKrPayLevel | "UNSET">(
    initialValues.tvhPayLevel,
  );
  const [tvhFullTimeWeeklyMinutes, setTvhFullTimeWeeklyMinutes] = useState<2310 | 2400>(
    initialValues.tvhFullTimeWeeklyMinutes,
  );
  const [tvUkPayGroup, setTvUkPayGroup] = useState<TvUkNursingGroup>(initialValues.tvUkPayGroup);
  const [tvUkPayLevel, setTvUkPayLevel] = useState<TvUkPayLevel | "UNSET">(
    initialValues.tvUkPayLevel,
  );
  const [krPayGroup, setKrPayGroup] = useState<TvlKrGroup>(initialValues.krPayGroup);
  const [tvlUniversityRegion, setTvlUniversityRegion] = useState<TvlKrUniversityRegion>(
    initialValues.tvlUniversityRegion,
  );
  const [ePayGroup, setEPayGroup] = useState<VkaETariff["payGroup"]>(initialValues.ePayGroup);
  const [payGroup, setPayGroup] = useState<PayGroup>(initialValues.payGroup);
  const [payLevel, setPayLevel] = useState<PayLevel | "UNSET">(initialValues.payLevel);
  const [sector, setSector] = useState<TariffSector>(initialValues.sector);
  const [tariffRegion, setTariffRegion] = useState<TariffRegion>(initialValues.tariffRegion);
  const [weeklyHoursError, setWeeklyHoursError] = useState<string | null>(null);
  const [manualMonthlyGrossError, setManualMonthlyGrossError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const weeklyHoursRef = useRef<TextInput>(null);
  const manualMonthlyGrossRef = useRef<TextInput>(null);
  const fullTimeWeeklyMinutes =
    salaryMode === "TVAL_PFLEGE"
      ? (getTvalPflegeFullTimeMinutes(
          Temporal.Now.plainDateISO(profile.timeZone).toString(),
          tvlUniversityRegion,
        ) ?? 0)
      : salaryMode === "TVH_KR"
        ? tvhFullTimeWeeklyMinutes
        : salaryMode === "TVUK_NURSING"
          ? 2310
          : salaryMode === "TVL_KR"
            ? (getTvlKrUniversityFullTimeMinutes(
                Temporal.Now.plainDateISO(profile.timeZone).toString(),
                tvlUniversityRegion,
              ) ?? 0)
            : salaryMode === "TVAOED_PFLEGE"
              ? sector === "BT_K"
                ? 2310
                : 2340
              : tariffFullTimeWeeklyMinutes(sector, tariffRegion);
  const fullTimeHours = String(fullTimeWeeklyMinutes / 60).replace(".", ",");
  const selectedLevels =
    salaryMode === "TVL_KR"
      ? tvlKrLevelsForGroup(krPayGroup)
      : salaryMode === "TVOED_E"
        ? ePayLevels(ePayGroup)
        : payLevelsForGroup(payGroup);
  const evidenceOptions = [
    { value: "UNKNOWN" as const, label: "Noch nicht bestätigt" },
    { value: "YES" as const, label: "Ja" },
    { value: "NO" as const, label: "Nein" },
  ];

  async function submit() {
    const fieldError = section === "WORK" ? weeklyHoursFieldError(weeklyHours) : null;
    const salaryModeError =
      section === "TARIFF" && salaryMode === "UNSET" ? "Bitte eine Gehaltsgrundlage wählen." : null;
    const salaryFieldError =
      section === "TARIFF" && salaryMode === "MANUAL"
        ? manualMonthlyGrossFieldError(manualMonthlyGross)
        : null;
    setWeeklyHoursError(fieldError);
    setManualMonthlyGrossError(salaryFieldError);
    if (fieldError) {
      setError(fieldError);
      setMessage(null);
      focusInvalidField(weeklyHoursRef, fieldError);
      return;
    }
    if (salaryModeError) {
      setError(salaryModeError);
      setMessage(null);
      return;
    }
    if (salaryFieldError) {
      setError(salaryFieldError);
      setMessage(null);
      focusInvalidField(manualMonthlyGrossRef, salaryFieldError);
      return;
    }
    if (
      section === "TARIFF" &&
      (salaryMode === "TVOED_P" || salaryMode === "TVOED_E" || salaryMode === "TVL_KR") &&
      payLevel === "UNSET"
    ) {
      setError("Bitte eine gültige Stufe für die gewählte Gruppe wählen.");
      setMessage(null);
      return;
    }
    if (section === "TARIFF" && salaryMode === "TVH_KR" && tvhPayLevel === "UNSET") {
      setError("Bitte eine gültige Stufe für die gewählte Gruppe wählen.");
      setMessage(null);
      return;
    }
    if (section === "TARIFF" && salaryMode === "TVUK_NURSING" && tvUkPayLevel === "UNSET") {
      setError("Bitte eine gültige Stufe für die gewählte Gruppe wählen.");
      setMessage(null);
      return;
    }
    if (
      section === "TARIFF" &&
      (salaryMode === "TVAOED_PFLEGE" || salaryMode === "TVAL_PFLEGE") &&
      trainingYear === "UNSET"
    ) {
      setError("Bitte das Ausbildungsjahr wählen.");
      setMessage(null);
      return;
    }
    if (
      section === "TARIFF" &&
      (salaryMode === "TVAOED_PFLEGE" ||
        salaryMode === "TVAL_PFLEGE" ||
        salaryMode === "TVL_KR" ||
        salaryMode === "TVUK_NURSING" ||
        salaryMode === "TVH_KR") &&
      profile.weeklyMinutes > fullTimeWeeklyMinutes
    ) {
      setError(
        salaryMode !== "TVAOED_PFLEGE" && salaryMode !== "TVAL_PFLEGE"
          ? "Deine Wochenstunden liegen über der tariflichen Vollzeit. Bitte zuerst das Arbeitszeitmodell prüfen."
          : "Deine Wochenstunden liegen über der tariflichen Ausbildungszeit. Bitte zuerst das Arbeitszeitmodell prüfen.",
      );
      setMessage(null);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      const salaryUpdate = resolveSalaryUpdate(
        section,
        profile.tariff,
        profile.manualMonthlyGrossCents ?? null,
        salaryMode,
        {
          payGroup,
          payLevel: payLevel === "UNSET" ? initialValues.payLevel : payLevel,
          sector,
          tariffRegion,
          fullTimeWeeklyMinutes,
        },
        parseManualMonthlyGrossCents(manualMonthlyGross),
      );
      await updateProfile({
        federalState,
        holidayRegion,
        weeklyMinutes: parseWeeklyHours(weeklyHours),
        timeZone: profile.timeZone,
        industry: industry === "UNKNOWN" ? null : industry,
        manualMonthlyGrossCents: salaryUpdate.manualMonthlyGrossCents,
        regularRotatingNightWork: evidenceBoolean(regularRotatingNightWork),
        sundayHolidayWorkEligible: evidenceBoolean(sundayHolidayWorkEligible),
        allEmploymentWorkRecorded: evidenceBoolean(allEmploymentWorkRecorded),
        tariff: salaryUpdate.tariff,
        vkaETariff:
          section === "WORK"
            ? (profile.vkaETariff ?? null)
            : salaryMode === "TVOED_E" && payLevel !== "UNSET"
              ? { payGroup: ePayGroup, payLevel, sector, tariffRegion }
              : null,
        tvhKrTariff:
          section === "WORK"
            ? (profile.tvhKrTariff ?? null)
            : salaryMode === "TVH_KR" && tvhPayLevel !== "UNSET"
              ? {
                  payGroup: tvhPayGroup,
                  payLevel: tvhPayLevel,
                  fullTimeWeeklyMinutes: tvhFullTimeWeeklyMinutes,
                }
              : null,
        tvUkNursingTariff:
          section === "WORK"
            ? (profile.tvUkNursingTariff ?? null)
            : salaryMode === "TVUK_NURSING" && tvUkPayLevel !== "UNSET"
              ? { payGroup: tvUkPayGroup, payLevel: tvUkPayLevel }
              : null,
        tvlKrTariff:
          section === "WORK"
            ? (profile.tvlKrTariff ?? null)
            : salaryMode === "TVL_KR" && payLevel !== "UNSET"
              ? { payGroup: krPayGroup, payLevel, universityRegion: tvlUniversityRegion }
              : null,
        tvalPflegeTariff:
          section === "WORK"
            ? (profile.tvalPflegeTariff ?? null)
            : salaryMode === "TVAL_PFLEGE" && trainingYear !== "UNSET"
              ? { trainingYear, universityRegion: tvlUniversityRegion }
              : null,
        nursingTrainingTariff:
          section === "WORK"
            ? (profile.nursingTrainingTariff ?? null)
            : salaryMode === "TVAOED_PFLEGE" && trainingYear !== "UNSET"
              ? { trainingYear, sector, tariffRegion }
              : null,
      });
      setMessage("Einstellungen gespeichert.");
    } catch (submitError) {
      setError(userFacingErrorMessage(submitError, "Speichern fehlgeschlagen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: section === "WORK" ? "Arbeitszeitmodell" : "Gehalt",
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          statusBarStyle: palette.dark ? "light" : "dark",
          headerRight: () => (
            <HeaderSaveAction
              busy={saving}
              closes={false}
              label="Speichern"
              onPress={() => void submit()}
            />
          ),
        }}
      />

      {section === "WORK" ? (
        <FormSection
          caption="Bestimmt Feiertage, Sollstunden und deinen Monatssaldo."
          title="Arbeitszeit"
        >
          <DropdownField
            label="Bundesland"
            onChange={(value) => {
              setFederalState(value);
              setHolidayRegion(defaultHolidayRegion(value));
            }}
            options={FEDERAL_STATES.map((state) => ({
              value: state,
              label: FEDERAL_STATE_LABELS[state],
            }))}
            value={federalState}
          />
          <DropdownField
            label="Regionale Feiertage am Arbeitsort"
            onChange={setHolidayRegion}
            options={holidayRegionsForState(federalState).map((region) => ({
              value: region,
              label: HOLIDAY_REGION_LABELS[region],
            }))}
            value={holidayRegion}
          />
          <Field
            error={weeklyHoursError}
            inputRef={weeklyHoursRef}
            keyboardType="decimal-pad"
            label="Wochenarbeitszeit in Stunden"
            onChangeText={(value) => {
              setWeeklyHours(value);
              if (weeklyHoursError) setWeeklyHoursError(null);
            }}
            returnKeyType="done"
            value={weeklyHours}
          />
          <DropdownField
            label="Regelmäßige Nacht- oder Wechselschichtarbeit"
            onChange={setRegularRotatingNightWork}
            options={evidenceOptions}
            value={regularRotatingNightWork}
          />
          <DropdownField
            label="Sonn- und Feiertagsarbeit nach § 10 ArbZG zulässig"
            onChange={setSundayHolidayWorkEligible}
            options={evidenceOptions}
            value={sundayHolidayWorkEligible}
          />
          <DropdownField
            label="Arbeitszeit aus allen Arbeitsverhältnissen erfasst"
            onChange={setAllEmploymentWorkRecorded}
            options={evidenceOptions}
            value={allEmploymentWorkRecorded}
          />
        </FormSection>
      ) : (
        <FormSection
          caption={
            salaryMode === "TVAL_PFLEGE"
              ? "TVA-L Pflege: Ausbildungsjahr auswählen."
              : salaryMode === "TVH_KR"
                ? "Hessen: Gruppe, Stufe und Vollzeit laut Vertrag."
                : salaryMode === "TVUK_NURSING"
                  ? "Für Pflege an den Unikliniken Freiburg, Heidelberg, Tübingen und Ulm."
                  : salaryMode === "TVL_KR"
                    ? "Gruppe und Stufe laut Vertrag wählen."
                    : "Tarif wählen oder Monatsbrutto eintragen."
          }
          title="Gehaltsgrundlage"
        >
          <DropdownField<IndustryFormValue>
            label="Berufsbereich"
            onChange={setIndustry}
            options={[
              { value: "UNKNOWN", label: "Nicht angegeben" },
              ...INDUSTRIES.map((value: Industry) => ({ value, label: INDUSTRY_LABELS[value] })),
            ]}
            value={industry}
          />
          <DropdownField
            label="Berechnung"
            onChange={(value) => {
              setSalaryMode(value);
              const levels =
                value === "TVL_KR"
                  ? tvlKrLevelsForGroup(krPayGroup)
                  : value === "TVOED_E"
                    ? ePayLevels(ePayGroup)
                    : payLevelsForGroup(payGroup);
              if (payLevel !== "UNSET" && !levels.includes(payLevel)) setPayLevel("UNSET");
            }}
            modalTitle="Gehaltsgrundlage"
            options={SALARY_BASIS_OPTIONS}
            value={salaryMode}
          />
          {salaryMode === "MANUAL" ? (
            <Field
              accessibilityHint="Betrag in Euro, zum Beispiel 3450 Komma 50"
              error={manualMonthlyGrossError}
              inputRef={manualMonthlyGrossRef}
              keyboardType="decimal-pad"
              label="Monatliches Brutto in Euro"
              onChangeText={(value) => {
                setManualMonthlyGross(value);
                if (manualMonthlyGrossError) setManualMonthlyGrossError(null);
              }}
              returnKeyType="done"
              value={manualMonthlyGross}
            />
          ) : salaryMode !== "UNSET" ? (
            <>
              {salaryMode === "TVH_KR" || salaryMode === "TVUK_NURSING" ? null : salaryMode ===
                  "TVL_KR" || salaryMode === "TVAL_PFLEGE" ? (
                <DropdownField
                  label="Tarifgebiet"
                  value={tvlUniversityRegion}
                  onChange={setTvlUniversityRegion}
                  options={[
                    { value: "WEST", label: "West" },
                    { value: "EAST", label: "Ost" },
                  ]}
                />
              ) : (
                <>
                  <DropdownField
                    label="Tarifbereich"
                    onChange={setSector}
                    options={[
                      { value: "BT_K", label: "Krankenhaus · BT-K" },
                      { value: "BT_B", label: "Pflege · BT-B" },
                    ]}
                    value={sector}
                  />
                  {(salaryMode === "TVOED_P" || sector === "BT_K") && (
                    <DropdownField
                      label="Tarifgebiet"
                      onChange={setTariffRegion}
                      options={(["KAV_BW", "OTHER"] as const).map((region) => ({
                        value: region,
                        label: TARIFF_REGION_LABELS[region],
                      }))}
                      value={tariffRegion}
                    />
                  )}
                </>
              )}
              {salaryMode === "TVH_KR" ? (
                <>
                  <DropdownField
                    label="Entgeltgruppe"
                    value={tvhPayGroup}
                    onChange={(group) => {
                      setTvhPayGroup(group);
                      if (
                        tvhPayLevel !== "UNSET" &&
                        !tvhKrLevelsForGroup(group).includes(tvhPayLevel)
                      )
                        setTvhPayLevel("UNSET");
                    }}
                    options={TVH_KR_GROUPS.map((group) => ({
                      value: group,
                      label: group,
                    }))}
                  />
                  <DropdownField
                    label="Stufe"
                    value={tvhPayLevel}
                    onChange={setTvhPayLevel}
                    options={[
                      ...(tvhPayLevel === "UNSET"
                        ? [{ value: "UNSET" as const, label: "Bitte auswählen" }]
                        : []),
                      ...tvhKrLevelsForGroup(tvhPayGroup).map((level) => ({
                        value: level,
                        label: "Stufe " + level,
                      })),
                    ]}
                  />
                </>
              ) : salaryMode === "TVUK_NURSING" ? (
                <>
                  <DropdownField
                    label="Entgeltgruppe"
                    value={tvUkPayGroup}
                    onChange={(group) => {
                      setTvUkPayGroup(group);
                      if (
                        tvUkPayLevel !== "UNSET" &&
                        !tvUkLevelsForGroup(group).includes(tvUkPayLevel)
                      )
                        setTvUkPayLevel("UNSET");
                    }}
                    options={TVUK_NURSING_GROUPS.map((group) => ({
                      value: group,
                      label: group.replace("PUK", "P-UK"),
                    }))}
                  />
                  <DropdownField
                    label="Stufe"
                    value={tvUkPayLevel}
                    onChange={setTvUkPayLevel}
                    options={[
                      ...(tvUkPayLevel === "UNSET"
                        ? [{ value: "UNSET" as const, label: "Bitte auswählen" }]
                        : []),
                      ...tvUkLevelsForGroup(tvUkPayGroup).map((level) => ({
                        value: level,
                        label: "Stufe " + level,
                      })),
                    ]}
                  />
                </>
              ) : salaryMode === "TVAOED_PFLEGE" || salaryMode === "TVAL_PFLEGE" ? (
                <DropdownField
                  label="Ausbildungsjahr"
                  value={trainingYear}
                  onChange={setTrainingYear}
                  options={[
                    { value: "UNSET" as const, label: "Bitte wählen" },
                    ...([1, 2, 3] as const).map((year) => ({
                      value: year,
                      label: `${year}. Ausbildungsjahr`,
                    })),
                  ]}
                />
              ) : (
                <>
                  {salaryMode === "TVL_KR" ? (
                    <DropdownField
                      label="Entgeltgruppe"
                      value={krPayGroup}
                      onChange={(group) => {
                        setKrPayGroup(group);
                        if (payLevel !== "UNSET" && !tvlKrLevelsForGroup(group).includes(payLevel))
                          setPayLevel("UNSET");
                      }}
                      options={TVL_KR_GROUPS.map((group) => ({ value: group, label: group }))}
                    />
                  ) : salaryMode === "TVOED_E" ? (
                    <DropdownField
                      label="Entgeltgruppe"
                      value={ePayGroup}
                      onChange={(group) => {
                        setEPayGroup(group);
                        if (payLevel !== "UNSET" && !ePayLevels(group).includes(payLevel))
                          setPayLevel("UNSET");
                      }}
                      options={VKA_E_GROUPS.map((group) => ({ value: group, label: group }))}
                    />
                  ) : (
                    <DropdownField
                      label="Entgeltgruppe"
                      onChange={(group) => {
                        setPayGroup(group);
                        if (payLevel !== "UNSET" && !payLevelsForGroup(group).includes(payLevel)) {
                          setPayLevel("UNSET");
                        }
                      }}
                      options={PAY_GROUPS.map((group) => ({ value: group, label: group }))}
                      value={payGroup}
                    />
                  )}
                  <DropdownField
                    label="Stufe"
                    onChange={setPayLevel}
                    options={[
                      ...(payLevel === "UNSET"
                        ? [{ value: "UNSET" as const, label: "Bitte auswählen" }]
                        : []),
                      ...selectedLevels.map((level) => ({
                        value: level,
                        label: `Stufe ${level}`,
                      })),
                    ]}
                    value={payLevel}
                  />
                </>
              )}
              {salaryMode === "TVH_KR" ? (
                <DropdownField
                  label="Tarifliche Vollzeit pro Woche"
                  value={tvhFullTimeWeeklyMinutes}
                  onChange={setTvhFullTimeWeeklyMinutes}
                  options={[
                    { value: 2310 as const, label: "38,5" },
                    { value: 2400 as const, label: "40" },
                  ]}
                />
              ) : (
                <Field
                  editable={false}
                  label="Tarifliche Vollzeit pro Woche"
                  value={fullTimeHours}
                />
              )}
            </>
          ) : null}
        </FormSection>
      )}

      <FormStatus error={error} message={message} />
      <SheetBackFooter disabled={saving} onPress={() => router.back()} />
    </FormScreen>
  );
}
