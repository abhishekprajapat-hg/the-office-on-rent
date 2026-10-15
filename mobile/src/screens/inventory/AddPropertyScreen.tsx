import React, { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage, mediaUrl } from "../../api/client";
import { createProperty, getProperty, requestPropertyUpdate, updateProperty, type DealType, type NewProperty, type Property } from "../../api/inventory";
import { useAuth } from "../../auth/AuthProvider";
import { inventoryAccess } from "../../lib/inventoryAccess";
import { pickImage, uploadFile, type LocalFile } from "../../api/uploads";
import { formatPrice, parseAmount } from "../../lib/money";
import { FURNISHING } from "../../lib/property";
import { validateProperty } from "../../lib/propertyForm";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Button, Chip, ErrorState, Field, FooterBar, Icon, InlineError, Loading, Segmented, Text } from "../../ui";

const COMMERCIAL_CATEGORIES = ["Office", "Shop", "Showroom", "Coworking", "Warehouse", "Land"];
const RESIDENTIAL_CATEGORIES = ["Apartment", "Builder Floor", "Villa", "House", "Plot", "PG"];
const STEPS = ["Basics", "Size & pricing", "Photos", "Owner"];
const MAX_PHOTOS = 12;

const num = (value: string) => {
  const clean = value.replace(/,/g, "").trim();
  return clean && Number.isFinite(Number(clean)) ? Number(clean) : null;
};
const grouped = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits).toLocaleString("en-IN") : "";
};

const text = (value?: number | null) => (value === null || value === undefined ? "" : String(value));
const groupedNumber = (value?: number | null) => (value ? Number(value).toLocaleString("en-IN") : "");

/* The form's fields from a saved property, for editing. */
const formFrom = (p: Property) => ({
  projectName: p.projectName || "",
  towerName: p.towerName || "",
  location: p.location || "",
  city: p.city || "",
  floorNumber: text(p.floorNumber),
  totalFloors: text(p.totalFloors),
  carpetArea: groupedNumber(p.carpetArea),
  superArea: groupedNumber(p.superBuiltUpArea ?? (p.carpetArea ? null : p.totalArea)),
  workstations: text(p.commercialDetails?.officeLayout?.workstations),
  cabins: text(p.commercialDetails?.officeLayout?.totalCabins),
  bedrooms: text(p.residentialDetails?.bedrooms),
  bathrooms: text(p.residentialDetails?.bathrooms),
  price: text(p.price),
  rent: text(p.rent),
  depositMonths: text(p.depositMonths),
  maintenance: text(p.maintenanceCharges),
  lockIn: text(p.lockInYears),
  ownerName: p.ownerName || "",
  ownerNumber: p.ownerNumber || "",
  ownerWhatsapp: p.ownerWhatsappNumber || "",
  keyName: p.keyManagerName || "",
  keyNumber: p.keyManagerNumber || "",
});

/*
 * Design 24: the web's add-property form as a four-step wizard (Basics → Size & pricing → Photos → Owner).
 * With an id it edits that property (web AssetVault edit): admins and managers save directly, executives send the change for approval.
 */
export const AddPropertyScreen = ({ navigation, route }: RootScreenProps<"AddProperty">) => {
  const editId = route.params?.id;
  const { user, access } = useAuth();
  const direct = inventoryAccess(user?.role, access).canManage;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [inventoryType, setInventoryType] = useState<"COMMERCIAL" | "RESIDENTIAL">("COMMERCIAL");
  const [deal, setDeal] = useState<DealType>("Rent");
  const [category, setCategory] = useState("Office");
  const [furnishing, setFurnishing] = useState("");
  const [form, setForm] = useState({
    projectName: "",
    towerName: "",
    location: "",
    city: "",
    floorNumber: "",
    totalFloors: "",
    carpetArea: "",
    superArea: "",
    workstations: "",
    cabins: "",
    bedrooms: "",
    bathrooms: "",
    price: "",
    rent: "",
    depositMonths: "",
    maintenance: "",
    lockIn: "",
    ownerName: "",
    ownerNumber: "",
    ownerWhatsapp: "",
    keyName: "",
    keyNumber: "",
  });
  const [photos, setPhotos] = useState<LocalFile[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [original, setOriginal] = useState<Property | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState(false);

  const loadEdit = async () => {
    if (!editId) return;
    setLoadingEdit(true);
    setLoadError(null);
    try {
      const property = await getProperty(editId);
      if (!property) throw new Error("This property no longer exists.");
      const type = property.inventoryType === "RESIDENTIAL" ? "RESIDENTIAL" : "COMMERCIAL";
      setInventoryType(type);
      setDeal((property.type as DealType) || "Rent");
      setCategory(property.category || (type === "COMMERCIAL" ? COMMERCIAL_CATEGORIES : RESIDENTIAL_CATEGORIES)[0]!);
      setFurnishing(property.furnishingStatus || "");
      setForm(formFrom(property));
      setExisting(property.images || []);
      setOriginal(property);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoadingEdit(false);
    }
  };
  useEffect(() => {
    loadEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);
  const [touched, setTouched] = useState<number[]>([]);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const setArea = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: grouped(value) }));
  const price = parseAmount(form.price);
  const rent = parseAmount(form.rent);
  const errors = validateProperty({ ...form, type: deal, price, rent });
  const stepErrors = [["projectName", "towerName", "location"], ["price", "rent"], [], []];
  const show = (key: string) => (touched.some((index) => stepErrors[index]!.includes(key)) ? errors[key] : undefined);
  const commercial = inventoryType === "COMMERCIAL";

  const addPhoto = async (source: "camera" | "library") => {
    setError(null);
    try {
      const file = await pickImage(source);
      if (file) setPhotos((prev) => [...prev, file].slice(0, MAX_PHOTOS - existing.length));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const next = () => {
    setTouched((prev) => [...new Set([...prev, step])]);
    if (stepErrors[step]!.some((key) => errors[key])) return;
    setError(null);
    if (step < STEPS.length - 1) setStep(step + 1);
    else save();
  };

  const save = async () => {
    setError(null);
    try {
      const images: string[] = [...existing];
      for (let index = 0; index < photos.length; index += 1) {
        setSaving(`Uploading photo ${index + 1} of ${photos.length}…`);
        images.push((await uploadFile(photos[index]!, "inventory-images")).url);
      }
      setSaving("Saving…");
      const carpet = num(form.carpetArea);
      const superArea = num(form.superArea);
      const payload: NewProperty = {
        inventoryType,
        type: deal,
        category,
        furnishingStatus: furnishing || undefined,
        projectName: form.projectName.trim(),
        towerName: form.towerName.trim(),
        location: form.location.trim(),
        city: form.city.trim() || undefined,
        floorNumber: num(form.floorNumber),
        totalFloors: num(form.totalFloors),
        carpetArea: carpet,
        superBuiltUpArea: superArea,
        totalArea: superArea || carpet,
        price: deal !== "Rent" ? price : null,
        rent: deal !== "Sale" ? rent : null,
        depositMonths: deal !== "Sale" ? num(form.depositMonths) : null,
        maintenanceCharges: parseAmount(form.maintenance),
        lockInYears: deal !== "Sale" ? num(form.lockIn) : null,
        // The server replaces these objects whole, so an edit keeps what this form doesn't show (amenities, office type…).
        ...(commercial
          ? {
              commercialDetails: {
                ...(original?.commercialDetails || {}),
                officeLayout: { ...(original?.commercialDetails?.officeLayout || {}), workstations: num(form.workstations), totalCabins: num(form.cabins) },
              },
            }
          : { residentialDetails: { ...(original?.residentialDetails || {}), bedrooms: num(form.bedrooms), bathrooms: num(form.bathrooms) } }),
        images,
        ownerName: form.ownerName.trim() || undefined,
        ownerNumber: form.ownerNumber.replace(/[^\d+]/g, "") || undefined,
        ownerWhatsappNumber: form.ownerWhatsapp.replace(/[^\d+]/g, "") || undefined,
        keyManagerName: form.keyName.trim() || undefined,
        keyManagerNumber: form.keyNumber.replace(/[^\d+]/g, "") || undefined,
      };
      if (editId) {
        if (direct) {
          await updateProperty(editId, payload);
          navigation.goBack();
          return;
        }
        await requestPropertyUpdate(editId, payload, "Edit requested from the mobile app");
        setPendingEdit(true);
        setSaving("");
        return;
      }
      const result = await createProperty(payload);
      if (result.pendingApproval) {
        setPending(true);
      } else if (result.property?._id) {
        navigation.replace("PropertyDetail", { id: result.property._id });
        return;
      } else {
        navigation.goBack();
        return;
      }
    } catch (err) {
      setError(errorMessage(err));
    }
    setSaving("");
  };

  if (loadingEdit) return <Loading />;
  if (loadError) return <ErrorState message={loadError} onRetry={loadEdit} />;

  if (pending || pendingEdit) {
    return (
      <View style={[styles.flex, styles.done, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
        <View style={[styles.doneIcon, { backgroundColor: colors.successSoft }]}>
          <Icon name="checkmark" size={30} color={colors.success} />
        </View>
        <Text variant="title" align="center">
          Sent for approval
        </Text>
        <Text variant="body" color="muted" align="center">
          {pendingEdit ? "Your changes apply once an admin approves them. You'll find the request under My requests." : "Your listing goes live once an admin approves it. You'll find it in inventory after that."}
        </Text>
        <Button label="Done" onPress={() => navigation.goBack()} style={styles.doneButton} />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => navigation.goBack()} style={styles.side}>
            <Icon name="close" size={24} color={colors.textMuted} />
          </Pressable>
          <Text variant="heading" style={styles.headTitle}>
            {editId ? "Edit property" : "Add property"}
          </Text>
          <Text variant="smallStrong" color="muted" style={[styles.side, styles.count]}>
            {step + 1}/{STEPS.length}
          </Text>
        </View>
        <View style={styles.progress}>
          {STEPS.map((label, index) => (
            <View key={label} style={[styles.segment, { backgroundColor: index <= step ? colors.primary : colors.track }]} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.gapXs}>
          <Text variant="title" style={styles.stepTitle}>
            {STEPS[step]}
          </Text>
          <Text variant="small" color="muted" style={styles.crumbs}>
            {STEPS.join(" → ")}
          </Text>
        </View>

        {step === 0 ? (
          <>
            <Segmented
              options={[
                { key: "COMMERCIAL", label: "Commercial" },
                { key: "RESIDENTIAL", label: "Residential" },
              ]}
              value={inventoryType}
              onChange={(key) => {
                setInventoryType(key);
                setCategory((key === "COMMERCIAL" ? COMMERCIAL_CATEGORIES : RESIDENTIAL_CATEGORIES)[0]!);
              }}
            />
            <Group label="Property type">
              {(commercial ? COMMERCIAL_CATEGORIES : RESIDENTIAL_CATEGORIES).map((item) => (
                <Chip key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
              ))}
            </Group>
            <Group label="Available for">
              {(["Rent", "Sale", "Both"] as DealType[]).map((item) => (
                <Chip key={item} label={item === "Both" ? "Sale & rent" : item === "Rent" ? "Rent / lease" : "Sale"} selected={deal === item} onPress={() => setDeal(item)} />
              ))}
            </Group>
            <Field label="Project / building" value={form.projectName} onChangeText={set("projectName")} placeholder="e.g. DLF Cyber Park" error={show("projectName")} />
            <Field label="Tower / block / unit" value={form.towerName} onChangeText={set("towerName")} placeholder="e.g. Tower B, unit 702" error={show("towerName")} />
            <Field label="Location" value={form.location} onChangeText={set("location")} placeholder="Street, sector or landmark" error={show("location")} />
            <Pair>
              <Field label="City" value={form.city} onChangeText={set("city")} placeholder="Gurugram" />
              <Field label="Floor" value={form.floorNumber} onChangeText={set("floorNumber")} keyboardType="numeric" placeholder="0 = ground" suffix={form.totalFloors ? `of ${form.totalFloors}` : undefined} />
            </Pair>
            <Field label="Floors in building" value={form.totalFloors} onChangeText={set("totalFloors")} keyboardType="numeric" placeholder="Optional" />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Group label="Condition">
              {Object.entries(FURNISHING).map(([key, label]) => (
                <Chip key={key} label={label} selected={furnishing === key} onPress={() => setFurnishing((current) => (current === key ? "" : key))} />
              ))}
            </Group>
            <Pair>
              <Field label="Carpet area" value={form.carpetArea} onChangeText={setArea("carpetArea")} keyboardType="numeric" placeholder="3,200" suffix="sq ft" />
              <Field label="Super area" value={form.superArea} onChangeText={setArea("superArea")} keyboardType="numeric" placeholder="4,100" suffix="sq ft" />
            </Pair>
            {commercial ? (
              <Pair>
                <Field label="Workstations" value={form.workstations} onChangeText={set("workstations")} keyboardType="numeric" placeholder="40" />
                <Field label="Cabins" value={form.cabins} onChangeText={set("cabins")} keyboardType="numeric" placeholder="4" />
              </Pair>
            ) : (
              <Pair>
                <Field label="Bedrooms" value={form.bedrooms} onChangeText={set("bedrooms")} keyboardType="numeric" placeholder="3" />
                <Field label="Bathrooms" value={form.bathrooms} onChangeText={set("bathrooms")} keyboardType="numeric" placeholder="2" />
              </Pair>
            )}
            {deal !== "Sale" ? (
              <Pair>
                <Field label="Rent" value={form.rent} onChangeText={set("rent")} placeholder="2.5 lakh" suffix="₹/mo" error={show("rent")} hint={rent ? formatPrice(rent) : undefined} />
                <Field label="Deposit" value={form.depositMonths} onChangeText={set("depositMonths")} keyboardType="numeric" placeholder="6" suffix="months" />
              </Pair>
            ) : null}
            {deal !== "Rent" ? <Field label="Sale price" value={form.price} onChangeText={set("price")} placeholder="e.g. 4.5 cr" suffix="₹" error={show("price")} hint={price ? formatPrice(price) : "You can type 65 lakh, 1.2 cr or 45k"} /> : null}
            <Pair>
              <Field label="Maintenance" value={form.maintenance} onChangeText={set("maintenance")} placeholder="Optional" suffix="₹/mo" />
              {deal !== "Sale" ? <Field label="Lock-in" value={form.lockIn} onChangeText={set("lockIn")} keyboardType="numeric" placeholder="3" suffix="years" /> : <View />}
            </Pair>
            {rent && num(form.carpetArea) ? (
              <View style={[styles.note, { backgroundColor: colors.bg }]}>
                <Text variant="small" color="muted">
                  Works out to ₹{Math.round(rent / num(form.carpetArea)!).toLocaleString("en-IN")} / sq ft on carpet
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <View style={styles.photos}>
              {existing.map((url, index) => (
                <View key={`${url}${index}`} style={styles.photoCell}>
                  <Image source={{ uri: mediaUrl(url) || url }} style={[styles.photo, { backgroundColor: colors.track }]} />
                  {index === 0 ? (
                    <View style={[styles.cover, { backgroundColor: colors.primary }]}>
                      <Text variant="tiny" color={colors.onPrimary}>
                        Cover
                      </Text>
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    onPress={() => setExisting((prev) => prev.filter((_, at) => at !== index))}
                    style={[styles.remove, { backgroundColor: colors.surface }]}
                  >
                    <Icon name="close" size={14} color={colors.text} />
                  </Pressable>
                </View>
              ))}
              {photos.map((photo, index) => (
                <View key={`${photo.uri}${index}`} style={styles.photoCell}>
                  <Image source={{ uri: photo.uri }} style={[styles.photo, { backgroundColor: colors.track }]} />
                  {index === 0 && !existing.length ? (
                    <View style={[styles.cover, { backgroundColor: colors.primary }]}>
                      <Text variant="tiny" color={colors.onPrimary}>
                        Cover
                      </Text>
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    onPress={() => setPhotos((prev) => prev.filter((_, at) => at !== index))}
                    style={[styles.remove, { backgroundColor: colors.surface }]}
                  >
                    <Icon name="close" size={14} color={colors.text} />
                  </Pressable>
                </View>
              ))}
              {existing.length + photos.length < MAX_PHOTOS ? (
                <>
                  <AddTile icon="camera" label="Take photo" onPress={() => addPhoto("camera")} />
                  <AddTile icon="images" label="From gallery" onPress={() => addPhoto("library")} />
                </>
              ) : null}
            </View>
            <Text variant="small" color="faint">
              {existing.length + photos.length ? `${existing.length + photos.length} of ${MAX_PHOTOS} · the first photo is the cover` : "Add up to 12 photos. Floor plans and documents can be added from the web app."}
            </Text>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Field label="Owner name" icon="person-outline" value={form.ownerName} onChangeText={set("ownerName")} placeholder="Optional" autoCapitalize="words" />
            <Field label="Owner phone" icon="call-outline" value={form.ownerNumber} onChangeText={set("ownerNumber")} placeholder="Optional" keyboardType="phone-pad" />
            <Field label="WhatsApp" icon="logo-whatsapp" value={form.ownerWhatsapp} onChangeText={set("ownerWhatsapp")} placeholder="Same as phone if empty" keyboardType="phone-pad" />
            <Text variant="smallStrong" color="muted" style={styles.keysLabel}>
              Keys with
            </Text>
            <Pair>
              <Field value={form.keyName} onChangeText={set("keyName")} placeholder="Name" autoCapitalize="words" />
              <Field value={form.keyNumber} onChangeText={set("keyNumber")} placeholder="Phone" keyboardType="phone-pad" />
            </Pair>
          </>
        ) : null}

        <InlineError message={error} />
        {saving ? (
          <Text variant="small" color="muted" align="center">
            {saving}
          </Text>
        ) : null}
      </ScrollView>

      <FooterBar>
        <Button label="Back" variant="secondary" style={styles.flex} disabled={!step || Boolean(saving)} onPress={() => setStep(step - 1)} />
        <Button label={step < STEPS.length - 1 ? `Next: ${STEPS[step + 1]}` : editId ? (direct ? "Save changes" : "Send for approval") : "Add property"} style={styles.wide} loading={Boolean(saving)} onPress={next} />
      </FooterBar>
    </View>
  );
};

const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.gapSm}>
    <Text variant="smallStrong" color="muted">
      {label}
    </Text>
    <View style={styles.chips}>{children}</View>
  </View>
);

const Pair = ({ children }: { children: React.ReactNode[] }) => (
  <View style={styles.row}>
    {children.map((child, index) => (
      <View key={index} style={styles.flex}>
        {child}
      </View>
    ))}
  </View>
);

const AddTile = ({ icon, label, onPress }: { icon: "camera" | "images"; label: string; onPress: () => void }) => {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.photoCell, styles.addTile, { borderColor: colors.border, backgroundColor: colors.bg }]}>
      <Icon name={icon} size={22} color={colors.primary} />
      <Text variant="tiny" color="muted">
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wide: { flex: 2 },
  header: { paddingHorizontal: 18, gap: 14, paddingBottom: 4 },
  headRow: { flexDirection: "row", alignItems: "center" },
  side: { width: 44 },
  count: { textAlign: "right" },
  headTitle: { flex: 1, textAlign: "center", fontSize: 17 },
  progress: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  body: { padding: 18, gap: 14, paddingBottom: 40 },
  gapXs: { gap: 2 },
  gapSm: { gap: 8 },
  stepTitle: { fontSize: 22 },
  crumbs: { fontSize: 12.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  row: { flexDirection: "row", gap: 10 },
  note: { borderRadius: 14, padding: 12 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoCell: { width: "31.5%", aspectRatio: 1, borderRadius: 14, overflow: "hidden" },
  photo: { width: "100%", height: "100%" },
  cover: { position: "absolute", left: 6, bottom: 6, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  remove: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  addTile: { borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 },
  keysLabel: { marginBottom: -6 },
  done: { alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  doneIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  doneButton: { alignSelf: "stretch", marginTop: 8 },
});
