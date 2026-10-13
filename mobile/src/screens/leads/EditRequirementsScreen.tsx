import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { getLeadDetail, updateLeadDetails, type LeadDetail, type LeadRequirements } from "../../api/leads";
import { formatPrice, parseAmount } from "../../lib/money";
import { FURNISHING } from "../../lib/property";
import type { RootScreenProps } from "../../navigation/types";
import { space } from "../../theme/tokens";
import { Body, Button, Card, Chip, ErrorState, Field, InlineError, Loading, Text } from "../../ui";

const TYPES = [
  { key: "COMMERCIAL", label: "Commercial" },
  { key: "RESIDENTIAL", label: "Residential" },
  { key: "COWORKING", label: "Coworking" },
] as const;
const DEALS = [
  { key: "SALE", label: "Buy" },
  { key: "RENT", label: "Rent" },
  { key: "LEASE", label: "Lease" },
] as const;
const SUBTYPES: Record<string, string[]> = {
  COMMERCIAL: ["Office", "Shop", "Showroom", "Warehouse", "Land"],
  RESIDENTIAL: ["Apartment", "Builder Floor", "Villa", "House", "Plot", "PG"],
  COWORKING: ["Dedicated desk", "Private cabin", "Hot desk"],
};
const BHK = ["1BHK", "2BHK", "3BHK", "4BHK", "5BHK", "STUDIO"];
const COMMERCIAL_FLAGS = ["parkingAvailable", "pantry", "receptionArea", "cafeteria", "serverRoom", "liftAvailable", "powerBackup", "centralAC", "fireSafety", "readyToMove"];
const RESIDENTIAL_FLAGS = ["lift", "security", "parking", "powerBackup", "gym", "swimmingPool", "clubhouse", "modularKitchen", "servantRoom", "studyRoom"];

const human = (key: string) => key.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()).replace("Central a c", "Central AC");
const toInput = (value?: number | null) => (value ? String(value) : "");
const toNumber = (value: string) => (value.trim() && Number.isFinite(Number(value)) ? Number(value) : null);

export const EditRequirementsScreen = ({ route, navigation }: RootScreenProps<"EditRequirements">) => {
  const { leadId } = route.params;
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [req, setReq] = useState<LeadRequirements>({});
  const [budget, setBudget] = useState({ min: "", max: "" });
  const [area, setArea] = useState({ min: "", max: "" });
  const [space_, setSpace] = useState({ seats: "", cabins: "", conferenceRooms: "", workstations: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLeadDetail(leadId)
      .then((value) => {
        if (!value) throw new Error("This lead no longer exists.");
        const current = value.requirements || {};
        setLead(value);
        setReq(current);
        setBudget({ min: toInput(current.budgetMin), max: toInput(current.budgetMax) });
        setArea({ min: toInput(current.areaMin), max: toInput(current.areaMax) });
        setSpace({
          seats: toInput(current.commercial?.seats as number),
          cabins: toInput(current.commercial?.cabins as number),
          conferenceRooms: toInput(current.commercial?.conferenceRooms as number),
          workstations: toInput(current.coworking?.workstations),
        });
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [leadId]);

  if (loadError) return <ErrorState message={loadError} onRetry={() => navigation.goBack()} />;
  if (!lead) return <Loading />;

  const budgetMin = parseAmount(budget.min);
  const budgetMax = parseAmount(budget.max);
  const patch = (next: Partial<LeadRequirements>) => setReq((prev) => ({ ...prev, ...next }));
  const toggle = (group: "commercial" | "residential", key: string) => {
    if (group === "commercial") patch({ commercial: { ...(req.commercial || {}), [key]: !req.commercial?.[key] } });
    else patch({ residential: { ...(req.residential || {}), amenities: { ...(req.residential?.amenities || {}), [key]: !req.residential?.amenities?.[key] } } });
  };

  const save = async () => {
    if ((budget.min.trim() && budgetMin === null) || (budget.max.trim() && budgetMax === null)) return setError("Budget should be a number, e.g. 60 lakh or 1.2 cr.");
    if (budgetMin && budgetMax && budgetMin > budgetMax) return setError("Minimum budget is higher than the maximum.");
    setSaving(true);
    setError(null);
    try {
      const requirements: LeadRequirements = {
        ...req,
        budgetMin,
        budgetMax,
        areaMin: toNumber(area.min),
        areaMax: toNumber(area.max),
        areaUnit: req.areaUnit || "SQ_FT",
        commercial: { ...(req.commercial || {}), seats: toNumber(space_.seats), cabins: toNumber(space_.cabins), conferenceRooms: toNumber(space_.conferenceRooms) },
        coworking: { ...(req.coworking || {}), workstations: toNumber(space_.workstations) },
      };
      await updateLeadDetails(leadId, lead.status, { requirements });
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const type = req.inventoryType || "";

  return (
    <Body>
      <Card style={styles.gap}>
        <Text variant="heading">Looking for</Text>
        <View style={styles.chips}>
          {TYPES.map((item) => (
            <Chip key={item.key} label={item.label} selected={type === item.key} onPress={() => patch({ inventoryType: item.key, propertySubtype: "" })} />
          ))}
        </View>
        <View style={styles.chips}>
          {DEALS.map((item) => (
            <Chip key={item.key} label={item.label} selected={req.transactionType === item.key} onPress={() => patch({ transactionType: item.key })} />
          ))}
        </View>
        {type ? (
          <View style={styles.chips}>
            {(SUBTYPES[type] || []).map((item) => (
              <Chip key={item} label={item} selected={req.propertySubtype === item} onPress={() => patch({ propertySubtype: req.propertySubtype === item ? "" : item })} />
            ))}
          </View>
        ) : null}
        {type === "RESIDENTIAL" ? (
          <View style={styles.chips}>
            {BHK.map((item) => (
              <Chip
                key={item}
                label={item === "STUDIO" ? "Studio" : item}
                selected={req.residential?.bhkType === item}
                onPress={() => patch({ residential: { ...(req.residential || {}), bhkType: req.residential?.bhkType === item ? "" : item } })}
              />
            ))}
          </View>
        ) : null}
      </Card>

      <Card style={styles.gap}>
        <Text variant="heading">Budget</Text>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field label="From" value={budget.min} onChangeText={(min) => setBudget((prev) => ({ ...prev, min }))} placeholder="e.g. 50 lakh" hint={budgetMin ? formatPrice(budgetMin) : undefined} />
          </View>
          <View style={styles.flex}>
            <Field label="Up to" value={budget.max} onChangeText={(max) => setBudget((prev) => ({ ...prev, max }))} placeholder="e.g. 1 cr" hint={budgetMax ? formatPrice(budgetMax) : undefined} />
          </View>
        </View>
        <Text variant="heading">Area (sq ft)</Text>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field label="From" value={area.min} onChangeText={(min) => setArea((prev) => ({ ...prev, min }))} keyboardType="numeric" />
          </View>
          <View style={styles.flex}>
            <Field label="Up to" value={area.max} onChangeText={(max) => setArea((prev) => ({ ...prev, max }))} keyboardType="numeric" />
          </View>
        </View>
        <Text variant="heading">Furnishing</Text>
        <View style={styles.chips}>
          {Object.entries(FURNISHING).map(([key, label]) => (
            <Chip key={key} label={label} selected={req.furnishingStatus === key} onPress={() => patch({ furnishingStatus: req.furnishingStatus === key ? "" : key })} />
          ))}
        </View>
      </Card>

      {type === "COMMERCIAL" || type === "COWORKING" ? (
        <Card style={styles.gap}>
          <Text variant="heading">Space</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label={type === "COWORKING" ? "Workstations" : "Seats"} value={type === "COWORKING" ? space_.workstations : space_.seats} onChangeText={(value) => setSpace((prev) => (type === "COWORKING" ? { ...prev, workstations: value } : { ...prev, seats: value }))} keyboardType="numeric" />
            </View>
            <View style={styles.flex}>
              <Field label="Cabins" value={space_.cabins} onChangeText={(cabins) => setSpace((prev) => ({ ...prev, cabins }))} keyboardType="numeric" />
            </View>
            <View style={styles.flex}>
              <Field label="Conference" value={space_.conferenceRooms} onChangeText={(conferenceRooms) => setSpace((prev) => ({ ...prev, conferenceRooms }))} keyboardType="numeric" />
            </View>
          </View>
          <View style={styles.chips}>
            {COMMERCIAL_FLAGS.map((key) => (
              <Chip key={key} label={human(key)} selected={Boolean(req.commercial?.[key])} onPress={() => toggle("commercial", key)} />
            ))}
          </View>
        </Card>
      ) : null}

      {type === "RESIDENTIAL" ? (
        <Card style={styles.gap}>
          <Text variant="heading">Must have</Text>
          <View style={styles.chips}>
            {RESIDENTIAL_FLAGS.map((key) => (
              <Chip key={key} label={human(key)} selected={Boolean(req.residential?.amenities?.[key])} onPress={() => toggle("residential", key)} />
            ))}
          </View>
        </Card>
      ) : null}

      <InlineError message={error} />
      <Button label="Save requirements" icon="checkmark" loading={saving} onPress={save} />
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  row: { flexDirection: "row", gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
