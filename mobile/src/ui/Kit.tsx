/*
 * Small building blocks the v3 design repeats on almost every screen:
 * segmented controls, tinted icon tiles, grouped list cards, stat tiles,
 * progress bars, a progress ring and a toggle.
 */
import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, toneColors, type Tone } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/* ---------- Segmented control: "Open · 5 | Assigned by me | Done" ---------- */
export const Segmented = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) => {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.segTrack, { backgroundColor: colors.track }]} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            style={[styles.segItem, active && [styles.segActive, { backgroundColor: colors.surface }, scheme === "light" && styles.segShadow]]}
          >
            <Text variant="smallStrong" color={active ? colors.text : colors.textMuted} numberOfLines={1} style={styles.segLabel}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

/* ---------- Tinted rounded-square icon ---------- */
export const IconTile = ({
  icon,
  tone = "primary",
  size = 36,
  iconSize,
  solid,
}: {
  icon: IconName;
  tone?: Tone;
  size?: number;
  iconSize?: number;
  solid?: boolean;
}) => {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: Math.round(size / 3), backgroundColor: solid ? fg : bg },
      ]}
    >
      <Icon name={icon} size={iconSize || Math.round(size * 0.5)} color={solid ? colors.onPrimary : fg} />
    </View>
  );
};

/* ---------- Grouped list: a white card whose rows are split by hairlines ---------- */
export const ListCard = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const { colors } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {rows.map((row, index) => (
        <View key={index} style={index ? { borderTopWidth: 1, borderTopColor: colors.border } : null}>
          {row}
        </View>
      ))}
    </View>
  );
};

export const ListRow = ({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
}) => {
  const { colors } = useTheme();
  const content = (
    <>
      {left}
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color="muted" numberOfLines={2} style={styles.rowSub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-forward" size={16} color={colors.textFaint} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      {content}
    </Pressable>
  );
};

/* Label on the left, value on the right ("Budget  ₹4.2 L / mo"). */
export const FactRow = ({ icon, label, value, valueColor }: { icon?: IconName; label: string; value: string; valueColor?: string }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.fact}>
      {icon ? <Icon name={icon} size={16} color={colors.textFaint} /> : null}
      <Text variant="small" color="muted" style={[styles.flex, styles.factText]}>
        {label}
      </Text>
      <Text variant="smallStrong" color={valueColor || colors.text} style={[styles.factText, styles.factValue]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
};

/* ---------- Stat tile: icon, big number, label, hint ---------- */
export const StatTile = ({
  icon,
  value,
  label,
  hint,
  tone = "primary",
  hintTone,
  onPress,
  elevated,
}: {
  icon?: IconName;
  value: string | number;
  label: string;
  hint?: string;
  tone?: Tone;
  hintTone?: "danger" | "faint";
  onPress?: () => void;
  elevated?: boolean;
}) => {
  const { colors, scheme } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${value} ${label}`}
      style={({ pressed }) => [
        styles.stat,
        { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border },
        elevated && scheme === "light" && styles.statShadow,
      ]}
    >
      {icon ? (
        <View style={styles.statIcon}>
          <IconTile icon={icon} tone={tone} size={30} iconSize={16} />
        </View>
      ) : null}
      <Text variant="stat">{String(value)}</Text>
      <Text variant="smallStrong">{label}</Text>
      {hint ? (
        <Text variant="tiny" color={hintTone === "danger" ? colors.danger : colors.textFaint}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
};

/* Compact centred number + label ("18 Present"), used in 3-4 column strips. */
export const MiniStat = ({ value, label, tone, tinted }: { value: string | number; label: string; tone?: Tone; tinted?: boolean }) => {
  const { colors } = useTheme();
  const t = tone ? toneColors(colors, tone) : null;
  return (
    <View
      style={[
        styles.mini,
        tinted && t ? { backgroundColor: t.bg } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
      ]}
    >
      <Text variant="heading" color={t ? t.fg : colors.text} style={styles.miniValue}>
        {String(value)}
      </Text>
      <Text variant="tiny" color="muted" style={styles.miniLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

/* ---------- Progress bar ---------- */
export const ProgressBar = ({ value, color, height = 6 }: { value: number; color?: string; height?: number }) => {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.track, overflow: "hidden" }}>
      <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: height / 2, backgroundColor: color || colors.primary }} />
    </View>
  );
};

/*
 * ---------- Progress ring ----------
 * Drawn with two clipped half-rings (no SVG dependency, so no native
 * rebuild). Each half is a circle whose two coloured border sides form a
 * semicircle, rotated into place and clipped to one side.
 */
export const Ring = ({
  size,
  stroke,
  progress,
  color,
  children,
}: {
  size: number;
  stroke: number;
  progress: number;
  color?: string;
  children?: React.ReactNode;
}) => {
  const { colors } = useTheme();
  const tint = color || colors.primary;
  const p = Math.max(0, Math.min(1, progress || 0));
  const right = Math.min(p, 0.5) * 360;
  const left = Math.max(0, p - 0.5) * 360;
  const circle = { width: size, height: size, borderRadius: size / 2, borderWidth: stroke };
  return (
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, circle, { borderColor: colors.track }]} />
      {p > 0 ? (
        <View style={[styles.half, { left: size / 2, width: size / 2, height: size }]}>
          <View
            style={[
              circle,
              {
                marginLeft: -size / 2,
                borderColor: "transparent",
                borderLeftColor: tint,
                borderBottomColor: tint,
                transform: [{ rotate: `${45 + right}deg` }],
              },
            ]}
          />
        </View>
      ) : null}
      {p > 0.5 ? (
        <View style={[styles.half, { left: 0, width: size / 2, height: size }]}>
          <View
            style={[
              circle,
              {
                borderColor: "transparent",
                borderTopColor: tint,
                borderRightColor: tint,
                transform: [{ rotate: `${45 + left}deg` }],
              },
            ]}
          />
        </View>
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>{children}</View>
    </View>
  );
};

/* ---------- Toggle (display + tap) ---------- */
export const Toggle = ({ value, onChange, label }: { value: boolean; onChange?: (next: boolean) => void; label: string }) => {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      disabled={!onChange}
      onPress={() => onChange?.(!value)}
      style={[styles.toggle, { backgroundColor: value ? colors.primary : colors.track }]}
    >
      <View style={[styles.knob, { left: value ? 19 : 3 }]} />
    </Pressable>
  );
};

/* ---------- Checkbox square ---------- */
export const CheckSquare = ({ checked, size = 22 }: { checked: boolean; size?: number }) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        borderWidth: 2,
        borderColor: checked ? colors.primary : colors.textFaint,
        backgroundColor: checked ? colors.primary : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? <Icon name="checkmark" size={size - 8} color={colors.onPrimary} /> : null}
    </View>
  );
};

/* ---------- Sheet grabber ---------- */
export const Grabber = () => {
  const { colors } = useTheme();
  return <View style={[styles.grabber, { backgroundColor: colors.border }]} />;
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  segTrack: { flexDirection: "row", padding: 4, borderRadius: radius.md },
  segItem: { flex: 1, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 0 },
  segActive: {},
  segShadow: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segLabel: { fontSize: 13 },
  tile: { alignItems: "center", justifyContent: "center" },
  listCard: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  rowTitle: { fontSize: 13.5 },
  rowSub: { fontSize: 11.5, lineHeight: 15 },
  fact: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  factText: { fontSize: 12.5 },
  factValue: { textAlign: "right", maxWidth: "60%" },
  stat: { flex: 1, borderWidth: 1, borderRadius: radius.lg, padding: 12, gap: 1 },
  statShadow: { shadowColor: "#0e1630", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  statIcon: { marginBottom: 8 },
  mini: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 4, alignItems: "center", gap: 1 },
  miniValue: { fontSize: 17 },
  miniLabel: { fontSize: 10.5 },
  half: { position: "absolute", top: 0, overflow: "hidden" },
  ringCenter: { alignItems: "center", justifyContent: "center" },
  toggle: { width: 40, height: 24, borderRadius: 12 },
  knob: {
    position: "absolute",
    top: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: "center" },
});
