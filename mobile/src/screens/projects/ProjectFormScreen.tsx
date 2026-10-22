import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { errorMessage, mediaUrl } from "../../api/client";
import { pickImage, uploadFile, type LocalFile } from "../../api/uploads";
import { UNIT_SPECS, newUnit, unitDraftFrom, unitPayload, unitSummary, unitsError, type UnitDraft, type UnitGroup } from "../../lib/projectUnits";
import { UnitSheet } from "./UnitSheet";
import { createProject, getProject, humanize, updateProject, type Project, type ProjectPayload } from "../../api/projects";
import { formatPrice, parseAmount } from "../../lib/money";
import {
  BHK_TYPES,
  COMMERCIAL_AMENITIES,
  HOUSING_CATEGORIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  RESIDENTIAL_AMENITIES,
  validateProjectDraft,
  type ProjectDraft,
} from "../../lib/projectForm";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Button, ErrorState, Field, GroupLabel, Icon, InlineError, Loading, MultiSelect, Segmented, Select, Text } from "../../ui";

const str = (value?: number | string | null) => (value === null || value === undefined ? "" : String(value));
// A project saved with the older single plot size opens as a range of one.
const plotRangeOf = (p: { plotSize?: string; customPlotSize?: number | string | null; plotSizeMin?: number | null; plotSizeMax?: number | null }) => {
  if (p.plotSizeMin != null || p.plotSizeMax != null) {
    return { plotSizeMin: p.plotSizeMin != null ? String(p.plotSizeMin) : "", plotSizeMax: p.plotSizeMax != null ? String(p.plotSizeMax) : "" };
  }
  const single = Number.parseFloat(String(p.plotSize === "CUSTOM" ? p.customPlotSize ?? "" : p.plotSize ?? "").replace(/,/g, ""));
  return Number.isFinite(single) ? { plotSizeMin: String(single), plotSizeMax: String(single) } : { plotSizeMin: "", plotSizeMax: "" };
};
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
  plotSizeMin: "",
  plotSizeMax: "",
  numberOfFlats: "",
  numberOfFloors: "",
  flatsPerFloor: "",
  totalFloors: "",
  officesPerFloor: "",
  totalOffices: "",
  totalShops: "",
  totalShowrooms: "",
  plc: "",
  plcWideRoad: "",
  plcGardenFacing: "",
  plcCorner: "",
  plcGardenCorner: "",
  otherCharges: "",
  developmentCharges: "",
  maintenanceCharges: "",
  amenityCharges: "",
  utilityCharges: "",
  parkingCharges: "",
  taxes: "",
  registrationStampDuty: "",
  otherFacilities: "",
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
  ...plotRangeOf(p),
  numberOfFlats: str(p.numberOfFlats),
  numberOfFloors: str(p.numberOfFloors),
  flatsPerFloor: str(p.flatsPerFloor),
  totalFloors: str(p.totalFloors),
  officesPerFloor: str(p.officesPerFloor),
  totalOffices: str(p.totalOffices),
  totalShops: str(p.totalShops),
  totalShowrooms: str(p.totalShowrooms),
  plc: str(p.plc),
  plcWideRoad: str(p.plcWideRoad),
  plcGardenFacing: str(p.plcGardenFacing),
  plcCorner: str(p.plcCorner),
  plcGardenCorner: str(p.plcGardenCorner),
  otherCharges: str(p.otherCharges),
  developmentCharges: str(p.developmentCharges),
  maintenanceCharges: str(p.maintenanceCharges),
  amenityCharges: str(p.amenityCharges),
  utilityCharges: str(p.utilityCharges),
  parkingCharges: str(p.parkingCharges),
  taxes: str(p.taxes),
  registrationStampDuty: str(p.registrationStampDuty),
  otherFacilities: str(p.otherFacilities),
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

/* Web: Projects create / edit form, with a commercial project's unit lists and the project photos. */
const UNIT_GROUPS: UnitGroup[] = ["offices", "shops", "showrooms"];
const NO_UNITS: Record<UnitGroup, UnitDraft[]> = { offices: [], shops: [], showrooms: [] };
export const ProjectFormScreen = ({ route, navigation }: RootScreenProps<"ProjectForm">) => {
  const editId = route.params?.id;
  const { colors } = useTheme();
  const [form, setForm] = useState<Form>(EMPTY);
  const [bhk, setBhk] = useState<{ bhk: string; size: string }[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [units, setUnits] = useState<Record<UnitGroup, UnitDraft[]>>(NO_UNITS);
  const [editing, setEditing] = useState<{ group: UnitGroup; index: number; unit: UnitDraft } | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<LocalFile[]>([]);
  const [uploading, setUploading] = useState("");
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
      setUnits({
        offices: (project.offices || []).map((unit) => unitDraftFrom("offices", unit as Record<string, unknown>)),
        shops: (project.shops || []).map((unit) => unitDraftFrom("shops", unit as Record<string, unknown>)),
        showrooms: (project.showrooms || []).map((unit) => unitDraftFrom("showrooms", unit as Record<string, unknown>)),
      });
      setImages(project.images || []);
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
    const invalid = validateProjectDraft(draft) || (!residential ? unitsError(units) : null);
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
      plcWideRoad: form.plcWideRoad.trim(),
      plcGardenFacing: form.plcGardenFacing.trim(),
      plcCorner: form.plcCorner.trim(),
      plcGardenCorner: form.plcGardenCorner.trim(),
      otherCharges: form.otherCharges.trim(),
      developmentCharges: form.developmentCharges.trim(),
      maintenanceCharges: form.maintenanceCharges.trim(),
      amenityCharges: form.amenityCharges.trim(),
      utilityCharges: form.utilityCharges.trim(),
      parkingCharges: form.parkingCharges.trim(),
      taxes: form.taxes.trim(),
      registrationStampDuty: form.registrationStampDuty.trim(),
      otherFacilities: form.otherFacilities.trim(),
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
        ? {
            totalPlots: intOrNull(form.totalPlots),
            plotsAvailable: intOrNull(form.plotsAvailable),
            plotSizeMin: intOrNull(form.plotSizeMin),
            plotSizeMax: intOrNull(form.plotSizeMax),
            // The range replaces the older single plot size.
            plotSize: "",
            customPlotSize: "",
          }
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
            // Listed units decide the totals once there are any (web keeps them in step).
            totalOffices: units.offices.length || (intOrNull(form.totalOffices) ?? 0),
            totalShops: units.shops.length || (intOrNull(form.totalShops) ?? 0),
            totalShowrooms: units.showrooms.length || (intOrNull(form.totalShowrooms) ?? 0),
            offices: units.offices.map((unit) => unitPayload("offices", unit)),
            shops: units.shops.map((unit) => unitPayload("shops", unit)),
            showrooms: units.showrooms.map((unit) => unitPayload("showrooms", unit)),
          }
        : {}),
    };
    setSaving(true);
    setError(null);
    try {
      const uploaded = [...images];
      for (let index = 0; index < newImages.length; index += 1) {
        setUploading(`Uploading photo ${index + 1} of ${newImages.length}…`);
        uploaded.push((await uploadFile(newImages[index]!, "inventory-images")).url);
      }
      setUploading("");
      payload.images = uploaded;
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
        <Select label="Project type" options={PROJECT_TYPES.map((item) => ({ key: item.key, label: item.label }))} value={form.projectType} onChange={set("projectType")} />
      ) : null}
      <Field label="Project name" value={form.projectName} onChangeText={set("projectName")} maxLength={200} />
      <Field label="Total land area" value={form.totalLandArea} onChangeText={set("totalLandArea")} placeholder="e.g. 12 acres" maxLength={60} />
      {residential ? (
        <Pair>
          <Select label="Status" options={PROJECT_STATUSES.map((key) => ({ key, label: humanize(key) }))} value={form.status} onChange={set("status")} />
          <Select label="Housing category" placeholder="Optional" allowClear clearLabel="Not set" options={HOUSING_CATEGORIES.map((key) => ({ key, label: key }))} value={form.housingCategory} onChange={set("housingCategory")} />
        </Pair>
      ) : (
        <Select label="Status" options={PROJECT_STATUSES.map((key) => ({ key, label: humanize(key) }))} value={form.status} onChange={set("status")} />
      )}

      <GroupLabel>Pricing</GroupLabel>
      <Pair>
        <Field label="Starting rate" value={form.startingRate} onChangeText={set("startingRate")} suffix="₹" hint={startingRate ? formatPrice(startingRate) : undefined} />
        <Field label="Current rate" value={form.currentRate} onChangeText={set("currentRate")} suffix="₹" hint={currentRate ? formatPrice(currentRate) : undefined} />
      </Pair>
      <Field label="PLC (optional)" value={form.plc} onChangeText={set("plc")} maxLength={60} />
      <Field label="Wide Road PLC (optional)" value={form.plcWideRoad} onChangeText={set("plcWideRoad")} maxLength={60} placeholder="e.g. 5% or ₹50,000" />
      <Field label="Garden Facing PLC (optional)" value={form.plcGardenFacing} onChangeText={set("plcGardenFacing")} maxLength={60} placeholder="e.g. 5% or ₹50,000" />
      <Field label="Corner Plot PLC (optional)" value={form.plcCorner} onChangeText={set("plcCorner")} maxLength={60} placeholder="e.g. 5% or ₹50,000" />
      <Field label="Garden Facing + Corner PLC (optional)" value={form.plcGardenCorner} onChangeText={set("plcGardenCorner")} maxLength={60} placeholder="e.g. 5% or ₹50,000" />
      <Field label="Development charges (optional)" value={form.developmentCharges} onChangeText={set("developmentCharges")} maxLength={120} />
      <Field label="Maintenance charges (optional)" value={form.maintenanceCharges} onChangeText={set("maintenanceCharges")} maxLength={120} />
      <Field label="Amenity charges (optional)" value={form.amenityCharges} onChangeText={set("amenityCharges")} maxLength={120} />
      <Field label="Utilities (water / electricity connection) (optional)" value={form.utilityCharges} onChangeText={set("utilityCharges")} maxLength={120} />
      <Field label="Parking charges (optional)" value={form.parkingCharges} onChangeText={set("parkingCharges")} maxLength={120} />
      <Field label="Taxes (GST etc.) (optional)" value={form.taxes} onChangeText={set("taxes")} maxLength={120} />
      <Field label="Registration / stamp duty (optional)" value={form.registrationStampDuty} onChangeText={set("registrationStampDuty")} maxLength={120} />
      <Field label="Other charges (optional)" value={form.otherCharges} onChangeText={set("otherCharges")} multiline maxLength={2000} />

      {plots ? (
        <>
          <GroupLabel>Plots</GroupLabel>
          <Pair>
            <Field label="Total plots" value={form.totalPlots} onChangeText={setNum("totalPlots")} keyboardType="number-pad" />
            <Field label="Available" value={form.plotsAvailable} onChangeText={setNum("plotsAvailable")} keyboardType="number-pad" />
          </Pair>
          <Pair>
            <Field label="Plot size from (sq ft)" value={form.plotSizeMin} onChangeText={setNum("plotSizeMin")} keyboardType="number-pad" />
            <Field label="to (sq ft)" value={form.plotSizeMax} onChangeText={setNum("plotSizeMax")} keyboardType="number-pad" />
          </Pair>
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
              <View style={styles.bhkSize}>
                <View style={styles.flex}>
                  <Select title="BHK" options={BHK_TYPES.map((key) => ({ key, label: bhkLabel(key) }))} value={row.bhk} onChange={(key) => setBhk((prev) => prev.map((item, at) => (at === index ? { ...item, bhk: key } : item)))} />
                </View>
                <View style={styles.flex}>
                  <Field value={row.size} onChangeText={(size) => setBhk((prev) => prev.map((item, at) => (at === index ? { ...item, size: size.replace(/[^0-9.]/g, "") } : item)))} keyboardType="decimal-pad" suffix="sq ft" accessibilityLabel={`${bhkLabel(row.bhk)} flat size`} />
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
          {UNIT_GROUPS.map((group) => (
            <View key={group} style={styles.group}>
              <View style={styles.unitHead}>
                <Text variant="smallStrong" color="muted" style={styles.flex}>
                  {UNIT_SPECS[group].label}s{units[group].length ? ` · ${units[group].length}` : ""}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setEditing({ group, index: units[group].length, unit: newUnit(group, units[group].length) })}
                >
                  <Text variant="smallStrong" color="primary">
                    + Add {UNIT_SPECS[group].label.toLowerCase()}
                  </Text>
                </Pressable>
              </View>
              {units[group].map((unit, index) => (
                <Pressable
                  key={unit._key}
                  accessibilityRole="button"
                  onPress={() => setEditing({ group, index, unit })}
                  style={({ pressed }) => [styles.unitRow, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}
                >
                  <Text variant="smallStrong">{unit[UNIT_SPECS[group].codeField] || `${UNIT_SPECS[group].label} ${index + 1}`}</Text>
                  <Text variant="tiny" color="muted" numberOfLines={1} style={styles.flex}>
                    {unitSummary(unit)}
                  </Text>
                  <Icon name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              ))}
            </View>
          ))}
        </>
      ) : null}

      <GroupLabel>Amenities</GroupLabel>
      <MultiSelect title="Amenities & infrastructure" placeholder="None picked" icon="sparkles-outline" options={amenityChoices.map((key) => ({ key, label: humanize(key) }))} value={amenities} onChange={setAmenities} />
      <Field label="Other facilities (optional)" value={form.otherFacilities} onChangeText={set("otherFacilities")} multiline maxLength={500} />

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

      <GroupLabel>Photos</GroupLabel>
      <View style={styles.photos}>
        {images.map((url) => (
          <View key={url} style={styles.photoCell}>
            <Image source={{ uri: mediaUrl(url) || url }} style={[styles.photo, { backgroundColor: colors.track }]} />
            <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setImages((prev) => prev.filter((item) => item !== url))} style={[styles.remove, { backgroundColor: colors.surface }]}>
              <Icon name="close" size={14} color={colors.text} />
            </Pressable>
          </View>
        ))}
        {newImages.map((file, index) => (
          <View key={`${file.uri}${index}`} style={styles.photoCell}>
            <Image source={{ uri: file.uri }} style={[styles.photo, { backgroundColor: colors.track }]} />
            <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setNewImages((prev) => prev.filter((_, at) => at !== index))} style={[styles.remove, { backgroundColor: colors.surface }]}>
              <Icon name="close" size={14} color={colors.text} />
            </Pressable>
          </View>
        ))}
      </View>
      <View style={styles.pair}>
        {(["camera", "library"] as const).map((source) => (
          <Button
            key={source}
            size="sm"
            variant="secondary"
            icon={source === "camera" ? "camera-outline" : "images-outline"}
            label={source === "camera" ? "Take photo" : "From gallery"}
            onPress={async () => {
              setError(null);
              try {
                const file = await pickImage(source);
                if (file) setNewImages((prev) => [...prev, file]);
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          />
        ))}
      </View>

      <InlineError message={error} />
      {uploading ? (
        <Text variant="small" color="muted" align="center">
          {uploading}
        </Text>
      ) : null}
      <Button icon="checkmark" label={editId ? "Save project" : "Create project"} loading={saving} onPress={save} />
      <UnitSheet
        group={editing?.group || "offices"}
        unit={editing?.unit || null}
        index={editing?.index || 0}
        onClose={() => setEditing(null)}
        onSave={(unit) => {
          if (!editing) return;
          setUnits((prev) => {
            const list = [...prev[editing.group]];
            if (editing.index < list.length) list[editing.index] = unit;
            else list.push(unit);
            return { ...prev, [editing.group]: list };
          });
          setEditing(null);
        }}
        onRemove={() => {
          if (!editing) return;
          setUnits((prev) => ({ ...prev, [editing.group]: prev[editing.group].filter((_, at) => at !== editing.index) }));
          setEditing(null);
        }}
      />
    </Body>
  );
};

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
  pair: { flexDirection: "row", gap: 10 },
  bhkRow: { gap: 8 },
  bhkSize: { flexDirection: "row", alignItems: "center", gap: 10 },
  unitHead: { flexDirection: "row", alignItems: "center" },
  unitRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoCell: { width: "31.5%", aspectRatio: 1, borderRadius: 14, overflow: "hidden" },
  photo: { width: "100%", height: "100%" },
  remove: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
