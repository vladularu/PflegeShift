import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import type { RemunerationPosition, RemunerationStatus } from "@/domain/remuneration-result";
import { usePalette } from "@/theme/palette";
import { SPACING, CONTROL_HEIGHT } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SurfaceCard, CardSeparator } from "@/ui/design-system";
import {
  REMUNERATION_STATUS,
  remunerationBasis,
  remunerationEuro,
  remunerationPeriod,
} from "./remuneration-presentation";

export function RemunerationText({
  children,
  muted = false,
}: React.PropsWithChildren<{ readonly muted?: boolean }>) {
  const palette = usePalette();
  return (
    <Text
      selectable
      maxFontSizeMultiplier={TEXT_MAX_SCALE}
      style={{ color: muted ? palette.textMuted : palette.text, ...TYPOGRAPHY.body }}
    >
      {children}
    </Text>
  );
}
export function RemunerationPositions({
  positions,
}: {
  readonly positions: readonly RemunerationPosition[];
}) {
  return (
    <View style={{ gap: SPACING.md }}>
      {positions.length === 0 ? (
        <RemunerationText muted>
          Keine anrechenbaren Positionen in diesem Zeitraum.
        </RemunerationText>
      ) : null}
      {positions.map((position) => (
        <Position key={position.id} position={position} />
      ))}
    </View>
  );
}
function Position({ position }: { readonly position: RemunerationPosition }) {
  const [expanded, setExpanded] = useState(false);
  const source = position.source;
  return (
    <View style={{ gap: SPACING.xs }}>
      <RemunerationText>{position.label}</RemunerationText>
      <RemunerationText muted>
        {remunerationPeriod(position.from, position.through)}
      </RemunerationText>
      <RemunerationText>
        {position.amountCents === null
          ? REMUNERATION_STATUS[position.status]
          : `${remunerationEuro(position.amountCents)} · ${REMUNERATION_STATUS[position.status]}`}
      </RemunerationText>
      {position.issue ? <RemunerationText>{position.issue.message}</RemunerationText> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Berechnungsgrundlage: ${position.label}, ${remunerationPeriod(position.from, position.through)}`}
        onPress={() => setExpanded(!expanded)}
        style={{ minHeight: CONTROL_HEIGHT.regular, justifyContent: "center" }}
      >
        <RemunerationText muted>
          {expanded ? "Berechnungsgrundlage schließen" : "Berechnungsgrundlage & Quellen"}
        </RemunerationText>
      </Pressable>
      {expanded ? (
        <View style={{ gap: SPACING.xs }}>
          {remunerationBasis(position).map((line, index) => (
            <RemunerationText key={index} muted>
              {line}
            </RemunerationText>
          ))}
          <RemunerationText muted>
            {position.kind === "annual-payment" && position.basis.method === "actual"
              ? "Persönlich bestätigte tatsächliche Bruttozahlung"
              : position.kind === "annual-payment" && position.basis.tariff
                ? position.basis.tariff.claimRevision === null
                  ? "Persönliche Jahresangaben noch nicht erfasst"
                  : `Persönliche Anspruchsangaben · Revision ${position.basis.tariff.claimRevision}`
                : source.profileEffectiveFrom
                  ? `Vergütungsprofil ab ${source.profileEffectiveFrom} · Revision ${source.profileRevision}`
                  : position.kind === "allowance" &&
                      position.basis.ruleId?.startsWith("tvl-part-iv:burn-month-")
                    ? "Monatssumme aus den gültigen datierten Vergütungsprofilen"
                    : "Kein bestätigter Gültigkeitsbeginn"}
          </RemunerationText>
          <RemunerationText muted>
            {source.packageId
              ? `Regelpaket: ${source.packageId} · ${source.versionId ?? "mehrere Regelstände"}`
              : source.requestedPackageId
                ? `Angefragt, nicht verfügbar: ${source.requestedPackageId}`
                : "Quelle: persönliche Angaben"}
          </RemunerationText>
          {source.packageValidFrom ? (
            <RemunerationText muted>
              Regelgültigkeit: {source.packageValidFrom} bis {source.packageValidTo ?? "offen"}
            </RemunerationText>
          ) : null}
          {source.references.map((reference) => (
            <View key={reference.id} style={{ gap: SPACING.xxs }}>
              <RemunerationText muted>
                {reference.title} · {reference.section}
              </RemunerationText>
              <RemunerationText muted>{reference.url}</RemunerationText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
export function RemunerationComponentCard({
  title,
  component,
  onPress,
  compact = false,
}: {
  readonly title: string;
  readonly component: {
    readonly status: RemunerationStatus;
    readonly totalCents: number | null;
    readonly knownSubtotalCents: number;
    readonly positions: readonly RemunerationPosition[];
  };
  readonly onPress?: () => void;
  readonly compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const palette = usePalette();
  const stacked = useWindowDimensions().fontScale >= 1.6;
  const Wrapper = compact ? View : SurfaceCard;
  const value =
    component.totalCents === null
      ? REMUNERATION_STATUS[component.status]
      : `${remunerationEuro(component.totalCents)} · ${REMUNERATION_STATUS[component.status]}`;
  return (
    <Wrapper
      style={{
        paddingVertical: compact ? SPACING.sm : SPACING.lg,
        paddingHorizontal: compact ? 0 : SPACING.lg,
        gap: SPACING.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, Details öffnen`}
        accessibilityValue={{ text: value }}
        accessibilityState={onPress ? undefined : { expanded }}
        onPress={onPress ?? (() => setExpanded(!expanded))}
        style={{ minHeight: CONTROL_HEIGHT.regular, gap: SPACING.xs }}
      >
        <View
          style={{
            flexDirection: compact && stacked ? "column" : "row",
            alignItems: compact && stacked ? "flex-start" : "center",
            gap: SPACING.sm,
          }}
        >
          <View style={{ flex: compact && stacked ? undefined : 1 }}>
            <RemunerationText muted={compact}>{title}</RemunerationText>
          </View>
          {compact ? (
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{
                color: palette.text,
                ...TYPOGRAPHY.bodyStrong,
                flexShrink: 1,
                fontVariant: ["tabular-nums"],
              }}
            >
              {remunerationEuro(component.totalCents)}
            </Text>
          ) : null}
          <Ionicons
            accessibilityElementsHidden
            color={palette.textMuted}
            size={20}
            name={
              compact
                ? "ellipsis-horizontal-circle"
                : onPress
                  ? "chevron-forward"
                  : expanded
                    ? "chevron-up"
                    : "chevron-down"
            }
          />
        </View>
        {!compact ? <RemunerationText>{value}</RemunerationText> : null}
        {component.totalCents === null ? (
          <RemunerationText muted>
            Bekannter Teilbetrag: {remunerationEuro(component.knownSubtotalCents)}
          </RemunerationText>
        ) : null}
      </Pressable>
      {expanded && !onPress ? (
        <>
          <CardSeparator inset={0} />
          <RemunerationPositions positions={component.positions} />
        </>
      ) : null}
    </Wrapper>
  );
}
