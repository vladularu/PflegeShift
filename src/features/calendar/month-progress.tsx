import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import type { MonthlySummary } from "@/domain/types";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { usePalette } from "@/theme/palette";

const SIZE = 66;
const STROKE_WIDTH = 6;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function MonthProgress({ summary }: { readonly summary: MonthlySummary }) {
  const palette = usePalette();
  const rawProgress =
    summary.targetMinutes > 0 ? summary.actualMinutes / summary.targetMinutes : 0;
  const progress = Math.max(0, Math.min(rawProgress, 1));
  const percentage = Math.round(rawProgress * 100);
  const progressColor =
    summary.actualMinutes > summary.targetMinutes ? palette.danger : palette.primary;

  return (
    <View
      accessibilityLabel={`${percentage} Prozent der Sollzeit. Ist ${formatMinutes(summary.actualMinutes)}, Soll ${formatMinutes(summary.targetMinutes)}, Saldo ${formatSignedMinutes(summary.balanceMinutes)}`}
      accessible
      style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
    >
      <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
        <Svg height={SIZE} width={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            fill="none"
            r={RADIUS}
            stroke={palette.border}
            strokeWidth={STROKE_WIDTH}
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            fill="none"
            origin={`${SIZE / 2}, ${SIZE / 2}`}
            r={RADIUS}
            rotation="-90"
            stroke={progressColor}
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            strokeLinecap="round"
            strokeWidth={STROKE_WIDTH}
          />
        </Svg>
        <View
          style={{
            position: "absolute",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Text
            selectable
            style={{
              color: palette.text,
              fontSize: percentage >= 100 ? 13 : 15,
              fontWeight: "900",
              fontVariant: ["tabular-nums"],
            }}
          >
            {percentage}%
          </Text>
        </View>
      </View>

      <View style={{ minWidth: 78, gap: 3 }}>
        <SummaryLine label="Ist" value={formatMinutes(summary.actualMinutes)} />
        <SummaryLine label="Soll" value={formatMinutes(summary.targetMinutes)} />
        <SummaryLine
          color={summary.balanceMinutes >= 0 ? palette.primary : palette.danger}
          label="Saldo"
          value={formatSignedMinutes(summary.balanceMinutes)}
        />
      </View>
    </View>
  );
}

function SummaryLine({
  label,
  value,
  color,
}: {
  readonly label: string;
  readonly value: string;
  readonly color?: string;
}) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: "700" }}>{label}</Text>
      <Text
        selectable
        style={{
          color: color ?? palette.text,
          fontSize: 11,
          fontWeight: "900",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
    </View>
  );
}
