import React from "react";
import { StyleSheet, View } from "react-native";
import type { AttendanceDay } from "../api/types";
import { dayStatusMeta, isoDay } from "../lib/attendanceState";
import { useTheme } from "../theme/ThemeProvider";
import { toneColors } from "../theme/tokens";
import { Text } from "../ui";

/*
 * Month grid with a coloured dot per day (present / late / leave / absent /
 * off) - design 10 and 11. `month` is any date inside the month to draw.
 */
export const MonthCalendar = ({ days, month = new Date(), bare }: { days: AttendanceDay[]; month?: Date; bare?: boolean }) => {
  const { colors } = useTheme();
  const now = new Date();
  const year = month.getFullYear();
  const index = month.getMonth();
  const first = new Date(year, index, 1);
  const daysInMonth = new Date(year, index + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const thisMonth = year === now.getFullYear() && index === now.getMonth();
  const past = year < now.getFullYear() || (year === now.getFullYear() && index < now.getMonth());
  const byDate = new Map(days.map((day) => [day.attendanceDate, day]));
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const dotFor = (dayNumber: number) => {
    const day = byDate.get(isoDay(new Date(year, index, dayNumber)));
    if (!day) return "transparent";
    const tone = dayStatusMeta(day).tone;
    return tone === "neutral" ? colors.textFaint : tone === "info" ? colors.primary : toneColors(colors, tone).fg;
  };
  const legend: [string, string][] = [
    ["Present", colors.success],
    ["Late", colors.warning],
    ["Leave", colors.primary],
    ["Absent", colors.danger],
    ["Holiday", colors.textFaint],
  ];
  return (
    <View style={[styles.calendar, !bare && { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, padding: 14 }]}>
      <View style={styles.row}>
        {["M", "T", "W", "T", "F", "S", "S"].map((label, i) => (
          <Text key={i} variant="tiny" color="faint" align="center" style={[styles.cell, styles.weekday]}>
            {label}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.row}>
          {cells.slice(week * 7, week * 7 + 7).map((dayNumber, i) => {
            const isToday = thisMonth && dayNumber === now.getDate();
            const future = !past && (!thisMonth || (dayNumber !== null && dayNumber > now.getDate())) && !isToday;
            return (
              <View key={i} style={[styles.cell, styles.day, isToday && { backgroundColor: colors.primary }]}>
                {dayNumber ? (
                  <>
                    <Text variant="smallStrong" color={isToday ? colors.onPrimary : future ? colors.textFaint : colors.text}>
                      {dayNumber}
                    </Text>
                    <View style={[styles.dot, { backgroundColor: isToday ? colors.onPrimary : future ? "transparent" : dotFor(dayNumber) }]} />
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        {legend.map(([label, color]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text variant="tiny" color="muted" style={styles.legendText}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  calendar: { gap: 4, borderRadius: 20 },
  row: { flexDirection: "row", gap: 4 },
  cell: { flex: 1 },
  weekday: { fontSize: 10 },
  day: { height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontFamily: "PlusJakartaSans_600SemiBold" },
});
