import { Building2, Home, Layers3, WalletCards } from "lucide-react";

export const toApiInventoryStatus = (status) => {
  if (status === "Reserved") return "Blocked";
  return status;
};

export const buildInventoryMetrics = (assets = []) => {
  const countByStatus = (status) =>
    assets.filter((asset) => toApiInventoryStatus(asset?.status) === status).length;
  const countByType = (type) =>
    assets.filter((asset) => String(asset?.type || "").trim().toUpperCase() === type).length;

  return [
    {
      label: "Available",
      value: countByStatus("Available"),
      helper: "Ready for lead matching",
      icon: Home,
    },
    {
      label: "Blocked",
      value: countByStatus("Blocked"),
      helper: "Blocked inventory",
      icon: Layers3,
    },
    {
      label: "Sold",
      value: countByStatus("Sold"),
      helper: "Closed properties",
      icon: WalletCards,
    },
    {
      label: "Rent",
      value: countByType("RENT"),
      helper: "Lease inventory",
      icon: Building2,
    },
    {
      label: "Sale",
      value: countByType("SALE"),
      helper: "Sale inventory",
      icon: Building2,
    },
  ];
};
