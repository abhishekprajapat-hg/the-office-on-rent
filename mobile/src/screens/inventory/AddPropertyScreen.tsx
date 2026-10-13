import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { createProperty, type DealType } from "../../api/inventory";
import { formatPrice, parseAmount } from "../../lib/money";
import { FURNISHING } from "../../lib/property";
import { validateProperty } from "../../lib/propertyForm";
import type { RootScreenProps } from "../../navigation/types";
import { space } from "../../theme/tokens";
import { Body, Button, Card, Chip, Field, InlineError, Text } from "../../ui";

const COMMERCIAL_CATEGORIES = ["Office", "Shop", "Showroom", "Coworking", "Warehouse", "Land"];
const RESIDENTIAL_CATEGORIES = ["Apartment", "Builder Floor", "Villa", "House", "Plot", "PG"];

/*
 * The essentials. The web form runs to dozens of fields (layouts, amenities,
 * documents, floor plans); on a phone the job is to capture a listing on site
 * before it's forgotten, and finish the long tail on the web.
 */
export const AddPropertyScreen = ({ navigation }: RootScreenProps<"AddProperty">) => {
  const [inventoryType, setInventoryType] = useState<"COMMERCIAL" | "RESIDENTIAL">("COMMERCIAL");
  const [deal, setDeal] = useState<DealType>("Rent");
  const [category, setCategory] = useState("Office");
  const [furnishing, setFurnishing] = useState("");
  const [form, setForm] = useState({
    projectName: "",
    towerName: "",
    location: "",
    city: "",
    price: "",
    rent: "",
    deposit: "",
    totalArea: "",
    floorNumber: "",
    ownerName: "",
    ownerNumber: "",
  });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const price = parseAmount(form.price);
  const rent = parseAmount(form.rent);
  const deposit = parseAmount(form.deposit);
  const errors = validateProperty({ ...form, type: deal, price, rent });
  const show = (key: string) => (touched ? errors[key] : undefined);
  const amountHint = (raw: string, value: number | null) =>
    raw.trim() ? (value ? formatPrice(value) : "Use a number, e.g. 65 lakh or 45000") : "You can type 65 lakh, 1.2 cr or 45k";

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError(null);
    const toNumber = (value: string) => (value.trim() && Number.isFinite(Number(value)) ? Number(value) : null);
    try {
      const result = await createProperty({
        inventoryType,
        type: deal,
        category,
        furnishingStatus: furnishing || undefined,
        projectName: form.projectName.trim(),
        towerName: form.towerName.trim(),
        location: form.location.trim(),
        city: form.city.trim() || undefined,
        price: deal !== "Rent" ? price : null,
        rent: deal !== "Sale" ? rent : null,
        deposit: deal !== "Sale" ? deposit : null,
        totalArea: toNumber(form.totalArea),
        floorNumber: toNumber(form.floorNumber),
        ownerName: form.ownerName.trim() || undefined,
        ownerNumber: form.ownerNumber.replace(/[^\d+]/g, "") || undefined,
      });
      if (result.pendingApproval) {
        setPending(true);
        setSaving(false);
      } else if (result.property?._id) {
        navigation.replace("PropertyDetail", { id: result.property._id });
      } else {
        navigation.goBack();
      }
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  if (pending) {
    return (
      <Body>
        <Card style={styles.gap}>
          <Text variant="heading">Sent for approval</Text>
          <Text variant="body" color="muted">
            Your listing goes live once an admin approves it. You'll find it in inventory after that.
          </Text>
          <Button label="Done" onPress={() => navigation.goBack()} />
        </Card>
      </Body>
    );
  }

  return (
    <Body>
      <Card style={styles.gap}>
        <Text variant="heading">What is it?</Text>
        <View style={styles.chips}>
          <Chip
            label="Commercial"
            selected={inventoryType === "COMMERCIAL"}
            onPress={() => {
              setInventoryType("COMMERCIAL");
              setCategory(COMMERCIAL_CATEGORIES[0]!);
            }}
          />
          <Chip
            label="Residential"
            selected={inventoryType === "RESIDENTIAL"}
            onPress={() => {
              setInventoryType("RESIDENTIAL");
              setCategory(RESIDENTIAL_CATEGORIES[0]!);
            }}
          />
        </View>
        <View style={styles.chips}>
          {(inventoryType === "COMMERCIAL" ? COMMERCIAL_CATEGORIES : RESIDENTIAL_CATEGORIES).map((item) => (
            <Chip key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
          ))}
        </View>
        <Text variant="smallStrong" color="muted">
          Available for
        </Text>
        <View style={styles.chips}>
          {(["Rent", "Sale", "Both"] as DealType[]).map((item) => (
            <Chip key={item} label={item === "Both" ? "Sale & rent" : item === "Rent" ? "Rent / lease" : "Sale"} selected={deal === item} onPress={() => setDeal(item)} />
          ))}
        </View>
      </Card>

      <Card style={styles.gap}>
        <Field label="Project / building *" value={form.projectName} onChangeText={set("projectName")} placeholder="e.g. DLF Cyber Park" error={show("projectName")} />
        <Field label="Tower / block / unit *" value={form.towerName} onChangeText={set("towerName")} placeholder="e.g. Tower B, 7th floor" error={show("towerName")} />
        <Field label="Location *" value={form.location} onChangeText={set("location")} placeholder="Street, sector or landmark" error={show("location")} />
        <Field label="City" value={form.city} onChangeText={set("city")} placeholder="e.g. Gurugram" />
      </Card>

      <Card style={styles.gap}>
        {deal !== "Rent" ? (
          <Field label="Sale price *" value={form.price} onChangeText={set("price")} placeholder="₹" keyboardType="default" error={show("price")} hint={amountHint(form.price, price)} />
        ) : null}
        {deal !== "Sale" ? (
          <>
            <Field label="Monthly rent *" value={form.rent} onChangeText={set("rent")} placeholder="₹" error={show("rent")} hint={amountHint(form.rent, rent)} />
            <Field label="Deposit" value={form.deposit} onChangeText={set("deposit")} placeholder="₹" hint={form.deposit.trim() ? amountHint(form.deposit, deposit) : undefined} />
          </>
        ) : null}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field label="Area (sq ft)" value={form.totalArea} onChangeText={set("totalArea")} keyboardType="numeric" placeholder="1200" />
          </View>
          <View style={styles.flex}>
            <Field label="Floor" value={form.floorNumber} onChangeText={set("floorNumber")} keyboardType="numeric" placeholder="0 = ground" />
          </View>
        </View>
        <Text variant="smallStrong" color="muted">
          Furnishing
        </Text>
        <View style={styles.chips}>
          {Object.entries(FURNISHING).map(([key, label]) => (
            <Chip key={key} label={label} selected={furnishing === key} onPress={() => setFurnishing((current) => (current === key ? "" : key))} />
          ))}
        </View>
      </Card>

      <Card style={styles.gap}>
        <Text variant="heading">Owner</Text>
        <Field label="Name" value={form.ownerName} onChangeText={set("ownerName")} placeholder="Optional" autoCapitalize="words" />
        <Field label="Phone" value={form.ownerNumber} onChangeText={set("ownerNumber")} placeholder="Optional" keyboardType="phone-pad" />
      </Card>

      <InlineError message={error} />
      <Button label="Add property" icon="add-circle" onPress={save} loading={saving} />
      <Text variant="tiny" color="faint" align="center">
        Photos, layouts and documents can be added from the web app.
      </Text>
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", gap: space.md },
});
