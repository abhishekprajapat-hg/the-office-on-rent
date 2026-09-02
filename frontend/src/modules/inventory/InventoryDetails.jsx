import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Check,
  FileText,
  Hash,
  History,
  Image as ImageIcon,
  Link,
  Loader,
  MapPin,
  Share2,
  User,
  WalletCards,
} from "lucide-react";
import {
  getInventoryAssetActivity,
  getInventoryAssetById,
  createInventoryShareLink,
} from "../../services/inventoryService";
import { toErrorMessage } from "../../utils/errorMessage";
import ToastNotice from "../../components/ui/ToastNotice";
import { StatusBadge } from "../../components/crm";
import { Badge, Button, Card, CardContent } from "../../components/ui";
import InventoryOwnerCard from "./components/InventoryOwnerCard";
import InventorySpecTabs from "./components/InventorySpecTabs";

const formatPrice = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `Rs ${parsed.toLocaleString("en-IN")}`;
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const toCoordinateNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatUserRef = (value) => {
  if (!value) return "-";
  if (typeof value === "string") return value;
  const name = value.name || "";
  const role = value.role || "";
  if (name && role) return `${name} (${role})`;
  return name || role || "-";
};

const formatYesNo = (value) => (value ? "Yes" : "No");

const formatEnumLabel = (value) => {
  const clean = String(value || "").trim();
  if (!clean) return "-";

  return clean
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatArea = (value, unit) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  const unitLabel = String(unit || "").toUpperCase() === "SQ_M" ? "sq m" : "sq ft";
  return `${parsed.toLocaleString("en-IN")} ${unitLabel}`;
};

const formatSoldPaymentMode = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "-";
  if (normalized === "NET_BANKING_NEFTRTGSIMPS") return "Net Banking (NEFT/RTGS/IMPS)";
  if (normalized === "CHECK") return "Check / Cheque";
  return normalized;
};

const formatSoldPaymentType = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "FULL") return "Full Payment";
  if (normalized === "PARTIAL") return "Partial Payment";
  return normalized || "-";
};

const FieldRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2">
    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    <span className="text-sm font-semibold text-slate-800 text-right break-words min-w-0 max-w-[65%]">
      {value || "-"}
    </span>
  </div>
);

const InventoryDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const canViewActivity = [
    "ADMIN",
    "MANAGER",
  ].includes(role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [asset, setAsset] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [specTab, setSpecTab] = useState("specification");
  const isChannelPartner = role === "CHANNEL_PARTNER";

  const fetchDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const detail = await getInventoryAssetById(id);

      setAsset(detail?.asset || null);
      setInventory(detail?.inventory || null);

      if (canViewActivity) {
        try {
          const activityRows = await getInventoryAssetActivity(id, { limit: 100 });
          setActivities(Array.isArray(activityRows) ? activityRows : []);
        } catch {
          // Activity endpoint is intentionally restricted for some roles.
          setActivities([]);
        }
      } else {
        setActivities([]);
      }

      setActiveImageIndex(0);
    } catch (detailsError) {
      setError(toErrorMessage(detailsError, "Failed to load inventory details"));
    } finally {
      setLoading(false);
    }
  }, [canViewActivity, id]);

  useEffect(() => {
    if (!id) {
      setError("Invalid property id");
      setLoading(false);
      return;
    }
    fetchDetails();
  }, [fetchDetails, id]);

  const pageTitle = useMemo(() => {
    if (asset?.title) return asset.title;
    if (!inventory) return "Property Details";
    return [inventory.projectName, inventory.towerName, inventory.unitNumber]
      .filter(Boolean)
      .join(" - ");
  }, [asset?.title, inventory]);

  const statusValue = inventory?.status || asset?.status || "Unknown";
  const transactionType = asset?.type || inventory?.type || "Sale";
  const saleDetails = inventory?.saleDetails || asset?.saleDetails || null;
  const soldLeadLabel = (() => {
    const lead = saleDetails?.leadId;
    if (!lead) return "-";
    if (typeof lead === "string") return lead;

    const name = String(lead?.name || "").trim();
    const phone = String(lead?.phone || "").trim();
    const fallbackId = String(lead?._id || "").trim();
    return [name, phone].filter(Boolean).join(" | ") || fallbackId || "-";
  })();
  const inventoryType = String(inventory?.inventoryType || asset?.inventoryType || "").toUpperCase();
  const commercialDetails = inventory?.commercialDetails || asset?.commercialDetails || null;
  const commercialLayout = commercialDetails?.officeLayout || {};
  const commercialAmenities = commercialDetails?.amenities || {};
  const commercialBuilding = commercialDetails?.buildingDetails || {};
  const commercialAvailability = commercialDetails?.availability || {};
  const residentialDetails = inventory?.residentialDetails || asset?.residentialDetails || null;
  const residentialAmenities = residentialDetails?.amenities || {};
  const residentialUtilities = residentialDetails?.utilities || {};
  const isCommercial = inventoryType === "COMMERCIAL" || (!inventoryType && Boolean(commercialDetails));
  const images = useMemo(
    () => (Array.isArray(inventory?.images) && inventory.images.length ? inventory.images : asset?.images || []),
    [asset?.images, inventory?.images],
  );
  const documents = useMemo(
    () =>
      Array.isArray(inventory?.documents) && inventory.documents.length
        ? inventory.documents
        : asset?.documents || [],
    [asset?.documents, inventory?.documents],
  );
  const floorPlans = useMemo(
    () =>
      Array.isArray(inventory?.floorPlans) && inventory.floorPlans.length
        ? inventory.floorPlans
        : asset?.floorPlans || [],
    [asset?.floorPlans, inventory?.floorPlans],
  );
  const videoTours = useMemo(
    () =>
      Array.isArray(inventory?.videoTours) && inventory.videoTours.length
        ? inventory.videoTours
        : asset?.videoTours || [],
    [asset?.videoTours, inventory?.videoTours],
  );

  const safeImageIndex = Math.min(activeImageIndex, Math.max(images.length - 1, 0));
  const activeImage = images[safeImageIndex] || "";
  const inventorySiteLat = toCoordinateNumber(inventory?.siteLocation?.lat ?? asset?.siteLocation?.lat);
  const inventorySiteLng = toCoordinateNumber(inventory?.siteLocation?.lng ?? asset?.siteLocation?.lng);
  const inventoryCoordinates =
    inventorySiteLat !== null && inventorySiteLng !== null
      ? `${inventorySiteLat}, ${inventorySiteLng}`
      : "-";
  const sharePayload = useMemo(() => {
    const inventoryId = inventory?._id || asset?._id;
    if (!inventoryId) return null;

    const title =
      asset?.title
      || [inventory?.projectName, inventory?.towerName, inventory?.unitNumber]
        .filter(Boolean)
        .join(" - ")
      || "Inventory Unit";

    return {
      inventoryId,
      title,
      location: inventory?.location || asset?.location || "",
      siteLocation:
        inventorySiteLat !== null && inventorySiteLng !== null
          ? { lat: inventorySiteLat, lng: inventorySiteLng }
          : null,
      price: Number(inventory?.price ?? asset?.price) || 0,
      status: statusValue,
      image: images[0] || "",
    };
  }, [
    asset?._id,
    asset?.location,
    asset?.price,
    asset?.title,
    images,
    inventory?._id,
    inventory?.location,
    inventory?.price,
    inventory?.projectName,
    inventorySiteLat,
    inventorySiteLng,
    inventory?.towerName,
    inventory?.unitNumber,
    statusValue,
  ]);

  const handleShareToChat = () => {
    if (!sharePayload) return;
    navigate("/chat", {
      state: { shareProperty: sharePayload },
    });
  };

  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState("");

  const handleShareWithClient = async () => {
    const inventoryId = inventory?._id || asset?._id;
    if (!inventoryId) return;

    try {
      setShareLoading(true);
      setShareError("");
      setShareCopied(false);
      const { shareToken } = await createInventoryShareLink(inventoryId);
      if (!shareToken) {
        setShareError("Failed to generate share link");
        return;
      }

      const origin = window.location.origin;
      const shareUrl = `${origin}/shared/inventory/${shareToken}`;

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch (err) {
      setShareError(toErrorMessage(err, "Failed to create share link"));
    } finally {
      setShareLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="ui-page-shell custom-scrollbar flex items-center justify-center text-slate-400 gap-2">
        <Loader className="animate-spin" size={22} />
        Loading property details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="ui-page-shell custom-scrollbar">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <ToastNotice message={error} type="error" />
      </div>
    );
  }

  const source = inventory || asset || {};
  const priceValue = formatPrice(inventory?.price ?? asset?.price);
  const isRent = String(transactionType || "").trim().toUpperCase() === "RENT";
  const areaUnit = inventory?.areaUnit || asset?.areaUnit;

  const addressLine = [
    inventory?.unitNumber || asset?.unitNumber ? `Unit ${inventory?.unitNumber || asset?.unitNumber}` : "",
    (inventory?.floorNumber ?? asset?.floorNumber) !== undefined && (inventory?.floorNumber ?? asset?.floorNumber) !== null
      ? `${inventory?.floorNumber ?? asset?.floorNumber} floor`
      : "",
    [inventory?.area || asset?.area, inventory?.city || asset?.city, inventory?.pincode || asset?.pincode]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  const specBlocks = [
    {
      title: "Area",
      rows: [
        { label: "Total", value: formatArea(inventory?.totalArea ?? asset?.totalArea, areaUnit) },
        { label: "Carpet", value: formatArea(inventory?.carpetArea ?? asset?.carpetArea, areaUnit) },
        { label: "Built-up", value: formatArea(inventory?.builtUpArea ?? asset?.builtUpArea, areaUnit) },
        { label: "Super built-up", value: formatArea(inventory?.superBuiltUpArea ?? asset?.superBuiltUpArea, areaUnit) },
      ],
    },
    isCommercial && commercialDetails
      ? {
        title: "Commercial",
        rows: [
          { label: "Office type", value: formatEnumLabel(commercialDetails?.officeType) },
          { label: "Cabins", value: commercialLayout?.totalCabins },
          { label: "Workstations", value: commercialLayout?.workstations },
          { label: "Conference", value: commercialLayout?.conferenceRooms },
          { label: "Conference seats", value: commercialLayout?.conferenceSeats },
          { label: "Furnishing", value: formatEnumLabel(inventory?.furnishingStatus || asset?.furnishingStatus) },
        ],
      }
      : {
        title: "Residential",
        rows: [
          { label: "Property type", value: formatEnumLabel(residentialDetails?.propertyType) },
          { label: "BHK", value: formatEnumLabel(residentialDetails?.bhkType) },
          { label: "Bedrooms", value: residentialDetails?.bedrooms },
          { label: "Bathrooms", value: residentialDetails?.bathrooms },
          { label: "Balcony", value: residentialDetails?.balcony },
          { label: "Furnishing", value: formatEnumLabel(inventory?.furnishingStatus || asset?.furnishingStatus) },
        ],
      },
    {
      title: "Building",
      rows: [
        { label: "Building", value: inventory?.buildingName || asset?.buildingName },
        {
          label: "Floor",
          value:
            (inventory?.floorNumber ?? asset?.floorNumber) !== undefined &&
            (inventory?.floorNumber ?? asset?.floorNumber) !== null &&
            (inventory?.totalFloors ?? asset?.totalFloors)
              ? `${inventory?.floorNumber ?? asset?.floorNumber} of ${inventory?.totalFloors ?? asset?.totalFloors}`
              : (inventory?.floorNumber ?? asset?.floorNumber),
        },
        { label: "Power backup", value: formatYesNo(commercialAmenities?.powerBackup ?? residentialAmenities?.powerBackup) },
        { label: "Central AC", value: formatYesNo(commercialAmenities?.centralAC) },
        { label: "Security", value: formatEnumLabel(commercialBuilding?.securityType) },
        { label: "Coordinates", value: inventoryCoordinates },
      ],
    },
    {
      title: isRent ? "Lease terms" : "Terms",
      rows: [
        { label: "Deal type", value: formatEnumLabel(inventory?.dealType || asset?.dealType) },
        { label: "Maintenance", value: formatPrice(inventory?.maintenanceCharges ?? asset?.maintenanceCharges) },
        ...(isRent ? [{ label: "Deposit", value: formatPrice(inventory?.deposit ?? asset?.deposit) }] : []),
        { label: "GST", value: (inventory?.gstApplicable ?? asset?.gstApplicable) ? "Applicable" : "Not applicable" },
        { label: "Available", value: formatDate(commercialAvailability?.availableFrom) },
        { label: "Property date", value: formatDate(inventory?.propertyDate || asset?.propertyDate) },
      ],
    },
    statusValue === "Sold" && saleDetails
      ? {
        title: "Sale",
        rows: [
          { label: "Sold to", value: soldLeadLabel },
          { label: "Payment mode", value: formatSoldPaymentMode(saleDetails?.paymentMode) },
          { label: "Payment type", value: formatSoldPaymentType(saleDetails?.paymentType) },
          { label: "Total", value: formatPrice(saleDetails?.totalAmount) },
          { label: "Remaining", value: formatPrice(saleDetails?.remainingAmount ?? 0) },
          { label: "Reference", value: saleDetails?.paymentReference },
          { label: "Sold at", value: formatDate(saleDetails?.soldAt) },
          { label: "Note", value: saleDetails?.note },
        ],
      }
      : null,
    statusValue === "Blocked" || statusValue === "Reserved"
      ? {
        title: "Reservation",
        rows: [
          { label: "Reason", value: inventory?.reservationReason || asset?.reservationReason },
        ],
      }
      : null,
  ].filter(Boolean);

  const amenities = [
    [commercialAmenities?.pantry, "Pantry"],
    [commercialAmenities?.cafeteria, "Cafeteria"],
    [commercialAmenities?.serverRoom, "Server room"],
    [commercialAmenities?.storageRoom, "Storage"],
    [commercialAmenities?.breakoutArea, "Breakout area"],
    [commercialAmenities?.liftAvailable ?? residentialAmenities?.lift, "Lift"],
    [commercialLayout?.receptionArea, "Reception"],
    [commercialLayout?.waitingArea, "Waiting area"],
    [commercialBuilding?.fireSafety, "Fire safety"],
    [commercialBuilding?.parkingSlots || residentialDetails?.parking, "Parking"],
    [residentialAmenities?.modularKitchen, "Modular kitchen"],
    [residentialAmenities?.gym, "Gym"],
    [residentialAmenities?.swimmingPool, "Swimming pool"],
    [residentialAmenities?.clubhouse, "Clubhouse"],
    [residentialAmenities?.security, "Security"],
    [residentialUtilities?.gasPipeline, "Gas pipeline"],
  ]
    .filter(([flag]) => Boolean(flag))
    .map(([, label]) => label);

  const approvalRows = [
    { label: "Team", value: formatUserRef(inventory?.teamId) },
    { label: "Created by", value: formatUserRef(inventory?.createdBy) },
    { label: "Approved by", value: formatUserRef(inventory?.approvedBy) },
    { label: "Updated by", value: formatUserRef(inventory?.updatedBy) },
    { label: "Created at", value: formatDate(inventory?.createdAt) },
    { label: "Updated at", value: formatDate(inventory?.updatedAt) },
    { label: "Record id", value: inventory?._id || asset?._id, mono: true },
  ];

  const mediaCounts = [
    images.length ? `${images.length} photo${images.length === 1 ? "" : "s"}` : "",
    floorPlans.length ? `${floorPlans.length} floor plan${floorPlans.length === 1 ? "" : "s"}` : "",
    videoTours.length ? `${videoTours.length} video${videoTours.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return (
    <div className="ui-page-shell custom-scrollbar p-5">
      <ToastNotice message={error} type="error" />

      <div className="mb-4">
        <Button variant="ghost" size="sm" leftIcon={ArrowLeft} onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_328px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="overflow-hidden">
            <div className="relative grid h-[220px] place-items-center bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              {activeImage ? (
                <img src={activeImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <Building2 aria-hidden="true" size={40} strokeWidth={1.2} />
              )}

              <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                <StatusBadge status={statusValue} />
                <Badge variant="slate" className="text-[10.5px]">
                  {[formatEnumLabel(inventoryType), transactionType].filter(Boolean).join(" · ")}
                </Badge>
              </div>

              {mediaCounts.length ? (
                <div className="absolute bottom-3 right-3 flex flex-wrap gap-1.5">
                  {mediaCounts.map((label) => (
                    <Badge key={label} variant="slate" className="text-[10.5px]">
                      {label}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <CardContent>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0">
                  <h1 className="text-[19px] font-semibold tracking-[-0.018em] text-slate-900 dark:text-slate-50">
                    {pageTitle}
                  </h1>
                  <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                    {addressLine}
                    {inventory?.propertyId || asset?.propertyId ? (
                      <>
                        {addressLine ? " · " : ""}
                        <span className="font-mono">{inventory?.propertyId || asset?.propertyId}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[22px] font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-50">
                    {priceValue}
                    {isRent ? (
                      <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">/mo</span>
                    ) : null}
                  </div>
                  {isRent && (inventory?.deposit ?? asset?.deposit) ? (
                    <div className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      Deposit {formatPrice(inventory?.deposit ?? asset?.deposit)}
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <InventorySpecTabs
            activeTab={specTab}
            onTabChange={setSpecTab}
            showApprovals={canViewActivity}
            showActivity={canViewActivity}
            specBlocks={specBlocks}
            amenities={amenities}
            documents={documents}
            floorPlans={floorPlans}
            videoTours={videoTours}
            activities={activities}
            approvalRows={approvalRows}
            formatDate={formatDate}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-2.5">
              <Button className="justify-center" onClick={handleShareWithClient} disabled={shareLoading}>
                {shareLoading ? "Creating link..." : shareCopied ? "Link copied" : "Share with client"}
              </Button>
              {sharePayload ? (
                <Button variant="secondary" className="justify-center" onClick={handleShareToChat}>
                  Share to chat
                </Button>
              ) : null}
              <p className="mt-0.5 text-center text-[11.5px] text-slate-500 dark:text-slate-400">
                Share creates a tokenised public link
              </p>
              {shareError ? (
                <p className="text-center text-[11.5px] text-rose-600 dark:text-rose-400">{shareError}</p>
              ) : null}
            </CardContent>
          </Card>

          <InventoryOwnerCard source={source} canViewOwner={!isChannelPartner} />
        </div>
      </div>
    </div>
  );
};

export default InventoryDetails;
