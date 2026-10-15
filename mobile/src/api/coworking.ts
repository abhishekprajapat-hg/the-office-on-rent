import { api } from "./client";

/* Coworking desk (/api/coworking/*): floors, the live floor view, bookings, clients, contracts, invoices, payments. */

export type CwProperty = { _id: string; name: string; propertyCode?: string; status?: string };
export type CwFloor = { _id: string; name: string; floorNumber?: number; propertyId?: { _id: string; name: string } | string; status?: string };

export type CabinStatus = "VACANT" | "BOOKED" | "RESERVED" | "BLOCKED" | "MAINTENANCE";
export type FloorCabin = {
  _id: string;
  name?: string;
  cabinCode: string;
  capacity?: number;
  status: CabinStatus;
  occupiedSeats?: number;
  monthlyRent?: number | null;
  blockReason?: string;
  currentClients?: { _id?: string; companyName?: string; contactPerson?: string; phone?: string; endDate?: string }[];
  upcoming?: { client?: { companyName?: string }; startDate?: string }[];
};
export type FloorView = {
  floor: { _id: string; name: string; propertyId?: { _id: string; name: string } | string };
  cabins: FloorCabin[];
  counts: Record<CabinStatus | "total", number>;
};

export type BookingStatus = "PENDING" | "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type Booking = {
  _id: string;
  bookingCode?: string;
  clientId?: { _id: string; companyName: string } | null;
  propertyId?: { _id: string; name: string } | null;
  cabinId?: { _id: string; cabinCode: string } | null;
  seatCode?: string;
  bookingType: "CABIN" | "SEAT";
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  price?: number;
  deposit?: number;
  status: BookingStatus;
  notes?: string;
};

export type CwClient = {
  _id: string;
  clientCode?: string;
  companyName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  clientType?: string;
  status?: string;
  kycStatus?: string;
  gstNumber?: string;
  industry?: string;
  address?: { city?: string };
  createdAt?: string;
};

export type Contract = {
  _id: string;
  contractCode: string;
  clientId?: { _id: string; companyName: string } | string | null;
  cabinId?: { _id: string; cabinCode: string } | string | null;
  seatCode?: string;
  contractType: "CABIN" | "SEAT";
  startDate: string;
  endDate: string;
  rent: number;
  deposit?: number;
  lockInPeriodMonths?: number;
  noticePeriodDays?: number;
  status: "DRAFT" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "TERMINATED";
};

export type CwInvoice = {
  _id: string;
  invoiceNumber: string;
  clientId?: { _id: string; companyName: string } | string | null;
  contractId?: string | null;
  totalAmount: number;
  amountPaid?: number;
  dueDate: string;
  status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
};

export const CW_PAYMENT_METHODS = ["UPI", "BANK_TRANSFER", "CASH", "CARD", "CHEQUE", "OTHER"] as const;

const base = "/coworking";
const idOf = (value: { _id: string } | string | null | undefined) => (value && typeof value === "object" ? value._id : value || "");
export const refId = idOf;

export const listCwProperties = async () => (await api.get<{ properties: CwProperty[] }>(`${base}/properties`, { params: { limit: 100 } })).data?.properties || [];
export const listFloors = async (propertyId?: string) =>
  (await api.get<{ floors: CwFloor[] }>(`${base}/floors`, { params: { limit: 100, ...(propertyId ? { propertyId } : {}) } })).data?.floors || [];
export const getFloorView = async (floorId: string) => (await api.get<FloorView>(`${base}/cabins/floor-view`, { params: { floorId } })).data;

export const listBookings = async (params: { from?: string; to?: string; status?: string; clientId?: string; propertyId?: string; cabinId?: string; limit?: number } = {}) =>
  (await api.get<{ bookings: Booking[] }>(`${base}/bookings`, { params: { limit: 100, ...params } })).data?.bookings || [];

export type NewBooking = {
  clientId: string;
  propertyId: string;
  floorId: string;
  cabinId: string;
  bookingType: "CABIN" | "SEAT";
  seatCode?: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  price?: number;
  deposit?: number;
  notes?: string;
};
export const createBooking = async (payload: NewBooking) => (await api.post<{ created: Booking[]; skipped: unknown[] }>(`${base}/bookings`, payload)).data;

export type BookingAction = "confirm" | "activate" | "complete" | "cancel" | "no-show";
export const bookingAction = async (bookingId: string, action: BookingAction, reason?: string) =>
  (await api.post<{ booking: Booking }>(`${base}/bookings/${bookingId}/${action}`, reason ? { reason } : {})).data?.booking;

export const listCwClients = async (params: { status?: string; search?: string; limit?: number } = {}) =>
  (await api.get<{ clients: CwClient[] }>(`${base}/clients`, { params: { limit: 100, ...params } })).data?.clients || [];
export const getCwClient = async (clientId: string) => (await api.get<{ client: CwClient }>(`${base}/clients/${clientId}`)).data?.client;
export const createCwClient = async (payload: Partial<CwClient>) => (await api.post<{ client: CwClient }>(`${base}/clients`, payload)).data?.client;

export const listContracts = async (params: { status?: string; clientId?: string; limit?: number } = {}) =>
  (await api.get<{ contracts: Contract[] }>(`${base}/contracts`, { params: { limit: 100, ...params } })).data?.contracts || [];
export const renewContract = async (contractId: string, payload: { newEndDate: string; newRent: number }) =>
  (await api.post<{ contract: Contract }>(`${base}/contracts/${contractId}/renew`, payload)).data;

export const listCwInvoices = async (params: { status?: string; clientId?: string; limit?: number } = {}) =>
  (await api.get<{ invoices: CwInvoice[] }>(`${base}/invoices`, { params: { limit: 100, ...params } })).data?.invoices || [];

export const recordCwPayment = async (payload: { invoiceId: string; amount: number; method: string; transactionReference?: string; paymentDate?: string }) =>
  (await api.post(`${base}/payments`, payload)).data;

export const invoiceDue = (invoice: CwInvoice) => Math.max(0, (invoice.totalAmount || 0) - (invoice.amountPaid || 0));
export const isOpenInvoice = (invoice: CwInvoice) => ["PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status);
