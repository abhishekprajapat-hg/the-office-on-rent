import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { formatDate, formatDayShort, formatWhen } from "../lib/format";
import { useTheme } from "../theme/ThemeProvider";
import { radius, space } from "../theme/tokens";
import { Button, Icon, Text, type IconName } from "../ui";

type Props = {
  label: string;
  value: Date | null;
  onChange: (next: Date | null) => void;
  mode?: "datetime" | "date" | "time";
  minimumDate?: Date;
  clearable?: boolean;
  /* "row": the design's grey settings-style row (icon · label · value · chevron). */
  variant?: "field" | "row" | "tile";
  icon?: IconName;
};

/*
 * A tappable field that opens the platform picker. Android has no combined
 * date-time dialog, so it asks for the date and then the time. The web
 * preview (used for design checks) falls back to the browser's own input.
 */
export const DateTimeField = ({ label, value, onChange, mode = "datetime", minimumDate, clearable, variant = "field", icon = "calendar-outline" }: Props) => {
  const { colors, scheme, reduceMotion } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value || new Date());

  const open = () => {
    const start = value || defaultStart();
    if (Platform.OS === "android") {
      if (mode === "time") {
        DateTimePickerAndroid.open({
          value: start,
          mode: "time",
          onChange: (event: DateTimePickerEvent, picked?: Date) => {
            if (event.type === "set" && picked) onChange(picked);
          },
        });
        return;
      }
      DateTimePickerAndroid.open({
        value: start,
        mode: "date",
        minimumDate,
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type !== "set" || !picked) return;
          if (mode === "date") return onChange(picked);
          DateTimePickerAndroid.open({
            value: picked,
            mode: "time",
            onChange: (timeEvent: DateTimePickerEvent, time?: Date) => {
              if (timeEvent.type !== "set" || !time) return;
              const merged = new Date(picked);
              merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
              onChange(merged);
            },
          });
        },
      });
      return;
    }
    setDraft(start);
    setIosOpen(true);
  };

  const iosModal = (
        <Modal transparent visible={iosOpen} animationType={reduceMotion ? "none" : "fade"} onRequestClose={() => setIosOpen(false)}>
          <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setIosOpen(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]}>
              <DateTimePicker
                value={draft}
                mode={mode}
                display={mode === "time" ? "spinner" : "inline"}
                minimumDate={minimumDate}
                accentColor={colors.primary}
                themeVariant={scheme}
                onChange={(_event, picked) => picked && setDraft(picked)}
              />
              <Button
                label="Done"
                onPress={() => {
                  onChange(draft);
                  setIosOpen(false);
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
  );

  const display = value ? (mode === "date" ? formatDate(value) : mode === "time" ? formatTime(value) : formatWhen(value)) : "Not set";

  const webInput = (overlay: boolean) =>
    React.createElement("input", {
      type: mode === "date" ? "date" : mode === "time" ? "time" : "datetime-local",
      value: value ? toLocalInput(value, mode) : "",
      "aria-label": label,
      onChange: (event: { target: { value: string } }) => {
        const raw = event.target.value;
        if (!raw) return onChange(null);
        if (mode === "time") {
          const [h, m] = raw.split(":").map(Number);
          const next = new Date(value || Date.now());
          next.setHours(h || 0, m || 0, 0, 0);
          return onChange(next);
        }
        onChange(new Date(raw));
      },
      style: overlay
        ? { position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }
        : { flex: 1, border: "none", outline: "none", background: "transparent", color: colors.text, fontSize: 15, fontFamily: "PlusJakartaSans_500Medium", colorScheme: scheme },
    });

  /* "tile": grey box, tiny uppercase label over the bold value (leave FROM / TO). */
  if (variant === "tile") {
    const tileValue = value ? (mode === "date" ? formatDayShort(value) : mode === "time" ? formatTime(value) : formatShort(value)) : "Pick";
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${tileValue}`}
          onPress={Platform.OS === "web" ? undefined : open}
          style={[styles.tile, { backgroundColor: colors.bg }]}
        >
          <Text variant="tiny" color="faint" style={styles.tileLabel}>
            {label.toUpperCase()}
          </Text>
          <Text variant="smallStrong" color={value ? colors.text : colors.textFaint} style={styles.tileValue}>
            {tileValue}
          </Text>
          {Platform.OS === "web" ? webInput(true) : null}
        </Pressable>
        {Platform.OS === "ios" ? iosModal : null}
      </View>
    );
  }

  if (variant === "row") {
    const rowValue = value ? (mode === "date" ? formatDate(value) : mode === "time" ? formatTime(value) : formatShort(value)) : "Not set";
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${rowValue}`}
          onPress={Platform.OS === "web" ? undefined : open}
          style={[styles.row, { backgroundColor: colors.bg }]}
        >
          <Icon name={icon} size={18} color={colors.primary} />
          <Text variant="body" color="muted" style={[styles.flex, styles.rowLabel]}>
            {label}
          </Text>
          <Text variant="bodyStrong" color={value ? colors.text : colors.textFaint} style={styles.rowValue}>
            {rowValue}
          </Text>
          <Icon name="chevron-forward" size={15} color={colors.textFaint} />
          {Platform.OS === "web" ? webInput(true) : null}
        </Pressable>
        {Platform.OS === "ios" ? iosModal : null}
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={styles.wrap}>
        <Text variant="smallStrong" color="muted">
          {label}
        </Text>
        <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          <Icon name={icon} size={18} color={colors.textFaint} />
          {webInput(false)}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text variant="smallStrong" color="muted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        onPress={open}
        style={[styles.box, { borderColor: colors.border, backgroundColor: colors.bg }]}
      >
        <Icon name="calendar-outline" size={18} color={value ? colors.primary : colors.textFaint} />
        <Text variant="body" color={value ? "text" : "faint"} style={styles.flex}>
          {display}
        </Text>
        {clearable && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={10} onPress={() => onChange(null)}>
            <Icon name="close-circle" size={18} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </Pressable>

      {Platform.OS === "ios" ? iosModal : null}
    </View>
  );
};

const defaultStart = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(11, 0, 0, 0);
  return date;
};

/* "Tue 13 Oct, 10 AM" - compact, as in the design's rows. */
const formatShort = (date: Date) => {
  const day = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  const h = date.getHours() % 12 || 12;
  const m = date.getMinutes();
  return `${day}, ${h}${m ? `:${String(m).padStart(2, "0")}` : ""} ${date.getHours() < 12 ? "AM" : "PM"}`;
};

const formatTime = (date: Date) => `${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")} ${date.getHours() < 12 ? "AM" : "PM"}`;

const pad = (value: number) => String(value).padStart(2, "0");
const toLocalInput = (date: Date, mode: "date" | "datetime" | "time") => {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return mode === "date" ? day : mode === "time" ? time : `${day}T${time}`;
};

const styles = StyleSheet.create({
  tile: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 1 },
  tileLabel: { fontSize: 10.5 },
  tileValue: { fontSize: 13 },
  wrap: { gap: 6 },
  flex: { flex: 1 },
  box: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, position: "relative" },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 13 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.lg, paddingBottom: space.xxl, gap: space.md },
});
