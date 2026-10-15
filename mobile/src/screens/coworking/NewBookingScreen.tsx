import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { createBooking, getFloorView, listCwClients, listFloors, refId } from "../../api/coworking";
import { DateTimeField } from "../../components/DateTimeField";
import { isoDay } from "../../lib/attendanceState";
import { parseAmount, formatPrice } from "../../lib/money";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Button, Chip, Field, Icon, InlineError, Segmented, Text } from "../../ui";
import { PickerSheet } from "../../ui/PickerSheet";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (date: Date | null) => (date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "");

/* The web's "New booking" form: client, cabin (or one seat), dates, optional hours and price. */
export const NewBookingScreen = ({ route, navigation }: RootScreenProps<"NewBooking">) => {
  const { colors } = useTheme();
  const [floorId, setFloorId] = useState(route.params?.floorId || "");
  const [cabinId, setCabinId] = useState(route.params?.cabinId || "");
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<"CABIN" | "SEAT">("CABIN");
  const [seatCode, setSeatCode] = useState("");
  const [start, setStart] = useState<Date | null>(new Date());
  const [end, setEnd] = useState<Date | null>(new Date());
  const [hourly, setHourly] = useState(false);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<"" | "floor" | "cabin" | "client">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const floors = useQuery(() => listFloors(), []);
  const clients = useQuery(() => listCwClients(), []);
  const view = useQuery(() => (floorId ? getFloorView(floorId) : Promise.resolve(null)), [floorId]);
  useEffect(() => {
    if (!floorId && floors.data?.length) setFloorId(floors.data[0]!._id);
  }, [floors.data, floorId]);

  const floor = floors.data?.find((item) => item._id === floorId);
  const cabin = view.data?.cabins.find((item) => item._id === cabinId);
  const client = clients.data?.find((item) => item._id === clientId);
  const amount = parseAmount(price);

  const save = async () => {
    if (!clientId) return setError("Pick the client.");
    if (!floor || !cabinId) return setError("Pick a cabin.");
    if (type === "SEAT" && !seatCode.trim()) return setError("Enter the seat code, e.g. S3.");
    if (!start || !end) return setError("Pick the dates.");
    if (end < start) return setError("The end date can't be before the start.");
    setSaving(true);
    setError(null);
    try {
      const result = await createBooking({
        clientId,
        propertyId: refId(floor.propertyId as { _id: string } | string),
        floorId,
        cabinId,
        bookingType: type,
        seatCode: type === "SEAT" ? seatCode.trim() : undefined,
        startDate: isoDay(start),
        endDate: isoDay(end),
        startTime: hourly ? hhmm(from) : undefined,
        endTime: hourly ? hhmm(to) : undefined,
        price: amount || 0,
        notes: notes.trim() || undefined,
      });
      if (!result?.created?.length) throw new Error("The booking wasn't created.");
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const Picker = ({ label, value, placeholder, onPress, icon }: { label: string; value?: string; placeholder: string; onPress: () => void; icon: "business-outline" | "grid-outline" | "person-outline" }) => (
    <View style={styles.gapXs}>
      <Text variant="smallStrong" color="muted">
        {label}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.pick, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <Icon name={icon} size={18} color={colors.textFaint} />
        <Text variant="body" color={value ? "text" : colors.textFaint} style={styles.flex} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Icon name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  return (
    <Body>
      <Picker label="Client" icon="person-outline" value={client ? client.companyName : ""} placeholder="Choose a client" onPress={() => setPicker("client")} />
      <Picker label="Floor" icon="business-outline" value={floor ? [typeof floor.propertyId === "object" ? floor.propertyId?.name : "", floor.name].filter(Boolean).join(" · ") : ""} placeholder="Choose a floor" onPress={() => setPicker("floor")} />
      <Picker
        label="Cabin"
        icon="grid-outline"
        value={cabin ? `${cabin.cabinCode} · ${cabin.capacity || 1} seats · ${cabin.status === "VACANT" ? "free" : cabin.status.toLowerCase()}` : ""}
        placeholder="Choose a cabin"
        onPress={() => setPicker("cabin")}
      />
      <Segmented
        options={[
          { key: "CABIN", label: "Whole cabin" },
          { key: "SEAT", label: "One seat" },
        ]}
        value={type}
        onChange={setType}
      />
      {type === "SEAT" ? <Field label="Seat" value={seatCode} onChangeText={setSeatCode} placeholder="e.g. S3" autoCapitalize="characters" /> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <DateTimeField label="From" mode="date" variant="tile" value={start} onChange={setStart} />
        </View>
        <View style={styles.flex}>
          <DateTimeField label="To" mode="date" variant="tile" value={end} onChange={setEnd} />
        </View>
      </View>
      <View style={styles.chips}>
        <Chip label="All day" selected={!hourly} onPress={() => setHourly(false)} />
        <Chip label="Hourly (meeting room)" selected={hourly} onPress={() => setHourly(true)} />
      </View>
      {hourly ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateTimeField label="Starts" mode="time" variant="tile" icon="time-outline" value={from} onChange={setFrom} />
          </View>
          <View style={styles.flex}>
            <DateTimeField label="Ends" mode="time" variant="tile" icon="time-outline" value={to} onChange={setTo} />
          </View>
        </View>
      ) : null}
      <Field label="Price" value={price} onChangeText={setPrice} placeholder="Optional" suffix="₹" hint={amount ? formatPrice(amount) : undefined} />
      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline maxLength={1000} />
      <InlineError message={error || floors.error || clients.error} />
      <Button label="Create booking" icon="checkmark" loading={saving} onPress={save} />

      <PickerSheet
        visible={picker === "client"}
        title="Client"
        items={(clients.data || []).map((item) => ({ key: item._id, label: item.companyName, sub: [item.contactPerson, item.phone].filter(Boolean).join(" · ") }))}
        selected={clientId}
        onPick={(key) => {
          setClientId(key);
          setPicker("");
        }}
        onClose={() => setPicker("")}
        searchPlaceholder="Search clients"
      />
      <PickerSheet
        visible={picker === "floor"}
        title="Floor"
        items={(floors.data || []).map((item) => ({ key: item._id, label: item.name, sub: typeof item.propertyId === "object" ? item.propertyId?.name : undefined }))}
        selected={floorId}
        onPick={(key) => {
          setFloorId(key);
          setCabinId("");
          setPicker("");
        }}
        onClose={() => setPicker("")}
      />
      <PickerSheet
        visible={picker === "cabin"}
        title="Cabin"
        subtitle="Free cabins first"
        items={[...(view.data?.cabins || [])]
          .sort((a, b) => Number(b.status === "VACANT") - Number(a.status === "VACANT"))
          .map((item) => ({ key: item._id, label: item.cabinCode, sub: `${item.capacity || 1} seats · ${item.status === "VACANT" ? "Free" : item.status.toLowerCase()}` }))}
        selected={cabinId}
        onPick={(key) => {
          setCabinId(key);
          setPicker("");
        }}
        onClose={() => setPicker("")}
      />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gapXs: { gap: 6 },
  pick: { flexDirection: "row", alignItems: "center", gap: 10, height: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  row: { flexDirection: "row", gap: 10 },
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
});
