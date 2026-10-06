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
import { Children, Fragment, isValidElement, useEffect, useRef, useState } from "react";
import { Text, TextInput, View, useWindowDimensions } from "react-native";

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
  settingsFormValuesForSalaryMode,
  type EvidenceFormValue,
  type IndustryFormValue,
  type SalaryMode,
} from "@/features/settings/settings-form-values";
import { parseEnumRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { SALARY_BASIS_OPTIONS } from "@/features/settings/salary-basis-options";
import { Field } from "@/ui/form-controls";
import { FormStatus, HeaderSaveAction } from "@/ui/form-layout";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { focusInvalidField, weeklyHoursFieldError } from "@/ui/form-validation";
import { ProfileChoice, ProfileEditorBusyContext, useProfileSelection } from "./profile-selection";
import { useProfileLeaveGuard } from "./use-profile-leave-guard";
import { ProfilePage } from "./profile-page";
import { requireProfileText } from "@/domain/validation";
import {
  CardSeparator,
  SectionHeader,
  SegmentedControl,
  SurfaceCard,
  RowButton,
} from "@/ui/design-system";
import { SPACING } from "@/theme/tokens";
import { TYPOGRAPHY, TEXT_MAX_SCALE } from "@/theme/typography";
import type { PropsWithChildren } from "react";

type SettingsSection = "WORK" | "TARIFF" | "PERSONAL";

export function SettingsEditorScreen() {
  const params = useLocalSearchParams<{ section?: RouteParam }>();
  const parsedSection = parseEnumRouteParam(params.section, [
    "WORK",
    "TARIFF",
    "PERSONAL",
  ] as const);
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
  const { width, fontScale } = useWindowDimensions();
  const compactHeader = width < 390 || fontScale > 1.15;
  const pageTitle =
    section === "WORK"
      ? "Arbeitszeit"
      : section === "PERSONAL"
        ? "Persönliche Angaben"
        : "Tarif & Gehalt";
  const { updateProfile } = usePflegeShiftProfile();
  const { clear: clearSelection } = useProfileSelection();
  useEffect(() => () => clearSelection(), [clearSelection]);
  const [initialValues] = useState(() => settingsFormValues(profile));
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [employerName, setEmployerName] = useState(profile.employerName ?? "");
  const [confirmedGroups, setConfirmedGroups] = useState<readonly SalaryMode[]>(() => {
    const bases = profile.salaryBasisConflict ?? profile;
    return (
      [
        ["TVOED_P", bases.tariff],
        ["TVOED_E", bases.vkaETariff],
        ["TVL_KR", bases.tvlKrTariff],
        ["TVH_KR", bases.tvhKrTariff],
        ["TVUK_NURSING", bases.tvUkNursingTariff],
      ] as const
    )
      .filter((entry) => entry[1] != null)
      .map((entry) => entry[0]);
  });
  const [lastTariffMode, setLastTariffMode] = useState<SalaryMode>(
    initialValues.salaryMode === "MANUAL" ? "UNSET" : initialValues.salaryMode,
  );
  const [pFullTimeOverride, setPFullTimeOverride] = useState<number | null>(
    profile.tariff?.fullTimeWeeklyMinutes ?? null,
  );
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
  const derivedFullTimeWeeklyMinutes =
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
  const fullTimeWeeklyMinutes =
    salaryMode === "TVOED_P"
      ? (pFullTimeOverride ?? derivedFullTimeWeeklyMinutes)
      : derivedFullTimeWeeklyMinutes;
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

  const busyRef = useRef(false);
  const draft =
    section === "PERSONAL"
      ? [displayName, employerName]
      : section === "WORK"
        ? [
            federalState,
            holidayRegion,
            weeklyHours,
            regularRotatingNightWork,
            sundayHolidayWorkEligible,
            allEmploymentWorkRecorded,
          ]
        : [
            industry,
            salaryMode,
            trainingYear,
            manualMonthlyGross,
            tvhPayGroup,
            tvhPayLevel,
            tvhFullTimeWeeklyMinutes,
            tvUkPayGroup,
            tvUkPayLevel,
            krPayGroup,
            tvlUniversityRegion,
            ePayGroup,
            payGroup,
            payLevel,
            sector,
            tariffRegion,
            pFullTimeOverride,
            confirmedGroups,
          ];
  const [snapshot] = useState(() => JSON.stringify(draft));
  const leave = useProfileLeaveGuard(JSON.stringify(draft) !== snapshot, saving);
  const isTraining = salaryMode === "TVAOED_PFLEGE" || salaryMode === "TVAL_PFLEGE";
  const activeGroup =
    salaryMode === "TVH_KR"
      ? tvhPayGroup
      : salaryMode === "TVUK_NURSING"
        ? tvUkPayGroup
        : salaryMode === "TVL_KR"
          ? krPayGroup
          : salaryMode === "TVOED_E"
            ? ePayGroup
            : payGroup;
  const groupValues =
    salaryMode === "TVH_KR"
      ? TVH_KR_GROUPS
      : salaryMode === "TVUK_NURSING"
        ? TVUK_NURSING_GROUPS
        : salaryMode === "TVL_KR"
          ? TVL_KR_GROUPS
          : salaryMode === "TVOED_E"
            ? VKA_E_GROUPS
            : PAY_GROUPS;
  const activeLevels =
    salaryMode === "TVH_KR"
      ? tvhKrLevelsForGroup(tvhPayGroup)
      : salaryMode === "TVUK_NURSING"
        ? tvUkLevelsForGroup(tvUkPayGroup)
        : selectedLevels;
  const activeLevel =
    salaryMode === "TVH_KR" ? tvhPayLevel : salaryMode === "TVUK_NURSING" ? tvUkPayLevel : payLevel;
  function selectGroup(group: string) {
    if (!groupValues.some((value) => value === group)) return;
    setConfirmedGroups((current) =>
      current.includes(salaryMode) ? current : [...current, salaryMode],
    );
    if (salaryMode === "TVH_KR") {
      const next = group as TvhKrGroup;
      setTvhPayGroup(next);
      if (tvhPayLevel !== "UNSET" && !tvhKrLevelsForGroup(next).includes(tvhPayLevel))
        setTvhPayLevel("UNSET");
    } else if (salaryMode === "TVUK_NURSING") {
      const next = group as TvUkNursingGroup;
      setTvUkPayGroup(next);
      if (tvUkPayLevel !== "UNSET" && !tvUkLevelsForGroup(next).includes(tvUkPayLevel))
        setTvUkPayLevel("UNSET");
    } else {
      const levels =
        salaryMode === "TVL_KR"
          ? tvlKrLevelsForGroup(group as TvlKrGroup)
          : salaryMode === "TVOED_E"
            ? ePayLevels(group as VkaETariff["payGroup"])
            : payLevelsForGroup(group as PayGroup);
      if (salaryMode === "TVL_KR") setKrPayGroup(group as TvlKrGroup);
      else if (salaryMode === "TVOED_E") setEPayGroup(group as VkaETariff["payGroup"]);
      else setPayGroup(group as PayGroup);
      if (payLevel !== "UNSET" && !levels.includes(payLevel)) setPayLevel("UNSET");
    }
  }
  const salaryDraft = {
    trainingYear,
    manualMonthlyGross,
    payGroup,
    payLevel,
    sector,
    tariffRegion,
    ePayGroup,
    krPayGroup,
    tvlUniversityRegion,
    tvhPayGroup,
    tvhPayLevel,
    tvhFullTimeWeeklyMinutes,
    tvUkPayGroup,
    tvUkPayLevel,
    pFullTimeOverride,
  };
  const salaryDrafts = useRef(new Map<SalaryMode, typeof salaryDraft>());
  function changeSalaryMode(value: SalaryMode) {
    if (value === salaryMode) return;
    salaryDrafts.current.set(salaryMode, salaryDraft);
    const cached = salaryDrafts.current.get(value);
    const restored =
      cached ??
      (profile.salaryBasisConflict
        ? settingsFormValuesForSalaryMode(profile, value)
        : {
            ...settingsFormValuesForSalaryMode(profile, value),
            sector,
            tariffRegion,
            tvlUniversityRegion,
          });
    setSalaryMode(value);
    if (value !== "MANUAL") setLastTariffMode(value);
    setManualMonthlyGross(restored.manualMonthlyGross);
    setTrainingYear(restored.trainingYear);
    setPayGroup(restored.payGroup);
    setPayLevel(restored.payLevel);
    setSector(restored.sector);
    setTariffRegion(restored.tariffRegion);
    setEPayGroup(restored.ePayGroup);
    setKrPayGroup(restored.krPayGroup);
    setTvlUniversityRegion(restored.tvlUniversityRegion);
    setTvhPayGroup(restored.tvhPayGroup);
    setTvhPayLevel(restored.tvhPayLevel);
    setTvhFullTimeWeeklyMinutes(restored.tvhFullTimeWeeklyMinutes);
    setTvUkPayGroup(restored.tvUkPayGroup);
    setTvUkPayLevel(restored.tvUkPayLevel);
    const bases = profile.salaryBasisConflict ?? profile;
    setPFullTimeOverride(
      cached ? cached.pFullTimeOverride : (bases.tariff?.fullTimeWeeklyMinutes ?? null),
    );
    if (!cached && !confirmedGroups.includes(value) && value !== "MANUAL") {
      if (value === "TVH_KR") setTvhPayLevel("UNSET");
      else if (value === "TVUK_NURSING") setTvUkPayLevel("UNSET");
      else setPayLevel("UNSET");
    }
    if (
      !cached &&
      ((value === "TVAOED_PFLEGE" && !bases.nursingTrainingTariff) ||
        (value === "TVAL_PFLEGE" && !bases.tvalPflegeTariff))
    )
      setTrainingYear("UNSET");
  }

  async function submit() {
    if (busyRef.current) return;
    if (section === "PERSONAL") {
      try {
        const name = requireProfileText(displayName, "Name", 80);
        const employer = requireProfileText(employerName, "Arbeitgeber", 160);
        busyRef.current = true;
        setSaving(true);
        setError(null);
        await updateProfile({ ...profile, displayName: name, employerName: employer });
        leave.saved();
      } catch (submitError) {
        setError(userFacingErrorMessage(submitError, "Profil konnte nicht gespeichert werden."));
      } finally {
        busyRef.current = false;
        setSaving(false);
      }
      return;
    }
    if (
      section === "TARIFF" &&
      salaryMode !== "MANUAL" &&
      salaryMode !== "UNSET" &&
      !isTraining &&
      !confirmedGroups.includes(salaryMode)
    ) {
      setError(
        "Bitte eine gültige Entgeltgruppe für den gewählten Tarif wählen. Gruppe und Stufe werden nicht automatisch ersetzt.",
      );
      return;
    }
    if (
      section === "TARIFF" &&
      !isTraining &&
      salaryMode !== "MANUAL" &&
      salaryMode !== "UNSET" &&
      activeLevel !== "UNSET" &&
      !(activeLevels as readonly (string | number)[]).includes(activeLevel)
    ) {
      setError("Bitte eine gültige Stufe für die gewählte Gruppe wählen.");
      return;
    }
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
      busyRef.current = true;
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
      leave.saved();
    } catch (submitError) {
      setError(userFacingErrorMessage(submitError, "Speichern fehlgeschlagen."));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  return (
    <ProfileEditorBusyContext.Provider value={saving}>
      <ProfilePage
        title={pageTitle}
        backLabel="Zurück zum Arbeitsprofil"
        onBack={() => router.back()}
        backDisabled={saving}
        testID="profile-editor-content"
      >
        <Stack.Screen
          options={{
            title: pageTitle,
            headerTitle: compactHeader ? "" : pageTitle,
            presentation: "card",
            headerBackVisible: false,
            headerLeft: () => (
              <HeaderSaveAction
                busy={saving}
                label="Abbrechen"
                closes={false}
                onPress={leave.cancel}
              />
            ),
            headerRight: () => (
              <HeaderSaveAction busy={saving} label="Speichern" onPress={() => void submit()} />
            ),
            headerStyle: { backgroundColor: palette.background },
            headerTintColor: palette.text,
            headerTitleStyle: { color: palette.text },
            statusBarStyle: palette.dark ? "light" : "dark",
          }}
        />
        {compactHeader ? <SectionHeader title={pageTitle} /> : null}
        {section === "PERSONAL" ? (
          <ProfileGroup title="Persönliche Angaben">
            <InputInset>
              <Field
                label="Name"
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={80}
                editable={!saving}
                autoCapitalize="words"
                textContentType="name"
              />
            </InputInset>
            <InputInset>
              <Field
                label="Arbeitgeber"
                value={employerName}
                onChangeText={setEmployerName}
                maxLength={160}
                editable={!saving}
                autoCapitalize="words"
              />
            </InputInset>
          </ProfileGroup>
        ) : section === "WORK" ? (
          <>
            <ProfileGroup title="Vertrag">
              <InputInset>
                <Field
                  inputRef={weeklyHoursRef}
                  error={weeklyHoursError}
                  keyboardType="decimal-pad"
                  label="Deine Wochenstunden (Std.)"
                  editable={!saving}
                  value={weeklyHours}
                  onChangeText={(value) => {
                    setWeeklyHours(value);
                    setWeeklyHoursError(null);
                  }}
                />
              </InputInset>
            </ProfileGroup>
            <ProfileGroup
              title="Arbeitsort"
              caption="Feiertage richten sich nach deinem Arbeitsort."
            >
              <ProfileChoice
                label="Bundesland"
                value={federalState}
                options={FEDERAL_STATES.map((value) => ({
                  value,
                  label: FEDERAL_STATE_LABELS[value],
                }))}
                onChange={(value) => {
                  setFederalState(value);
                  if (value !== federalState) setHolidayRegion(defaultHolidayRegion(value));
                }}
              />
              {holidayRegionsForState(federalState).length > 1 ? (
                <ProfileChoice
                  label="Regionale Feiertage"
                  value={holidayRegion}
                  options={holidayRegionsForState(federalState).map((value) => ({
                    value,
                    label: HOLIDAY_REGION_LABELS[value],
                  }))}
                  onChange={setHolidayRegion}
                />
              ) : null}
            </ProfileGroup>
            <ProfileGroup
              title="Angaben für die Dienstplanprüfung"
              caption="Unbestätigte Angaben bleiben als Prüfannahmen offen."
            >
              <ProfileChoice
                label="Regelmäßige Nacht- oder Wechselschichtarbeit"
                value={regularRotatingNightWork}
                options={evidenceOptions}
                onChange={setRegularRotatingNightWork}
              />
              <ProfileChoice
                label="Sonn- und Feiertagsarbeit nach § 10 ArbZG zulässig"
                value={sundayHolidayWorkEligible}
                options={evidenceOptions}
                onChange={setSundayHolidayWorkEligible}
              />
              <ProfileChoice
                label="Arbeitszeit aus allen Arbeitsverhältnissen erfasst"
                value={allEmploymentWorkRecorded}
                options={evidenceOptions}
                onChange={setAllEmploymentWorkRecorded}
              />
            </ProfileGroup>
          </>
        ) : (
          <>
            <ProfileGroup title="Gehaltsgrundlage">
              <InputInset>
                <SegmentedControl
                  value={salaryMode === "MANUAL" ? "MANUAL" : "TARIFF"}
                  items={[
                    { value: "TARIFF", label: "Nach Tarif" },
                    { value: "MANUAL", label: "Eigenes Brutto" },
                  ]}
                  onChange={(value) => {
                    if (!saving) changeSalaryMode(value === "MANUAL" ? "MANUAL" : lastTariffMode);
                  }}
                />
              </InputInset>
              {profile.salaryBasisConflict ? (
                <InputInset>
                  <Hint>
                    Mehrere Gehaltsgrundlagen sind gespeichert. Bitte eine wählen; die übrigen
                    werden erst beim Speichern abgelöst.
                  </Hint>
                </InputInset>
              ) : null}
            </ProfileGroup>
            {salaryMode === "MANUAL" ? (
              <ProfileGroup title="Eigenes Brutto">
                <InputInset>
                  <Field
                    inputRef={manualMonthlyGrossRef}
                    error={manualMonthlyGrossError}
                    editable={!saving}
                    keyboardType="decimal-pad"
                    label="Monatliches Brutto in Euro"
                    value={manualMonthlyGross}
                    onChangeText={(value) => {
                      setManualMonthlyGross(value);
                      setManualMonthlyGrossError(null);
                    }}
                  />
                </InputInset>
              </ProfileGroup>
            ) : (
              <>
                <ProfileGroup title="Tarif">
                  <ProfileChoice
                    label="Berufsbereich"
                    value={industry}
                    options={[
                      { value: "UNKNOWN", label: "Noch nicht angegeben" },
                      ...INDUSTRIES.map((value) => ({ value, label: INDUSTRY_LABELS[value] })),
                    ]}
                    onChange={setIndustry}
                  />
                  <ProfileChoice
                    label="Tarifvertrag"
                    value={salaryMode}
                    options={SALARY_BASIS_OPTIONS.filter((option) => option.value !== "MANUAL")}
                    onChange={changeSalaryMode}
                  />
                  {salaryMode === "TVH_KR" || salaryMode === "TVUK_NURSING" ? (
                    <InputInset>
                      <Hint>
                        {salaryMode === "TVH_KR"
                          ? "TV-H Pflege · Hessen"
                          : "TV-UK Pflege · Baden-Württemberg"}
                      </Hint>
                    </InputInset>
                  ) : null}
                  {salaryMode === "TVL_KR" || salaryMode === "TVAL_PFLEGE" ? (
                    <ProfileChoice
                      label="Tarifregion"
                      value={tvlUniversityRegion}
                      options={[
                        { value: "WEST", label: "West" },
                        { value: "EAST", label: "Ost" },
                      ]}
                      onChange={setTvlUniversityRegion}
                    />
                  ) : null}
                  {salaryMode === "TVOED_P" ||
                  salaryMode === "TVOED_E" ||
                  salaryMode === "TVAOED_PFLEGE" ? (
                    <>
                      <ProfileChoice
                        label="Einrichtung"
                        value={sector}
                        options={[
                          { value: "BT_K", label: "Krankenhaus (BT-K)" },
                          { value: "BT_B", label: "Pflegeeinrichtung (BT-B)" },
                        ]}
                        onChange={(value) => {
                          setSector(value);
                          setPFullTimeOverride(null);
                        }}
                      />
                      {salaryMode === "TVOED_P" || sector === "BT_K" ? (
                        <ProfileChoice
                          label="Tarifregion"
                          value={tariffRegion}
                          options={[
                            { value: "KAV_BW", label: TARIFF_REGION_LABELS.KAV_BW },
                            { value: "OTHER", label: TARIFF_REGION_LABELS.OTHER },
                          ]}
                          onChange={(value) => {
                            setTariffRegion(value);
                            setPFullTimeOverride(null);
                          }}
                        />
                      ) : null}
                    </>
                  ) : null}
                </ProfileGroup>
                {salaryMode !== "UNSET" ? (
                  <ProfileGroup title={isTraining ? "Ausbildung" : "Eingruppierung"}>
                    {isTraining ? (
                      <ProfileChoice
                        label="Ausbildungsjahr"
                        value={trainingYear}
                        options={[1, 2, 3].map((value) => ({
                          value: value as 1 | 2 | 3,
                          label: `${value}. Ausbildungsjahr`,
                        }))}
                        onChange={setTrainingYear}
                      />
                    ) : (
                      <>
                        <ProfileChoice
                          label="Entgeltgruppe"
                          value={confirmedGroups.includes(salaryMode) ? activeGroup : "UNSET"}
                          options={groupValues.map((value) => ({
                            value,
                            label: value.replace("PUK", "P-UK"),
                          }))}
                          onChange={selectGroup}
                        />
                        <ProfileChoice
                          label="Stufe"
                          disabled={!confirmedGroups.includes(salaryMode)}
                          value={activeLevel}
                          options={activeLevels.map((value) => ({
                            value,
                            label: `Stufe ${value}`,
                          }))}
                          onChange={(value) => {
                            if (salaryMode === "TVH_KR") setTvhPayLevel(value as TvhKrPayLevel);
                            else if (salaryMode === "TVUK_NURSING")
                              setTvUkPayLevel(value as TvUkPayLevel);
                            else setPayLevel(value as PayLevel);
                          }}
                        />
                        {!confirmedGroups.includes(salaryMode) || activeLevel === "UNSET" ? (
                          <InputInset>
                            <Hint>
                              Bitte wähle eine gültige Gruppe und Stufe für diesen Tarif. Es werden
                              keine Ersatzwerte gespeichert.
                            </Hint>
                          </InputInset>
                        ) : null}
                      </>
                    )}
                  </ProfileGroup>
                ) : null}
                {salaryMode !== "UNSET" ? (
                  <ProfileGroup title="Arbeitszeitbasis">
                    <RowButton
                      title="Deine Wochenstunden"
                      subtitle={`${initialValues.weeklyHours} Std.`}
                    />
                    {salaryMode === "TVH_KR" ? (
                      <ProfileChoice
                        label="Vollzeit laut Tarif"
                        value={tvhFullTimeWeeklyMinutes}
                        options={[
                          { value: 2310, label: "38,5 Std." },
                          { value: 2400, label: "40 Std." },
                        ]}
                        onChange={setTvhFullTimeWeeklyMinutes}
                      />
                    ) : (
                      <RowButton title="Vollzeit laut Tarif" subtitle={`${fullTimeHours} Std.`} />
                    )}
                  </ProfileGroup>
                ) : null}
              </>
            )}
          </>
        )}
        <FormStatus message={message} error={error} />
      </ProfilePage>
    </ProfileEditorBusyContext.Provider>
  );
}
function ProfileGroup({
  title,
  caption,
  children,
}: PropsWithChildren<{ readonly title: string; readonly caption?: string }>) {
  const rows = flattenRows(children);
  return (
    <View style={{ gap: SPACING.sm }}>
      <SectionHeader title={title} caption={caption} />
      <SurfaceCard>
        {rows.map((child, index) => (
          <Fragment key={index}>
            {index ? <CardSeparator /> : null}
            {child}
          </Fragment>
        ))}
      </SurfaceCard>
    </View>
  );
}
function InputInset({ children }: PropsWithChildren) {
  return <View style={{ padding: SPACING.md }}>{children}</View>;
}
function Hint({ children }: PropsWithChildren) {
  const palette = usePalette();
  return (
    <Text
      maxFontSizeMultiplier={TEXT_MAX_SCALE}
      style={{ color: palette.textMuted, ...TYPOGRAPHY.footnote }}
    >
      {children}
    </Text>
  );
}

function flattenRows(children: import("react").ReactNode): import("react").ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<PropsWithChildren>(child) && child.type === Fragment
      ? flattenRows(child.props.children)
      : [child],
  );
}
