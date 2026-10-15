import React, { useEffect, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage, mediaUrl } from "../../api/client";
import { createProperty, getProperty, requestPropertyUpdate, updateProperty, type DealType, type NewProperty, type Property } from "../../api/inventory";
import { useAuth } from "../../auth/AuthProvider";
import { inventoryAccess } from "../../lib/inventoryAccess";
import { pickDocument, pickImage, uploadFile, type LocalFile } from "../../api/uploads";
import { currentPosition } from "../../lib/location";
import { formatPrice, formatRupees, parseAmount } from "../../lib/money";
import { FURNISHING } from "../../lib/property";
import {
  DEAL_TYPES,
  DOCUMENT_CHECKS,
  MODELS_BY_OWNERSHIP,
  OWNER_TYPES,
  OWNERSHIP,
  PAYMENT_STATUSES,
  badLink,
  enterpriseProfit,
  parseLinks,
  pincodeError,
  validateProperty,
  type DocumentChecks,
} from "../../lib/propertyForm";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Button, CheckSquare, ErrorState, Field, FooterBar, Icon, InlineError, Loading, Segmented, Select, StatusPage, Text, Toggle } from "../../ui";

const COMMERCIAL_CATEGORIES = ["Office", "Shop", "Showroom", "Coworking", "Warehouse", "Land"];
const RESIDENTIAL_CATEGORIES = ["Apartment", "Builder Floor", "Villa", "House", "Plot", "PG"];
const STEPS = ["Basics", "Size & pricing", "Photos & files", "Owner & papers"];
const NO_DOCS: DocumentChecks = { registry: false, searchReport: false, electricityNoc: false, maintenanceNoc: false, taxReceipt: false, loanNoc: false };
const fileNameOf = (url: string) => decodeURIComponent(url.split("?")[0]!.split("/").pop() || "Document").replace(/^\d{10,}-/, "");
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
  area: p.area || "",
  pincode: p.pincode || "",
  builtUp: groupedNumber(p.builtUpArea),
  deposit: text(p.deposit),
  agreementYears: text(p.agreementYears),
  ownerType: p.ownerType || "",
  ownershipType: p.ownershipType || "",
  businessModel: p.businessModel || "",
  leaseRent: text(p.enterpriseDetails?.leaseRent),
  clientRent: text(p.enterpriseDetails?.clientRent),
  clientName: p.enterpriseDetails?.clientName || "",
  rentDueDay: text(p.enterpriseDetails?.rentDueDay),
  paymentStatus: p.enterpriseDetails?.paymentStatus || "",
  dealType: p.dealType || "",
  videoLinks: (p.videoTours || []).join("\n"),
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
    area: "",
    pincode: "",
    builtUp: "",
    deposit: "",
    agreementYears: "",
    ownerType: "",
    ownershipType: "",
    businessModel: "",
    leaseRent: "",
    clientRent: "",
    clientName: "",
    rentDueDay: "",
    paymentStatus: "",
    dealType: "",
    videoLinks: "",
  });
  const [docs, setDocs] = useState<DocumentChecks>(NO_DOCS);
  const [gst, setGst] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [plans, setPlans] = useState<string[]>([]);
  const [newPlans, setNewPlans] = useState<LocalFile[]>([]);
  const [papers, setPapers] = useState<string[]>([]);
  const [newPapers, setNewPapers] = useState<LocalFile[]>([]);
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
      setPlans(property.floorPlans || []);
      setPapers(property.documents || []);
      setDocs({ ...NO_DOCS, ...(property.documentsAvailable || {}) });
      setGst(Boolean(property.gstApplicable));
      setPin(property.siteLocation?.lat != null && property.siteLocation?.lng != null ? { lat: property.siteLocation.lat, lng: property.siteLocation.lng } : null);
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
  const videoTours = parseLinks(form.videoLinks);
  const errors: Record<string, string> = { ...validateProperty({ ...form, type: deal, price, rent }) };
  if (pincodeError(form.pincode)) errors.pincode = pincodeError(form.pincode)!;
  if (badLink(videoTours)) errors.videoLinks = `"${badLink(videoTours)}" isn't a link. Use one https:// address per line.`;
  if (form.rentDueDay && !(Number(form.rentDueDay) >= 1 && Number(form.rentDueDay) <= 31)) errors.rentDueDay = "A day from 1 to 31";
  const stepErrors = [["projectName", "towerName", "location", "pincode"], ["price", "rent"], ["videoLinks"], ["rentDueDay"]];
  const profit = enterpriseProfit(form.leaseRent, form.clientRent);
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

  /* Floor plans are pictures or PDFs; documents any paper the server accepts. */
  const addFile = async (kind: "plan" | "paper", source: "camera" | "library" | "file") => {
    setError(null);
    try {
      const file = source === "file" ? await pickDocument() : await pickImage(source);
      if (!file) return;
      if (kind === "plan") setNewPlans((prev) => [...prev, file]);
      else setNewPapers((prev) => [...prev, file]);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const pinHere = async () => {
    setLocating(true);
    setError(null);
    try {
      const here = await currentPosition();
      setPin({ lat: Number(here.latitude.toFixed(6)), lng: Number(here.longitude.toFixed(6)) });
    } catch {
      setError("Couldn't get your location. Turn on location services and allow it for the app, then try again.");
    } finally {
      setLocating(false);
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
      const floorPlans = [...plans];
      for (let index = 0; index < newPlans.length; index += 1) {
        setSaving(`Uploading floor plan ${index + 1} of ${newPlans.length}…`);
        floorPlans.push((await uploadFile(newPlans[index]!, "inventory-floorplans")).url);
      }
      const documents = [...papers];
      for (let index = 0; index < newPapers.length; index += 1) {
        setSaving(`Uploading document ${index + 1} of ${newPapers.length}…`);
        documents.push((await uploadFile(newPapers[index]!, "inventory-documents")).url);
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
        area: form.area.trim(),
        pincode: form.pincode.trim(),
        builtUpArea: num(form.builtUp),
        deposit: deal !== "Sale" ? parseAmount(form.deposit) : null,
        agreementYears: deal !== "Sale" ? num(form.agreementYears) : null,
        floorPlans,
        documents,
        videoTours,
        documentsAvailable: docs,
        gstApplicable: gst,
        ownerType: form.ownerType,
        ownershipType: form.ownershipType,
        businessModel: form.businessModel,
        enterpriseDetails:
          form.businessModel === "ENTERPRISE"
            ? {
                leaseRent: parseAmount(form.leaseRent),
                clientRent: parseAmount(form.clientRent),
                clientName: form.clientName.trim(),
                rentDueDay: num(form.rentDueDay),
                paymentStatus: form.paymentStatus,
                lastPaymentDate: original?.enterpriseDetails?.lastPaymentDate || null,
              }
            : null,
        dealType: form.dealType,
        ...(pin ? { siteLocation: pin } : {}),
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
        navigation.replace("Success", {
          title: "Property listed",
          message: "It's live in inventory now.",
          next: { label: "Open the property", screen: "PropertyDetail", params: { id: result.property._id } },
        });
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
      <View style={[styles.flex, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
        <StatusPage
          kind="success"
          title="Sent for approval"
          message={pendingEdit ? "Your changes apply once an admin approves them. You'll find the request under My requests." : "Your listing goes live once an admin approves it. You'll find it in inventory after that."}
          primary={{ label: "Done", icon: "checkmark", onPress: () => navigation.goBack() }}
          secondary={{ label: "See my requests", onPress: () => navigation.replace("MyRequests") }}
        />
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
            <Pair>
              <Select label="Property type" options={(commercial ? COMMERCIAL_CATEGORIES : RESIDENTIAL_CATEGORIES).map((item) => ({ key: item, label: item }))} value={category} onChange={setCategory} />
              <Select
                label="Available for"
                options={[
                  { key: "Rent", label: "Rent / lease" },
                  { key: "Sale", label: "Sale" },
                  { key: "Both", label: "Sale & rent" },
                ]}
                value={deal}
                onChange={(key) => setDeal(key as DealType)}
              />
            </Pair>
            <Field label="Project / building" value={form.projectName} onChangeText={set("projectName")} placeholder="e.g. DLF Cyber Park" error={show("projectName")} />
            <Field label="Tower / block / unit" value={form.towerName} onChangeText={set("towerName")} placeholder="e.g. Tower B, unit 702" error={show("towerName")} />
            {editId && original?.propertyId ? (
              <Text variant="small" color="muted">
                Property ID {original.propertyId} · set by the system, shown to clients in proposals
              </Text>
            ) : null}
            <Field label="Location" value={form.location} onChangeText={set("location")} placeholder="Street, sector or landmark" error={show("location")} />
            <Pair>
              <Field label="Locality" value={form.area} onChangeText={set("area")} placeholder="Sector 39" />
              <Field label="City" value={form.city} onChangeText={set("city")} placeholder="Gurugram" />
            </Pair>
            <Pair>
              <Field label="PIN code" value={form.pincode} onChangeText={(value) => set("pincode")(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="122001" error={show("pincode")} />
              <Field label="Floor" value={form.floorNumber} onChangeText={set("floorNumber")} keyboardType="numeric" placeholder="0 = ground" suffix={form.totalFloors ? `of ${form.totalFloors}` : undefined} />
            </Pair>
            <Field label="Floors in building" value={form.totalFloors} onChangeText={set("totalFloors")} keyboardType="numeric" placeholder="Optional" />
            <View style={[styles.pinRow, { borderColor: colors.border }]}>
              <Icon name="location" size={18} color={pin ? colors.success : colors.textFaint} />
              <View style={styles.flex}>
                <Text variant="smallStrong">{pin ? "Pinned on the map" : "Map pin"}</Text>
                <Text variant="tiny" color="muted">
                  {pin ? `${pin.lat}, ${pin.lng}` : "Stand at the property and pin it, for directions and field visits."}
                </Text>
              </View>
              {pin ? (
                <Pressable accessibilityRole="link" hitSlop={6} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`).catch(() => {})}>
                  <Text variant="smallStrong" color="primary">
                    View
                  </Text>
                </Pressable>
              ) : null}
              <Button label={pin ? "Re-pin" : "Pin here"} size="sm" variant="secondary" icon="navigate-outline" loading={locating} onPress={pinHere} />
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Select label="Condition" placeholder="Not set" allowClear clearLabel="Not set" options={Object.entries(FURNISHING).map(([key, label]) => ({ key, label }))} value={furnishing} onChange={setFurnishing} />
            <Pair>
              <Field label="Carpet area" value={form.carpetArea} onChangeText={setArea("carpetArea")} keyboardType="numeric" placeholder="3,200" suffix="sq ft" />
              <Field label="Super area" value={form.superArea} onChangeText={setArea("superArea")} keyboardType="numeric" placeholder="4,100" suffix="sq ft" />
            </Pair>
            <Field label="Built-up area" value={form.builtUp} onChangeText={setArea("builtUp")} keyboardType="numeric" placeholder="Optional" suffix="sq ft" />
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
            {deal !== "Sale" ? (
              <Pair>
                <Field label="Deposit amount" value={form.deposit} onChangeText={set("deposit")} placeholder="Optional" suffix="₹" hint={parseAmount(form.deposit) ? formatPrice(parseAmount(form.deposit)) : undefined} />
                <Field label="Agreement" value={form.agreementYears} onChangeText={set("agreementYears")} keyboardType="numeric" placeholder="9" suffix="years" />
              </Pair>
            ) : null}
            <Select label="Deal" placeholder="Not set" allowClear clearLabel="Not set" options={DEAL_TYPES} value={form.dealType} onChange={set("dealType")} />
            <View style={styles.toggleRow}>
              <Text variant="bodyStrong" style={styles.flex}>
                GST applicable
              </Text>
              <Toggle value={gst} label="GST applicable" onChange={setGst} />
            </View>
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
              {existing.length + photos.length ? `${existing.length + photos.length} of ${MAX_PHOTOS} · the first photo is the cover` : "Add up to 12 photos."}
            </Text>
            <FileList
              title="Floor plans"
              files={[...plans.map((url) => ({ key: `url:${url}`, name: fileNameOf(url), saved: true })), ...newPlans.map((file, index) => ({ key: `new:${index}`, name: file.name, saved: false }))]}
              onRemove={(key) => (key.startsWith("new:") ? setNewPlans((prev) => prev.filter((_, at) => `new:${at}` !== key)) : setPlans((prev) => prev.filter((url) => `url:${url}` !== key)))}
              actions={[
                { label: "Photo", icon: "camera-outline", onPress: () => addFile("plan", "camera") },
                { label: "Gallery", icon: "image-outline", onPress: () => addFile("plan", "library") },
                { label: "PDF", icon: "document-outline", onPress: () => addFile("plan", "file") },
              ]}
            />
            <FileList
              title="Documents"
              files={[...papers.map((url) => ({ key: `url:${url}`, name: fileNameOf(url), saved: true })), ...newPapers.map((file, index) => ({ key: `new:${index}`, name: file.name, saved: false }))]}
              onRemove={(key) => (key.startsWith("new:") ? setNewPapers((prev) => prev.filter((_, at) => `new:${at}` !== key)) : setPapers((prev) => prev.filter((url) => `url:${url}` !== key)))}
              actions={[
                { label: "Scan", icon: "camera-outline", onPress: () => addFile("paper", "camera") },
                { label: "File", icon: "document-attach-outline", onPress: () => addFile("paper", "file") },
              ]}
            />
            <Field label="Video tours" value={form.videoLinks} onChangeText={set("videoLinks")} placeholder="https://… one link per line" multiline autoCapitalize="none" autoCorrect={false} error={show("videoLinks")} />
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
            <Select label="Ownership" placeholder="Not set" allowClear clearLabel="Not set" options={OWNER_TYPES} value={form.ownerType} onChange={set("ownerType")} />
            <Group label="Papers in hand">
              {DOCUMENT_CHECKS.map((item) => (
                <Pressable key={item.key} accessibilityRole="checkbox" accessibilityState={{ checked: docs[item.key] }} onPress={() => setDocs((prev) => ({ ...prev, [item.key]: !prev[item.key] }))} style={styles.check}>
                  <CheckSquare checked={docs[item.key]} />
                  <Text variant="small">{item.label}</Text>
                </Pressable>
              ))}
            </Group>
            <Pair>
              <Select
                label="Revenue"
                placeholder="Not set"
                allowClear
                clearLabel="Not set"
                options={OWNERSHIP.map((item) => ({ key: item.key, label: item.label, hint: item.income }))}
                value={form.ownershipType}
                onChange={(ownershipType) =>
                  setForm((prev) => {
                    const keep = (MODELS_BY_OWNERSHIP[ownershipType] || []).some((model) => model.key === prev.businessModel);
                    return { ...prev, ownershipType, businessModel: keep ? prev.businessModel : "" };
                  })
                }
              />
              <Select
                label="Business model"
                placeholder={form.ownershipType ? "Not set" : "Pick revenue first"}
                allowClear
                clearLabel="Not set"
                disabled={!form.ownershipType}
                options={MODELS_BY_OWNERSHIP[form.ownershipType] || []}
                value={form.businessModel}
                onChange={set("businessModel")}
              />
            </Pair>
            {form.ownershipType ? (
              <Text variant="tiny" color="muted">
                Counts as {OWNERSHIP.find((item) => item.key === form.ownershipType)?.income.toLowerCase()} in Finance.
              </Text>
            ) : null}
            {form.businessModel === "ENTERPRISE" ? (
              <>
                <Pair>
                  <Field label="Lease rent" value={form.leaseRent} onChangeText={set("leaseRent")} keyboardType="numeric" placeholder="What you pay" suffix="₹/mo" />
                  <Field label="Client rent" value={form.clientRent} onChangeText={set("clientRent")} keyboardType="numeric" placeholder="What they pay" suffix="₹/mo" />
                </Pair>
                <Text variant="small" color={profit !== null && profit < 0 ? colors.danger : colors.textMuted}>
                  Monthly profit: {profit === null ? "enter both rents" : formatRupees(profit)}
                </Text>
                <Field label="Client" value={form.clientName} onChangeText={set("clientName")} placeholder="Who sublets it" autoCapitalize="words" />
                <Pair>
                  <Field label="Rent due day" value={form.rentDueDay} onChangeText={(value) => set("rentDueDay")(value.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" placeholder="5" error={show("rentDueDay")} />
                  <Select label="Payment" placeholder="Not set" allowClear clearLabel="Not set" options={PAYMENT_STATUSES} value={form.paymentStatus} onChange={set("paymentStatus")} />
                </Pair>
              </>
            ) : null}
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

const FileList = ({
  title,
  files,
  onRemove,
  actions,
}: {
  title: string;
  files: { key: string; name: string; saved: boolean }[];
  onRemove: (key: string) => void;
  actions: { label: string; icon: "camera-outline" | "image-outline" | "document-outline" | "document-attach-outline"; onPress: () => void }[];
}) => {
  const { colors } = useTheme();
  return (
    <View style={styles.gapSm}>
      <Text variant="smallStrong" color="muted">
        {title}
      </Text>
      {files.map((file) => (
        <View key={file.key} style={[styles.fileRow, { borderColor: colors.border }]}>
          <Icon name={file.saved ? "document-text" : "cloud-upload-outline"} size={16} color={file.saved ? colors.primary : colors.textMuted} />
          <Text variant="small" numberOfLines={1} style={styles.flex}>
            {file.name}
          </Text>
          {!file.saved ? (
            <Text variant="tiny" color="faint">
              uploads on save
            </Text>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`} hitSlop={6} onPress={() => onRemove(file.key)}>
            <Icon name="close" size={16} color={colors.textFaint} />
          </Pressable>
        </View>
      ))}
      <View style={styles.row}>
        {actions.map((action) => (
          <Button key={action.label} label={action.label} icon={action.icon} size="sm" variant="secondary" onPress={action.onPress} />
        ))}
      </View>
    </View>
  );
};

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
  pinRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 10 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  check: { flexDirection: "row", alignItems: "center", gap: 8, width: "48%", paddingVertical: 4 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
});
