import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { createProject, getProject, humanize, updateProject, type Project, type ProjectPayload } from "../../api/projects";
import { formatPrice, parseAmount } from "../../lib/money";
import {
  BHK_TYPES,
  COMMERCIAL_AMENITIES,
  HOUSING_CATEGORIES,
  PLOT_SIZES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  RESIDENTIAL_AMENITIES,
  validateProjectDraft,
  type ProjectDraft,
} from "../../lib/projectForm";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Button, Chip, ErrorState, Field, GroupLabel, Icon, InlineError, Loading, Segmented, Text } from "../../ui";

const str = (value?: number | string | null) => (value === null || value === undefined ? "" : String(value));
const intOrNull = (value: string) => (value.trim() && Number.isFinite(Number(value)) ? Number(value) : null);
const digits = (value: string) => value.replace(/[^\d]/g, "");
const bhkLabel = (key: string) => key.replace(/_/g, " ").replace(" 5 ", ".5 ");

const EMPTY = {
  projectCategory: "RESIDENTIAL" as "RESIDENTIAL" | "COMMERCIAL",
  projectType: "",
  projectName: "",
  totalLandArea: "",
  status: "",
  startingRate: "",
  currentRate: "",
  housingCategory: "",
  totalPlots: "",
  plotsAvailable: "",
  plotSize: "",
  customPlotSize: "",
  numberOfFlats: "",
  numberOfFloors: "",
  flatsPerFloor: "",
  totalFloors: "",
  officesPerFloor: "",
  totalOffices: "",
  totalShops: "",
  totalShowrooms: "",
  plc: "",
  otherCharges: "",
  location: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  ownerManagerName: "",
  ownerManagerMobile: "",
  brokerManagerName: "",
  brokerManagerMobile: "",
};
type Form = typeof EMPTY;

const fromProject = (p: Project): Form => ({
  projectCategory: p.projectCategory === "COMMERCIAL" ? "COMMERCIAL" : "RESIDENTIAL",
  projectType: p.projectType || "",
  projectName: p.projectName || "",
  totalLandArea: str(p.totalLandArea),
  status: p.status || "",
  startingRate: str(p.startingRate),
  currentRate: str(p.currentRate),
  housingCategory: p.housingCategory || "",
  totalPlots: str(p.totalPlots),
  plotsAvailable: str(p.plotsAvailable),
  plotSize: p.plotSize || "",
  customPlotSize: str(p.customPlotSize),
  numberOfFlats: str(p.numberOfFlats),
  numberOfFloors: str(p.numberOfFloors),
  flatsPerFloor: str(p.flatsPerFloor),
  totalFloors: str(p.totalFloors),
  officesPerFloor: str(p.officesPerFloor),
  totalOffices: str(p.totalOffices),
  totalShops: str(p.totalShops),
  totalShowrooms: str(p.totalShowrooms),
  plc: str(p.plc),
  otherCharges: str(p.otherCharges),
  location: p.location || "",
  landmark: p.landmark || "",
  city: p.city || "",
  state: p.state || "",
  pincode: p.pincode || "",
  ownerManagerName: p.ownerManagerName || "",
  ownerManagerMobile: p.ownerManagerMobile || "",
  brokerManagerName: p.brokerManagerName || "",
  brokerManagerMobile: p.brokerManagerMobile || "",
});

/*
 * Web: Projects create / edit form. Everything about the project itself;
 * unit-by-unit lists (offices, shops, showrooms) and photos are kept as they
 * are on an edit and are managed on the web.
 */
export const ProjectFormScreen = ({ route, navigation }: RootScreenProps<"ProjectForm">) => {
  const editId = route.params?.id;
  const { colors } = useTheme();
  const [form, setForm] = useState<Form>(EMPTY);
  const [bhk, setBhk] = useState<{ bhk: string; size: string }[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(editId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!editId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const project = await getProject(editId);
      if (!project) throw new Error("This project no longer exists.");
      setForm(fromProject(project));
      setBhk((project.bhkConfigurations || []).map((row) => ({ bhk: row.bhk, size: str(row.size) })));
      setAmenities(project.amenities || []);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: editId ? "Edit project" : "New project" });
  }, [navigation, editId]);

  if (loading) return <Loading />;
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  const set = (key: keyof Form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const setNum = (key: keyof Form) => (value: string) => setForm((prev) => ({ ...prev, [key]: digits(value) }));
  const residential = form.projectCategory === "RESIDENTIAL";
  const building = residential && form.projectType === "BUILDING";
  const plots = residential && Boolean(form.projectType) && !building;
  const startingRate = parseAmount(form.startingRate);
  const currentRate = parseAmount(form.currentRate);
  const amenityChoices = residential ? RESIDENTIAL_AMENITIES : COMMERCIAL_AMENITIES;

  const save = async () => {
    const draft: ProjectDraft = { ...form, startingRate, currentRate, bhk };
    const invalid = validateProjectDraft(draft);
    if (invalid) return setError(invalid);
    const payload: ProjectPayload = {
      projectCategory: form.projectCategory,
      projectType: residential ? form.projectType : "",
      projectName: form.projectName.trim(),
      totalLandArea: form.totalLandArea.trim(),
      status: form.status,
      startingRate: startingRate!,
      currentRate: currentRate!,
      housingCategory: residential ? form.housingCategory : "",
      plc: form.plc.trim(),
      otherCharges: form.otherCharges.trim(),
      amenities: amenities.filter((key) => (amenityChoices as readonly string[]).includes(key)),
      location: form.location.trim(),
      landmark: form.landmark.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
      ownerManagerName: form.ownerManagerName.trim(),
      ownerManagerMobile: form.ownerManagerMobile.trim(),
      brokerManagerName: form.brokerManagerName.trim(),
      brokerManagerMobile: form.brokerManagerMobile.trim(),
      ...(plots
        ? { totalPlots: intOrNull(form.totalPlots), plotsAvailable: intOrNull(form.plotsAvailable), plotSize: form.plotSize, customPlotSize: form.plotSize === "CUSTOM" ? form.customPlotSize.trim() : "" }
        : {}),
      ...(building
        ? {
            numberOfFlats: intOrNull(form.numberOfFlats),
            numberOfFloors: intOrNull(form.numberOfFloors),
            flatsPerFloor: intOrNull(form.flatsPerFloor),
            bhkConfigurations: bhk.map((row) => ({ bhk: row.bhk, size: Number(row.size) })),
          }
        : {}),
      ...(!residential
        ? {
            totalFloors: intOrNull(form.totalFloors),
            officesPerFloor: intOrNull(form.officesPerFloor),
            totalOffices: intOrNull(form.totalOffices) ?? 0,
            totalShops: intOrNull(form.totalShops) ?? 0,
            totalShowrooms: intOrNull(form.totalShowrooms) ?? 0,
          }
        : {}),
    };
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        await updateProject(editId, payload);
        navigation.goBack();
      } else {
        const created = await createProject(payload);
        if (created?._id) navigation.replace("ProjectDetail", { id: created._id });
        else navigation.goBack();
      }
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Body>
      <Segmented
        options={[
          { key: "RESIDENTIAL", label: "Residential" },
          { key: "COMMERCIAL", label: "Commercial" },
        ]}
        value={form.projectCategory}
        onChange={(key) => setForm((prev) => ({ ...prev, projectCategory: key }))}
      />
      {residential ? (
        <Group label="Project type">
          {PROJECT_TYPES.map((item) => (
            <Chip key={item.key} label={item.label} selected={form.projectType === item.key} onPress={() => set("projectType")(item.key)} />
          ))}
        </Group>
      ) : null}
      <Field label="Project name" value={form.projectName} onChangeText={set("projectName")} maxLength={200} />
      <Field label="Total land area" value={form.totalLandArea} onChangeText={set("totalLandArea")} placeholder="e.g. 12 acres" maxLength={60} />
      <Group label="Status">
        {PROJECT_STATUSES.map((key) => (
          <Chip key={key} label={humanize(key)} selected={form.status === key} onPress={() => set("status")(key)} />
        ))}
      </Group>
      {residential ? (
        <Group label="Housing category (optional)">
          {HOUSING_CATEGORIES.map((key) => (
            <Chip key={key} label={key} selected={form.housingCategory === key} onPress={() => set("housingCategory")(form.housingCategory === key ? "" : key)} />
          ))}
        </Group>
      ) : null}

      <GroupLabel>Pricing</GroupLabel>
      <Pair>
        <Field label="Starting rate" value={form.startingRate} onChangeText={set("startingRate")} suffix="₹" hint={startingRate ? formatPrice(startingRate) : undefined} />
        <Field label="Current rate" value={form.currentRate} onChangeText={set("currentRate")} suffix="₹" hint={currentRate ? formatPrice(currentRate) : undefined} />
      </Pair>
      <Field label="PLC (optional)" value={form.plc} onChangeText={set("plc")} maxLength={60} />
      <Field label="Other charges (optional)" value={form.otherCharges} onChangeText={set("otherCharges")} multiline maxLength={2000} />

      {plots ? (
        <>
          <GroupLabel>Plots</GroupLabel>
          <Pair>
            <Field label="Total plots" value={form.totalPlots} onChangeText={setNum("totalPlots")} keyboardType="number-pad" />
            <Field label="Available" value={form.plotsAvailable} onChangeText={setNum("plotsAvailable")} keyboardType="number-pad" />
          </Pair>
          <Group label="Plot size (sq yd)">
            {PLOT_SIZES.map((key) => (
              <Chip key={key} label={key === "CUSTOM" ? "Custom" : key} selected={form.plotSize === key} onPress={() => set("plotSize")(form.plotSize === key ? "" : key)} />
            ))}
          </Group>
          {form.plotSize === "CUSTOM" ? <Field label="Custom plot size" value={form.customPlotSize} onChangeText={set("customPlotSize")} maxLength={60} /> : null}
        </>
      ) : null}

      {building ? (
        <>
          <GroupLabel>Building</GroupLabel>
          <Pair>
            <Field label="Flats" value={form.numberOfFlats} onChangeText={setNum("numberOfFlats")} keyboardType="number-pad" />
            <Field label="Floors" value={form.numberOfFloors} onChangeText={setNum("numberOfFloors")} keyboardType="number-pad" />
          </Pair>
          <Field label="Flats per floor" value={form.flatsPerFloor} onChangeText={setNum("flatsPerFloor")} keyboardType="number-pad" />
          <Text variant="smallStrong" color="muted">
            BHK configurations
          </Text>
          {bhk.map((row, index) => (
            <View key={index} style={styles.bhkRow}>
              <View style={styles.chips}>
                {BHK_TYPES.map((key) => (
                  <Chip key={key} label={bhkLabel(key)} selected={row.bhk === key} onPress={() => setBhk((prev) => prev.map((item, at) => (at === index ? { ...item, bhk: key } : item)))} />
                ))}
              </View>
              <View style={styles.bhkSize}>
                <View style={styles.flex}>
                  <Field compact value={row.size} onChangeText={(size) => setBhk((prev) => prev.map((item, at) => (at === index ? { ...item, size: size.replace(/[^0-9.]/g, "") } : item)))} keyboardType="decimal-pad" suffix="sq ft" accessibilityLabel={`${bhkLabel(row.bhk)} flat size`} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove configuration" hitSlop={8} onPress={() => setBhk((prev) => prev.filter((_, at) => at !== index))}>
                  <Icon name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
          <Button
            size="sm"
            variant="secondary"
            icon="add"
            label="Add a configuration"
            disabled={bhk.length >= BHK_TYPES.length}
            onPress={() => setBhk((prev) => [...prev, { bhk: BHK_TYPES.find((key) => !prev.some((row) => row.bhk === key)) || BHK_TYPES[0], size: "" }])}
          />
        </>
      ) : null}

      {!residential ? (
        <>
          <GroupLabel>Building</GroupLabel>
          <Pair>
            <Field label="Total floors" value={form.totalFloors} onChangeText={setNum("totalFloors")} keyboardType="number-pad" />
            <Field label="Offices per floor" value={form.officesPerFloor} onChangeText={setNum("officesPerFloor")} keyboardType="number-pad" />
          </Pair>
          <Pair>
            <Field label="Offices" value={form.totalOffices} onChangeText={setNum("totalOffices")} keyboardType="number-pad" />
            <Field label="Shops" value={form.totalShops} onChangeText={setNum("totalShops")} keyboardType="number-pad" />
          </Pair>
          <Field label="Showrooms" value={form.totalShowrooms} onChangeText={setNum("totalShowrooms")} keyboardType="number-pad" />
        </>
      ) : null}

      <GroupLabel>Amenities</GroupLabel>
      <View style={styles.chips}>
        {amenityChoices.map((key) => (
          <Chip key={key} label={humanize(key)} selected={amenities.includes(key)} onPress={() => setAmenities((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))} />
        ))}
      </View>

      <GroupLabel>Location</GroupLabel>
      <Field label="Address" value={form.location} onChangeText={set("location")} maxLength={500} />
      <Field label="Landmark" value={form.landmark} onChangeText={set("landmark")} />
      <Pair>
        <Field label="City" value={form.city} onChangeText={set("city")} />
        <Field label="State" value={form.state} onChangeText={set("state")} />
      </Pair>
      <Field label="Pincode" value={form.pincode} onChangeText={setNum("pincode")} keyboardType="number-pad" maxLength={6} />

      <GroupLabel>Contacts</GroupLabel>
      <Pair>
        <Field label="Owner manager" value={form.ownerManagerName} onChangeText={set("ownerManagerName")} />
        <Field label="Mobile" value={form.ownerManagerMobile} onChangeText={setNum("ownerManagerMobile")} keyboardType="phone-pad" maxLength={10} />
      </Pair>
      <Pair>
        <Field label="Broker manager" value={form.brokerManagerName} onChangeText={set("brokerManagerName")} />
        <Field label="Mobile" value={form.brokerManagerMobile} onChangeText={setNum("brokerManagerMobile")} keyboardType="phone-pad" maxLength={10} />
      </Pair>

      {editId ? (
        <Text variant="tiny" color="faint">
          Unit lists (offices, shops, showrooms) and photos stay as they are; change them on the web.
        </Text>
      ) : null}
      <InlineError message={error} />
      <Button icon="checkmark" label={editId ? "Save project" : "Create project"} loading={saving} onPress={save} />
    </Body>
  );
};

const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.group}>
    <Text variant="smallStrong" color="muted">
      {label}
    </Text>
    <View style={styles.chips}>{children}</View>
  </View>
);

const Pair = ({ children }: { children: React.ReactNode[] }) => (
  <View style={styles.pair}>
    {children.map((child, index) => (
      <View key={index} style={styles.flex}>
        {child}
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  group: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pair: { flexDirection: "row", gap: 10 },
  bhkRow: { gap: 8 },
  bhkSize: { flexDirection: "row", alignItems: "center", gap: 10 },
});
