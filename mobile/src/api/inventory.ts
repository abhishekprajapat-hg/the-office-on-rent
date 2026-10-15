import { api } from "./client";
import type { Pagination } from "./types";

export type InventoryStatus = "Available" | "Blocked" | "Sold";
export type DealType = "Sale" | "Rent" | "Both";

export type Property = {
  _id: string;
  title?: string;
  projectName?: string;
  towerName?: string;
  unitNumber?: string;
  propertyId?: string;
  inventoryType?: "COMMERCIAL" | "RESIDENTIAL";
  type?: DealType;
  category?: string;
  status?: InventoryStatus | string;
  reservationReason?: string;
  reservationLeadId?: { _id: string; name?: string } | string | null;
  superBuiltUpArea?: number | null;
  price?: number | null;
  rent?: number | null;
  deposit?: number | null;
  depositMonths?: number | null;
  agreementYears?: number | null;
  lockInYears?: number | null;
  maintenanceCharges?: number | null;
  location?: string;
  city?: string;
  area?: string;
  pincode?: string;
  buildingName?: string;
  floorNumber?: number | null;
  totalFloors?: number | null;
  totalArea?: number | null;
  carpetArea?: number | null;
  areaUnit?: string;
  furnishingStatus?: string;
  images?: string[];
  ownerName?: string;
  ownerNumber?: string;
  ownerWhatsappNumber?: string;
  keyManagerName?: string;
  keyManagerNumber?: string;
  siteLocation?: { lat: number | null; lng: number | null } | null;
  residentialDetails?: {
    propertyType?: string;
    bhkType?: string;
    bedrooms?: number | null;
    bathrooms?: number | null;
    balcony?: number | null;
    parking?: number | null;
    amenities?: Record<string, boolean>;
  } | null;
  commercialDetails?: {
    officeType?: string;
    officeLayout?: {
      totalCabins?: number | null;
      seats?: number | null;
      workstations?: number | null;
      conferenceRooms?: number | null;
    } | null;
    amenities?: Record<string, boolean | string>;
  } | null;
  saleDetails?: { leadId?: { _id: string; name: string } | null; soldAt?: string } | null;
  builtUpArea?: number | null;
  floorPlans?: string[];
  documents?: string[];
  videoTours?: string[];
  documentsAvailable?: Partial<Record<"registry" | "searchReport" | "electricityNoc" | "maintenanceNoc" | "taxReceipt" | "loanNoc", boolean>> | null;
  ownerType?: string;
  ownershipType?: string;
  businessModel?: string;
  enterpriseDetails?: { leaseRent?: number | null; clientRent?: number | null; clientName?: string; rentDueDay?: number | null; paymentStatus?: string; lastPaymentDate?: string | null } | null;
  dealType?: string;
  gstApplicable?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type InventoryQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
  inventoryType?: string;
};

export const listInventory = async ({ page = 1, limit = 20, ...filters }: InventoryQuery) => {
  const params: Record<string, string | number> = { page, limit };
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "ALL") params[key] = String(value).trim();
  });
  const res = await api.get<{ assets: Property[]; pagination?: Pagination }>("/inventory", { params });
  return { items: res.data?.assets || [], pagination: res.data?.pagination };
};

export const getProperty = async (id: string) => {
  const res = await api.get<{ asset?: Property; inventory?: Property }>(`/inventory/${id}`);
  return res.data?.asset || res.data?.inventory || null;
};

/* Returns a token; the public page lives on the web app at /shared/inventory/<token>. */
export const createShareLink = async (id: string) => {
  const res = await api.post<{ shareToken: string; expiresAt?: string }>(`/inventory/${id}/share`);
  return res.data;
};

export type NewProperty = {
  inventoryType: "COMMERCIAL" | "RESIDENTIAL";
  type: DealType;
  projectName: string;
  towerName: string;
  location: string;
  city?: string;
  area?: string;
  category?: string;
  furnishingStatus?: string;
  price?: number | null;
  rent?: number | null;
  deposit?: number | null;
  totalArea?: number | null;
  floorNumber?: number | null;
  ownerName?: string;
  ownerNumber?: string;
  ownerWhatsappNumber?: string;
  keyManagerName?: string;
  keyManagerNumber?: string;
  carpetArea?: number | null;
  superBuiltUpArea?: number | null;
  depositMonths?: number | null;
  lockInYears?: number | null;
  maintenanceCharges?: number | null;
  totalFloors?: number | null;
  images?: string[];
  commercialDetails?: NonNullable<Property["commercialDetails"]>;
  residentialDetails?: NonNullable<Property["residentialDetails"]>;
  pincode?: string;
  builtUpArea?: number | null;
  agreementYears?: number | null;
  floorPlans?: string[];
  documents?: string[];
  videoTours?: string[];
  documentsAvailable?: Property["documentsAvailable"];
  ownerType?: string;
  ownershipType?: string;
  businessModel?: string;
  enterpriseDetails?: Property["enterpriseDetails"];
  dealType?: string;
  gstApplicable?: boolean;
  siteLocation?: { lat: number | null; lng: number | null } | null;
};

/*
 * A channel partner's property becomes a request an admin approves; the
 * server answers with `request` instead of `asset` in that case.
 */
export const createProperty = async (payload: NewProperty) => {
  const res = await api.post<{ asset?: Property; inventory?: Property; request?: { _id: string } }>("/inventory", payload);
  return { property: res.data?.asset || res.data?.inventory || null, pendingApproval: Boolean(res.data?.request) };
};

/* ------------------------------------------------------ edit and delete -- */
/* Web: AssetVault. Admins and managers change a property directly; executives send a request an admin approves. */

export type PropertyPatch = Partial<NewProperty> & {
  status?: InventoryStatus;
  reservationReason?: string;
  reservationLeadId?: string | null;
  saleDetails?: SaleDetails | null;
};

export type SaleDetails = {
  leadId: string;
  paymentMode: string;
  paymentType: "FULL" | "PARTIAL";
  totalAmount: number;
  remainingAmount: number;
  paymentReference: string;
  note: string;
  soldAt: string;
};

/* PATCH /inventory/:id */
export const updateProperty = async (id: string, payload: PropertyPatch) => {
  const res = await api.patch<{ asset?: Property; inventory?: Property }>(`/inventory/${id}`, payload);
  return res.data?.asset || res.data?.inventory || null;
};

/* POST /inventory-request/update/:id - proposed changes wait for an admin. */
export const requestPropertyUpdate = async (id: string, proposedData: PropertyPatch, requestNote?: string) => {
  const relatedLeadId = typeof proposedData.reservationLeadId === "string" ? proposedData.reservationLeadId : undefined;
  const res = await api.post(`/inventory-request/update/${id}`, {
    proposedData,
    ...(requestNote ? { requestNote } : {}),
    ...(relatedLeadId ? { relatedLeadId } : {}),
  });
  return res.data?.request || null;
};

/* DELETE /inventory/:id - an admin's delete; anyone else's becomes a request (202 { approvalRequired }). */
export const deleteProperty = async (id: string) => {
  const res = await api.delete<{ approvalRequired?: boolean; message?: string }>(`/inventory/${id}`);
  return { pendingApproval: res.status === 202 || Boolean(res.data?.approvalRequired), message: res.data?.message || "" };
};

/* POST /inventory-request/delete/:id */
export const requestPropertyDelete = async (id: string, requestNote: string) => {
  const res = await api.post(`/inventory-request/delete/${id}`, { requestNote });
  return res.data?.request || null;
};

export type PropertyActivity = {
  _id: string;
  actionType: string;
  role?: string;
  changedBy?: { _id: string; name?: string; role?: string; profileImageUrl?: string } | null;
  oldValue?: unknown;
  newValue?: unknown;
  timestamp?: string;
};

/* GET /inventory/:id/activity - admins and managers. */
export const getPropertyActivity = async (id: string) => {
  const res = await api.get<{ activities: PropertyActivity[] }>(`/inventory/${id}/activity`, { params: { limit: 100 } });
  return res.data?.activities || [];
};

export type InventoryRequest = {
  _id: string;
  type: "create" | "update" | "delete";
  status: "pending" | "approved" | "rejected" | string;
  proposedData?: Record<string, unknown>;
  requestNote?: string;
  rejectionReason?: string;
  inventoryId?: Property | string | null;
  createdAt?: string;
  updatedAt?: string;
};

/* GET /inventory-request/my - the caller's own create / update / delete requests. */
export const listMyInventoryRequests = async () => {
  const res = await api.get<{ requests: InventoryRequest[] }>("/inventory-request/my");
  return res.data?.requests || [];
};
