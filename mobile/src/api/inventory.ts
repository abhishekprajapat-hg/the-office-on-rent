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
  commercialDetails?: { officeLayout?: { workstations?: number | null; totalCabins?: number | null; conferenceRooms?: number | null } };
  residentialDetails?: { bedrooms?: number | null; bathrooms?: number | null; parking?: number | null };
};

/*
 * A channel partner's property becomes a request an admin approves; the
 * server answers with `request` instead of `asset` in that case.
 */
export const createProperty = async (payload: NewProperty) => {
  const res = await api.post<{ asset?: Property; inventory?: Property; request?: { _id: string } }>("/inventory", payload);
  return { property: res.data?.asset || res.data?.inventory || null, pendingApproval: Boolean(res.data?.request) };
};
