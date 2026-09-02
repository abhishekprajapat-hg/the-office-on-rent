import React from "react";
import { Building2, Edit3, Share2, Trash2 } from "lucide-react";
import { IconButton, cn } from "../../../components/ui";
import { StatusBadge } from "../../../components/crm";
import { toApiInventoryStatus } from "./propertyWorkspaceUtils";

/*
 * Property card, built to the metrics in docs/CRM_SCREENS.html (.invcard):
 *   card    14px radius, 1px line border, e1 shadow
 *   thumb   96px tall, badge top-left 8px, mono propertyId bottom-right 8px
 *   meta    11px padding, 13px/620 name, 11.5px muted line, 15px/680 price
 *   foot    8px/11px padding, 11px muted, separated by a top border
 *   sold    meta drops to 62% opacity rather than being hidden
 */

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatEnum = (value) => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return clean
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

/** "Tower B · Unit 704 · Andheri E" */
const subtitleOf = (asset) =>
  [asset?.towerName || asset?.wing, asset?.unitNumber ? `Unit ${asset.unitNumber}` : "", asset?.area || asset?.city]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" · ");

const areaOf = (asset) => {
  const area = toNumber(asset?.totalArea ?? asset?.carpetArea ?? asset?.builtUpArea);
  if (area === null) return "";
  const unit = String(asset?.areaUnit || "").toUpperCase() === "SQ_M" ? "sq m" : "sq ft";
  return `${area.toLocaleString("en-IN")} ${unit}`;
};

const floorOf = (asset) => {
  const floor = toNumber(asset?.floorNumber ?? asset?.floor);
  if (floor === null) return "";
  const suffix = ["th", "st", "nd", "rd"][(floor % 100 > 10 && floor % 100 < 14) || floor % 10 > 3 ? 0 : floor % 10];
  return `${floor}${suffix} fl`;
};

const holdLabel = (asset) => {
  const until = asset?.reservationExpiresAt || asset?.reservedTill;
  if (!until) return "";
  const date = new Date(until);
  if (Number.isNaN(date.getTime())) return "";
  return `Held till ${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
};

const InventoryCard = React.memo(
  ({
    asset,
    priceLabel,
    onView,
    onEdit,
    onShare,
    onDelete,
    canOpenEditModal,
    canDelete,
    deleting,
    className,
  }) => {
    const status = toApiInventoryStatus(asset?.status);
    const isSold = status === "Sold";
    const isBlocked = status === "Blocked";
    const image = Array.isArray(asset?.images) ? asset.images[0] : "";
    const isRent = ["RENT", "BOTH"].includes(String(asset?.type || "").trim().toUpperCase());

    const area = areaOf(asset);
    const furnishing = formatEnum(asset?.furnishingStatus);
    const floor = floorOf(asset);
    const hold = isBlocked ? holdLabel(asset) : "";

    return (
      <article
        className={cn(
          "group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-crm-soft",
          "transition hover:border-slate-300 hover:shadow-crm-card",
          "dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => onView?.(asset?._id)}
          aria-label={`View ${asset?.projectName || asset?.propertyId || "property"}`}
          className={cn(
            "relative block h-24 w-full overflow-hidden bg-slate-100 text-left outline-none",
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/50",
            "dark:bg-slate-800",
          )}
        >
          {image ? (
            <img
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-slate-400 dark:text-slate-500">
              <Building2 aria-hidden="true" size={22} strokeWidth={1.2} />
            </span>
          )}

          <span className="absolute left-2 top-2">
            <StatusBadge status={status} className="text-[10px]" />
          </span>

          {asset?.propertyId ? (
            <span className="absolute bottom-2 right-2 rounded px-1.5 py-0.5 font-mono text-[10px] text-white" style={{ background: "rgba(13,18,25,.72)" }}>
              {asset.propertyId}
            </span>
          ) : null}
        </button>

        <div className={cn("p-[11px]", isSold && "opacity-[.62]")}>
          <b className="block truncate text-[13px] font-semibold leading-[1.3] text-slate-900 dark:text-slate-100">
            {asset?.projectName || asset?.buildingName || "Untitled property"}
          </b>
          <small className="mt-0.5 block truncate text-[11.5px] text-slate-500 dark:text-slate-400">
            {subtitleOf(asset) || "—"}
          </small>
          <div className="mt-2 flex items-baseline gap-1.5">
            <b className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-slate-50">
              {priceLabel}
            </b>
            <small className="text-[11px] text-slate-500 dark:text-slate-400">
              {isSold ? "sale" : isRent ? "/mo" : ""}
            </small>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-slate-200 px-[11px] py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {hold ? (
            <span className="font-semibold text-amber-600 dark:text-amber-400">{hold}</span>
          ) : (
            <>
              {area ? <span>{area}</span> : null}
              {area && furnishing ? <span aria-hidden="true">·</span> : null}
              {furnishing ? <span className="truncate">{furnishing}</span> : null}
              {floor ? <span className="ml-auto">{floor}</span> : null}
            </>
          )}

          <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {canOpenEditModal ? (
              <IconButton
                icon={Edit3}
                label="Edit property"
                size="sm"
                className="h-6 w-6 border-transparent bg-transparent"
                onClick={() => onEdit?.(asset)}
              />
            ) : null}
            <IconButton
              icon={Share2}
              label="Share property"
              size="sm"
              className="h-6 w-6 border-transparent bg-transparent"
              onClick={() => onShare?.(asset)}
            />
            {canDelete ? (
              <IconButton
                icon={Trash2}
                label="Delete property"
                size="sm"
                disabled={deleting}
                className="h-6 w-6 border-transparent bg-transparent hover:text-rose-600"
                onClick={() => onDelete?.(asset?._id)}
              />
            ) : null}
          </span>
        </div>
      </article>
    );
  },
);

InventoryCard.displayName = "InventoryCard";

export default InventoryCard;
