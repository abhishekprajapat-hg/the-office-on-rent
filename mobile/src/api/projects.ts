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
  totalLandArea?: number | null;
  totalPlots?: number | null;
  plotsAvailable?: number | null;
  plotSize?: string;
  customPlotSize?: number | null;
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
  plc?: number | null;
  otherCharges?: number | null;
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
