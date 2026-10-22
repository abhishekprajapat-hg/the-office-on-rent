import { api } from "./client";
import type { Pagination } from "./types";

export type ProjectUnit = {
  _id?: string;
  officeCode?: string;
  shopCode?: string;
  showroomCode?: string;
  officeName?: string;
  floorNumber?: number | null;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  facing?: string;
  status?: "AVAILABLE" | "BOOKED" | "SOLD" | "LEASED" | "RESERVED" | string;
  startingRate?: number | null;
  currentRate?: number | null;
  remarks?: string;
};

export type BhkConfig = { bhk: string; size: number; bedrooms?: number; washrooms?: number; balconies?: number; kitchens?: number };

export type Project = {
  _id: string;
  projectId?: string;
  projectName: string;
  projectCategory?: "RESIDENTIAL" | "COMMERCIAL" | string;
  projectType?: string;
  housingCategory?: string;
  status?: string;
  location?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  totalLandArea?: number | string | null;
  totalPlots?: number | null;
  plotsAvailable?: number | null;
  plotSize?: string;
  customPlotSize?: number | string | null;
  plotSizeMin?: number | null;
  plotSizeMax?: number | null;
  numberOfFlats?: number | null;
  numberOfFloors?: number | null;
  totalFloors?: number | null;
  totalOffices?: number | null;
  totalShops?: number | null;
  totalShowrooms?: number | null;
  bhkConfigurations?: BhkConfig[];
  offices?: ProjectUnit[];
  shops?: ProjectUnit[];
  showrooms?: ProjectUnit[];
  startingRate?: number | null;
  currentRate?: number | null;
  plc?: number | string | null;
  plcWideRoad?: string | null;
  plcGardenFacing?: string | null;
  plcCorner?: string | null;
  plcGardenCorner?: string | null;
  otherCharges?: number | string | null;
  developmentCharges?: string | null;
  maintenanceCharges?: string | null;
  amenityCharges?: string | null;
  utilityCharges?: string | null;
  parkingCharges?: string | null;
  taxes?: string | null;
  registrationStampDuty?: string | null;
  otherFacilities?: string | null;
  flatsPerFloor?: number | null;
  officesPerFloor?: number | null;
  amenities?: string[];
  images?: string[];
  ownerManagerName?: string;
  ownerManagerMobile?: string;
  brokerManagerName?: string;
  brokerManagerMobile?: string;
  siteLocation?: { lat: number | null; lng: number | null } | null;
  createdBy?: { _id: string; name: string } | string | null;
  updatedAt?: string;
};

export const listProjects = async (params: { page?: number; limit?: number; search?: string; projectCategory?: string; status?: string } = {}) => {
  const res = await api.get<{ projects: Project[]; pagination?: Pagination }>("/projects", { params: { page: 1, limit: 50, ...params } });
  return { projects: res.data?.projects || [], pagination: res.data?.pagination || null };
};

export const getProject = async (id: string) => {
  const res = await api.get<{ project: Project }>(`/projects/${id}`);
  return res.data?.project || null;
};

/* Admins delete; a manager's delete becomes a request an admin approves. */
export const deleteProject = async (id: string) => {
  const res = await api.delete<{ approvalRequired?: boolean; message?: string }>(`/projects/${id}`);
  return res.data || {};
};

const TAKEN = ["BOOKED", "SOLD", "LEASED"];

/* "18 of 26 units leased" and the share, across offices, shops, showrooms and plots. */
export const projectOccupancy = (project: Project) => {
  const units = [...(project.offices || []), ...(project.shops || []), ...(project.showrooms || [])];
  if (units.length) {
    const taken = units.filter((unit) => TAKEN.includes(String(unit.status || "").toUpperCase())).length;
    return { taken, total: units.length, noun: "units", verb: project.projectCategory === "COMMERCIAL" ? "leased or sold" : "booked" };
  }
  if (project.totalPlots) {
    const available = Math.max(0, Number(project.plotsAvailable ?? project.totalPlots));
    return { taken: project.totalPlots - available, total: project.totalPlots, noun: "plots", verb: "sold" };
  }
  return null;
};

export const humanize = (value?: string) =>
  String(value || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
    .replace(/\bbhk\b/i, "BHK")
    .replace(/\btnc\b/i, "TNC")
    .replace(/\brera\b/i, "RERA");

/* What the project form sends; the unit lists are commercial only, shaped by lib/projectUnits. */
export type ProjectPayload = {
  projectCategory: "RESIDENTIAL" | "COMMERCIAL";
  projectType?: string;
  projectName: string;
  totalLandArea: string;
  status: string;
  startingRate: number;
  currentRate: number;
  housingCategory?: string;
  totalPlots?: number | null;
  plotsAvailable?: number | null;
  plotSize?: string;
  customPlotSize?: string;
  plotSizeMin?: number | null;
  plotSizeMax?: number | null;
  numberOfFlats?: number | null;
  numberOfFloors?: number | null;
  flatsPerFloor?: number | null;
  bhkConfigurations?: BhkConfig[];
  totalFloors?: number | null;
  officesPerFloor?: number | null;
  totalOffices?: number | null;
  totalShops?: number | null;
  totalShowrooms?: number | null;
  plc?: string;
  plcWideRoad?: string;
  plcGardenFacing?: string;
  plcCorner?: string;
  plcGardenCorner?: string;
  otherCharges?: string;
  developmentCharges?: string;
  maintenanceCharges?: string;
  amenityCharges?: string;
  utilityCharges?: string;
  parkingCharges?: string;
  taxes?: string;
  registrationStampDuty?: string;
  otherFacilities?: string;
  amenities?: string[];
  location?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  ownerManagerName?: string;
  ownerManagerMobile?: string;
  brokerManagerName?: string;
  brokerManagerMobile?: string;
  images?: string[];
  offices?: Record<string, unknown>[];
  shops?: Record<string, unknown>[];
  showrooms?: Record<string, unknown>[];
};

/* POST /projects - admins and managers (or the Projects create grant). */
export const createProject = async (payload: ProjectPayload) => {
  const res = await api.post<{ project: Project }>("/projects", payload);
  return res.data?.project || null;
};

/* PATCH /projects/:id */
export const updateProject = async (id: string, payload: Partial<ProjectPayload>) => {
  const res = await api.patch<{ project: Project }>(`/projects/${id}`, payload);
  return res.data?.project || null;
};
