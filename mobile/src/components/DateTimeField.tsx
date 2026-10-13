import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { formatDate, formatWhen } from "../lib/format";
import { useTheme } from "../theme/ThemeProvider";
import { radius, space } from "../theme/tokens";
import { Button, Icon, Text } from "../ui";

type Props = {
  label: string;
  value: Date | null;
  onChange: (next: Date | null) => void;
  mode?: "datetime" | "date";
  minimumDate?: Date;
  clearable?: boolean;
};

/*
 * A tappable field that opens the platform picker. Android has no combined
 * date-time dialog, so it asks for the date and then the time. The web
 * preview (used for design checks) falls back to the browser's own input.
 */
export const DateTimeField = ({ label, value, onChange, mode = "datetime", minimumDate, clearable }: Props) => {
  const { colors, scheme } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value || new Date());

  const open = () => {
    const start = value || defaultStart();
    if (Platform.OS === "android") {
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

  const display = value ? (mode === "date" ? formatDate(value) : formatWhen(value)) : "Not set";

  if (Platform.OS === "web") {
    return (
      <View style={styles.wrap}>
        <Text variant="smallStrong" color="muted">
          {label}
        </Text>
        <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Icon name="calendar-outline" size={18} color={colors.textFaint} />
          {React.createElement("input", {
            type: mode === "date" ? "date" : "datetime-local",
            value: value ? toLocalInput(value, mode) : "",
            onChange: (event: { target: { value: string } }) => onChange(event.target.value ? new Date(event.target.value) : null),
            style: { flex: 1, border: "none", outline: "none", background: "transparent", color: colors.text, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular", colorScheme: scheme },
          })}
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
        style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]}
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

      {Platform.OS === "ios" ? (
        <Modal transparent visible={iosOpen} animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setIosOpen(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]}>
              <DateTimePicker
                value={draft}
                mode={mode}
                display="inline"
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
      ) : null}
    </View>
  );
};

const defaultStart = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(11, 0, 0, 0);
  return date;
};

const pad = (value: number) => String(value).padStart(2, "0");
const toLocalInput = (date: Date, mode: "date" | "datetime") => {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return mode === "date" ? day : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  flex: { flex: 1 },
  box: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", gap: space.sm },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, paddingBottom: space.xxl, gap: space.md },
});
