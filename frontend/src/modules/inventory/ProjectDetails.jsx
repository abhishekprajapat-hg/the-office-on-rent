import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Building2, Car, ChevronDown, ChevronRight, ChevronUp, FileText, Flame, Image as ImageIcon, IndianRupee,
  Layers3, LayoutGrid, Loader2, MapPin, MessageCircle, Navigation, Pencil, Phone, Ruler, Share2, Store, Tag, Trash2, TrendingUp, Users,
} from "lucide-react";
import { getProjectById, deleteProject, getProjectDetailsCatalogue, getProjectExport } from "../../services/projectService";
import { deleteOutcomeMessage, isDeleteApprovalPending } from "../../services/deleteRequestService";
import { toErrorMessage } from "../../utils/errorMessage";
import { usePermissions } from "../../context/usePermissions";
import ToastNotice from "../../components/ui/ToastNotice";
import FittedImage from "../../components/ui/FittedImage";
import ProjectKnowledgePanel from "./ProjectKnowledgePanel";
import { downloadProjectPdf } from "./projectPdf";
import { GhostButton, IconTile, Pill, PrimaryButton } from "./components/contactGlassUi";
import { FNT, MUT, TONE, field, glassCard, prettyPhone, telHref, waHref } from "./components/contactGlassTokens";
import {
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  PLOT_BASED_PROJECT_TYPES,
  formatPlotSizeRange,
  PROJECT_BHK_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PROJECT_AMENITY_OPTIONS,
  PROJECT_HOUSING_CATEGORY_OPTIONS,
  PROJECT_UNIT_STATUS_OPTIONS,
  PROJECT_COMMERCIAL_AMENITY_OPTIONS,
  getProjectOptionLabel,
} from "../../config/projectConfig";

/*
 * One project, read end to end (CRM Web Glass "Project Details" design):
 * a photo hero with the headline numbers and the actions, then tabs for the
 * overview, the money, the units, where it is and its paperwork. Everything
 * is drawn from the project record and the knowledge record that was already
 * here - the page only gives them a shape a colleague can brief a client from.
 */

const isBuildingType = (projectType) => projectType === "BUILDING";
const isPlotBasedType = (projectType) => PLOT_BASED_PROJECT_TYPES.includes(projectType);
const isCommercialCategory = (projectCategory) => projectCategory === "COMMERCIAL";
const isCoworkingCategory = (projectCategory) => projectCategory === "COWORKING";

const PROJECT_MANAGE_ROLES = new Set(["ADMIN", "MANAGER"]);
// A Manager's delete is a request an Admin approves.
const PROJECT_DELETE_ROLES = new Set(["ADMIN", "MANAGER"]);

const STATUS_TONE = {
  PRE_LAUNCH: "info", TNC: "vio", RERA_APPROVED: "a",
  UNDER_CONSTRUCTION: "warn", READY_TO_MOVE: "ok", RESALE: "mute",
};
const UNIT_TONE = { AVAILABLE: "ok", BOOKED: "warn", RESERVED: "vio", LEASED: "info", SOLD: "bad" };
const CATEGORY_TONE = { COMMERCIAL: "info", RESIDENTIAL: "a", COWORKING: "vio" };
const AMENITY_ICON = { PARKING: Car, VISITOR_PARKING: Car, RESERVED_PARKING: Car, SECURITY_24X7: Users, FIRE_SAFETY_SYSTEM: Flame };

const money = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || value === "" || value === null || value === undefined) return "";
  return `₹${amount.toLocaleString("en-IN")}`;
};
const num = (value) => (value === null || value === undefined || value === "" ? null : Number(value));

/* A card of one headline number. */
const Fact = ({ icon: Icon, value, label }) => (
  <div className="flex flex-col gap-2 rounded-[18px] p-4" style={glassCard}>
    <IconTile icon={Icon} size={34} radius={11} iconSize={17} />
    <div className="flex flex-col">
      <span className="text-[20px] font-semibold" style={value ? undefined : FNT}>{value || "—"}</span>
      <span className="text-[12px]" style={MUT}>{label}</span>
    </div>
  </div>
);

const Panel = ({ title, aside, children, className = "" }) => (
  <div className={`flex flex-col gap-3 rounded-[22px] p-[18px] ${className}`} style={glassCard}>
    {title ? (
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[15px] font-semibold">{title}</span>
        {aside ? <span className="text-[12.5px]" style={MUT}>{aside}</span> : null}
      </div>
    ) : null}
    {children}
  </div>
);

/* Label / value rows, with the blanks folded away until asked for. */
const DetailGroup = ({ title, rows }) => {
  const [showEmpty, setShowEmpty] = useState(false);
  const filled = rows.filter(([, value]) => value !== "" && value !== null && value !== undefined);
  const empty = rows.filter((row) => !filled.includes(row));
  const shown = showEmpty ? [...filled, ...empty] : filled;
  return (
    <div className="rounded-[22px] px-[18px] pb-2.5 pt-1.5" style={glassCard}>
      <div className="flex items-center gap-2 pb-1.5 pt-3">
        <span className="flex-1 text-[15px] font-semibold">{title}</span>
        <span className="text-[12px]" style={MUT}>{filled.length} of {rows.length} set</span>
      </div>
      {shown.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-3 py-2.5" style={{ borderTop: "1px solid var(--g-div)" }}>
          <span className="flex-1 text-[13.5px]" style={MUT}>{label}</span>
          <span className="text-right text-[13.5px] font-medium" style={value ? undefined : FNT}>{value || "Not set"}</span>
        </div>
      ))}
      {empty.length ? (
        <button type="button" onClick={() => setShowEmpty((open) => !open)} className="flex w-full items-center gap-1.5 pb-1 pt-2.5 text-[12.5px] font-medium" style={{ borderTop: "1px solid var(--g-div)", color: "var(--g-b)" }}>
          {showEmpty ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showEmpty ? "Hide empty fields" : `Show ${empty.length} empty fields`}
        </button>
      ) : null}
    </div>
  );
};

const ProjectDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const role = String(localStorage.getItem("role") || "").trim().toUpperCase();
  const { canPageAction, enforcePageAccess } = usePermissions();
  const canManage = PROJECT_MANAGE_ROLES.has(role)
    || (enforcePageAccess && canPageAction("projects", "edit"));
  const canDelete = PROJECT_DELETE_ROLES.has(role)
    || (enforcePageAccess && canPageAction("projects", "delete"));
  const deleteNeedsApproval = role === "MANAGER";

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("overview");
  const [unitFilter, setUnitFilter] = useState("all");
  const [area, setArea] = useState(1000);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError("");
    });
    getProjectById(id)
      .then((data) => {
        if (!cancelled) setProject(data);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(toErrorMessage(fetchError, "Failed to load project"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteProject(id);
      if (isDeleteApprovalPending(result)) {
        setNotice(deleteOutcomeMessage(result));
        setDeleting(false);
        setConfirmingDelete(false);
        return;
      }
      navigate("/projects");
    } catch (deleteError) {
      setError(toErrorMessage(deleteError, "Failed to delete project"));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const shareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Link to this project copied");
    } catch {
      setNotice(window.location.href);
    }
  };

  const downloadBrochure = async () => {
    setPdfBusy(true);
    setError("");
    try {
      const [catalogue, data] = await Promise.all([getProjectDetailsCatalogue(), getProjectExport(id, "client")]);
      await downloadProjectPdf(data, catalogue);
    } catch (pdfError) {
      setError(toErrorMessage(pdfError, "Couldn't create the brochure PDF"));
    } finally {
      setPdfBusy(false);
    }
  };

  // Offices, shops and showrooms read as one list of units.
  const units = useMemo(() => {
    if (!project) return [];
    const take = (list, kind, codeField) => (list || []).map((unit, index) => ({
      key: unit._id || `${kind}-${unit[codeField] || index}`,
      kind,
      code: unit[codeField] || `${kind} ${index + 1}`,
      name: unit.officeName || "",
      floor: unit.floorNumber,
      area: unit.carpetArea ?? unit.builtUpArea ?? unit.superBuiltUpArea ?? null,
      rate: unit.currentRate ?? unit.startingRate ?? null,
      status: unit.status || "AVAILABLE",
    }));
    return [
      ...take(project.offices, "Office", "officeCode"),
      ...take(project.shops, "Shop", "shopCode"),
      ...take(project.showrooms, "Showroom", "showroomCode"),
    ];
  }, [project]);

  if (loading) {
    return (
      <div className="ui-page-shell custom-scrollbar flex items-center justify-center gap-2" style={MUT}>
        <Loader2 className="animate-spin" size={20} />
        Loading project details...
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="ui-page-shell custom-scrollbar">
        <GhostButton className="mb-4" onClick={() => navigate(-1)}><ArrowLeft size={16} />Back</GhostButton>
        <ToastNotice message={error} type="error" />
      </div>
    );
  }

  if (!project) return null;

  const commercial = isCommercialCategory(project.projectCategory);
  const coworking = isCoworkingCategory(project.projectCategory);
  const building = isBuildingType(project.projectType);
  const plotBased = isPlotBasedType(project.projectType);
  const amenityOptions = commercial ? PROJECT_COMMERCIAL_AMENITY_OPTIONS : PROJECT_AMENITY_OPTIONS;
  const images = Array.isArray(project.images) ? project.images : [];
  const startingRate = num(project.startingRate);
  const currentRate = num(project.currentRate);
  const rateUnit = coworking ? "/ seat / mo" : "/ sq ft";
  const growth = startingRate && currentRate && currentRate !== startingRate
    ? ((currentRate - startingRate) / startingRate) * 100
    : null;
  const addressLine = [project.location, project.city, project.state].map((part) => String(part || "").trim()).filter(Boolean).join(", ");

  const statusCounts = PROJECT_UNIT_STATUS_OPTIONS
    .map((option) => ({ ...option, count: units.filter((unit) => unit.status === option.value).length }))
    .filter((option) => option.count);
  const shownUnits = unitFilter === "all" ? units : units.filter((unit) => unit.status === unitFilter);

  // One bar per floor: how much of it is taken.
  const floorRows = (() => {
    const floors = new Map();
    units.forEach((unit) => {
      const floor = Number(unit.floor);
      if (!Number.isFinite(floor)) return;
      const row = floors.get(floor) || { floor, total: 0, taken: 0 };
      row.total += 1;
      if (unit.status !== "AVAILABLE") row.taken += 1;
      floors.set(floor, row);
    });
    return [...floors.values()].sort((a, b) => a.floor - b.floor);
  })();

  const heroStats = coworking
    ? [[project.totalLandArea, "Total area"], [project.status ? getProjectOptionLabel(PROJECT_STATUS_OPTIONS, project.status) : "", "Status"], [units.length || "", "Units on file"]]
    : commercial
      ? [[project.totalLandArea, "Land area"], [project.totalFloors, "Floors"], [project.totalOffices ?? project.offices?.length ?? 0, "Offices"]]
      : building
        ? [[project.totalLandArea, "Land area"], [project.numberOfFloors, "Floors"], [project.numberOfFlats, "Flats"]]
        : [[project.totalLandArea, "Land area"], [project.totalPlots, "Plots"], [project.plotsAvailable ?? 0, "With us"]];

  const facts = commercial
    ? [
      [Ruler, project.totalLandArea, "Total land area"],
      [Layers3, project.totalFloors, "Total floors"],
      [LayoutGrid, project.officesPerFloor, "Offices per floor"],
      [Building2, project.totalOffices ?? project.offices?.length ?? 0, "Total offices"],
      [Store, project.totalShops ?? project.shops?.length ?? 0, "Shops"],
      [Tag, project.totalShowrooms ?? project.showrooms?.length ?? 0, "Showrooms"],
    ]
    : building
      ? [
        [Ruler, project.totalLandArea, "Total land area"],
        [Layers3, project.numberOfFloors, "Floors"],
        [LayoutGrid, project.flatsPerFloor, "Flats per floor"],
        [Building2, project.numberOfFlats, "Total flats"],
        [Tag, project.bhkConfigurations?.length || 0, "BHK options"],
        [Users, getProjectOptionLabel(PROJECT_HOUSING_CATEGORY_OPTIONS, project.housingCategory), "Housing category"],
      ]
      : plotBased
        ? [
          [Ruler, project.totalLandArea, "Total land area"],
          [LayoutGrid, project.totalPlots, "Total plots"],
          [Building2, project.plotsAvailable ?? 0, "Plots with us"],
          [Ruler, formatPlotSizeRange(project), "Plot size range"],
          [Users, getProjectOptionLabel(PROJECT_HOUSING_CATEGORY_OPTIONS, project.housingCategory), "Housing category"],
          [Tag, getProjectOptionLabel(PROJECT_TYPE_OPTIONS, project.projectType), "Project type"],
        ]
        : [
          [Ruler, project.totalLandArea, "Total area"],
          [Tag, getProjectOptionLabel(PROJECT_CATEGORY_OPTIONS, project.projectCategory), "Category"],
          [Building2, units.length || "", "Units on file"],
        ];

  const contacts = [
    ["Owner / manager", project.ownerManagerName, project.ownerManagerMobile, "a"],
    ["Broker manager", project.brokerManagerName, project.brokerManagerMobile, "info"],
  ].filter(([, name, phone]) => name || phone);

  const tabs = [
    { key: "overview", label: "Overview", icon: LayoutGrid },
    { key: "pricing", label: "Pricing", icon: IndianRupee },
    { key: "units", label: plotBased ? "Plots" : "Units", icon: Building2, count: units.length },
    { key: "location", label: "Location", icon: MapPin },
    { key: "documents", label: "Documents", icon: FileText },
  ];

  // Commercial projects carry counts even before a single unit is listed.
  const countedUnits = commercial
    ? (Number(project.totalOffices) || 0) + (Number(project.totalShops) || 0) + (Number(project.totalShowrooms) || 0)
    : 0;
  const estimate = currentRate ? currentRate * area : null;
  const launchEstimate = startingRate ? startingRate * area : null;

  return (
    <div className="ui-page-shell custom-scrollbar flex flex-col gap-4">
      <ToastNotice message={error} type="error" />
      <ToastNotice message={notice} type="success" />

      <div className="flex items-center gap-2 text-[13px]" style={MUT}>
        <button type="button" onClick={() => navigate("/projects")} className="flex items-center gap-1.5 hover:underline">
          <ArrowLeft size={15} />Projects
        </button>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: "var(--g-ink)" }}>{project.projectName}</span>
      </div>

      {/* hero: photos and the headline */}
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="grid min-w-0 flex-[1_1_520px] gap-2" style={{ gridTemplateColumns: "2fr 1fr", gridTemplateRows: "1fr 1fr", height: "clamp(240px,32vw,360px)" }}>
          {[0, 1, 2].map((slot) => {
            const url = images[slot];
            const extra = slot === 2 && images.length > 3 ? images.length - 3 : 0;
            return (
              <a
                key={slot}
                href={url || undefined}
                target={url ? "_blank" : undefined}
                rel="noreferrer"
                className="relative block min-h-0 overflow-hidden rounded-[20px]"
                style={{ gridRow: slot === 0 ? "1 / 3" : slot === 1 ? "1 / 2" : "2 / 3", background: "var(--g-glass2)", border: "1px solid var(--g-edge, var(--g-line))", cursor: url ? "pointer" : "default" }}
              >
                {url ? <FittedImage src={url} alt={`${project.projectName} photo ${slot + 1}`} backdrop={false} /> : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[12px]" style={FNT}>
                    <ImageIcon size={20} />{slot ? `Photo ${slot + 1}` : "Main project photo"}
                  </span>
                )}
                {extra ? (
                  <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-white" style={{ background: "rgba(13,43,51,.7)" }}>+{extra} photos</span>
                ) : null}
              </a>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-[24px] p-5" style={glassCard}>
          <div className="flex flex-wrap gap-1.5">
            {project.status ? <Pill dot tone={STATUS_TONE[project.status] || "mute"}>{getProjectOptionLabel(PROJECT_STATUS_OPTIONS, project.status)}</Pill> : null}
            <Pill tone={CATEGORY_TONE[project.projectCategory] || "mute"}>{getProjectOptionLabel(PROJECT_CATEGORY_OPTIONS, project.projectCategory)}</Pill>
            {!commercial && !coworking && project.projectType ? <Pill tone="mute">{getProjectOptionLabel(PROJECT_TYPE_OPTIONS, project.projectType)}</Pill> : null}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[28px] font-semibold leading-[34px] tracking-[-.02em]">{project.projectName}</span>
            {addressLine ? <span className="flex items-center gap-1.5 text-[13.5px]" style={MUT}><MapPin size={15} />{addressLine}</span> : null}
            <span className="font-mono text-[12px] font-medium" style={FNT}>{project.projectId}</span>
          </div>

          <div className="flex flex-wrap items-end gap-4 py-3.5" style={{ borderTop: "1px solid var(--g-div)", borderBottom: "1px solid var(--g-div)" }}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px]" style={MUT}>Current rate</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-semibold tracking-[-.02em]">{money(currentRate) || "—"}</span>
                <span className="text-[13px]" style={MUT}>{rateUnit}</span>
              </div>
            </div>
            {growth !== null ? (
              <span className="flex items-center gap-1 pb-1.5 text-[12.5px] font-semibold" style={{ color: growth >= 0 ? "var(--g-ok)" : "var(--g-bad)" }}>
                <TrendingUp size={15} />{growth >= 0 ? "+" : ""}{growth.toFixed(1)}% since launch · {money(startingRate)}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {heroStats.map(([value, label]) => (
              <div key={label} className="flex min-w-0 flex-col">
                <span className="truncate text-[18px] font-semibold" style={value || value === 0 ? undefined : FNT}>{value || value === 0 ? value : "—"}</span>
                <span className="text-[11.5px]" style={MUT}>{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            <PrimaryButton className="h-11 flex-[1_1_120px] rounded-[13px]" onClick={shareLink}><Share2 size={16} />Share link</PrimaryButton>
            <GhostButton className="h-11 w-11 rounded-[13px] px-0" title="Download brochure PDF" disabled={pdfBusy} onClick={downloadBrochure}>
              {pdfBusy ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
            </GhostButton>
            {canManage ? (
              <GhostButton className="h-11 w-11 rounded-[13px] px-0" title="Edit project" onClick={() => navigate(`/projects?edit=${project._id}`)}><Pencil size={17} /></GhostButton>
            ) : null}
            {canDelete ? (
              <GhostButton className="h-11 w-11 rounded-[13px] px-0" title={deleteNeedsApproval ? "Request delete" : "Delete project"} style={{ color: "var(--g-bad)" }} onClick={() => setConfirmingDelete(true)}><Trash2 size={17} /></GhostButton>
            ) : null}
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="custom-scrollbar flex gap-1 overflow-x-auto rounded-2xl p-1.5" style={glassCard}>
        {tabs.map((item) => {
          const on = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-current={on ? "page" : undefined}
              className="flex h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-[13.5px] transition"
              style={on
                ? { background: "var(--g-bs)", color: "var(--g-b)", fontWeight: 600 }
                : { color: "var(--g-mut)", fontWeight: 500 }}
            >
              {React.createElement(item.icon, { size: 16 })}
              {item.label}
              {item.count ? <span className="rounded-full px-1.5 py-px text-[11px]" style={{ background: on ? "var(--g-glassHi)" : "var(--g-track)" }}>{item.count}</span> : null}
            </button>
          );
        })}
      </div>

      <div key={tab} className="gl-step-in flex flex-col gap-4">
        {tab === "overview" ? (
          <>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              {facts.map(([icon, value, label]) => <Fact key={label} icon={icon} value={value} label={label} />)}
            </div>

            <div className="flex flex-wrap items-start gap-4">
              {units.length ? (
                <Panel className="min-w-0 flex-[1_1_460px]" title="Unit availability" aside={`${units.length} units`}>
                  <div className="flex h-3 gap-0.5 overflow-hidden rounded-md">
                    {statusCounts.map((option) => (
                      <div key={option.value} style={{ flex: option.count, background: TONE[UNIT_TONE[option.value] || "mute"][0] }} />
                    ))}
                  </div>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))" }}>
                    {statusCounts.map((option) => (
                      <div key={option.value} className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-[12px]" style={MUT}>
                          <i className="h-2 w-2 rounded-[3px]" style={{ background: TONE[UNIT_TONE[option.value] || "mute"][0] }} />{option.label}
                        </span>
                        <span className="text-[18px] font-semibold">{option.count}</span>
                      </div>
                    ))}
                  </div>
                  {floorRows.length ? (
                    <div className="flex flex-col gap-1.5 pt-3" style={{ borderTop: "1px solid var(--g-div)" }}>
                      <span className="text-[12.5px] font-medium" style={MUT}>By floor</span>
                      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(floorRows.length, 12)},minmax(0,1fr))` }}>
                        {floorRows.slice(0, 12).map((row) => (
                          <div key={row.floor} title={`Floor ${row.floor} · ${row.taken} of ${row.total} taken`} className="flex flex-col items-center gap-1">
                            <div className="flex h-12 w-full flex-col-reverse overflow-hidden rounded-[7px]" style={{ background: "var(--g-track)" }}>
                              <div style={{ height: `${row.total ? (row.taken / row.total) * 100 : 0}%`, background: "var(--g-b)", opacity: 0.85 }} />
                            </div>
                            <span className="text-[10px]" style={FNT}>{row.floor}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Panel>
              ) : null}

              <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
                {project.amenities?.length || project.otherFacilities ? (
                  <Panel title="Amenities">
                    <div className="flex flex-wrap gap-1.5">
                      {(project.amenities || []).map((amenity) => (
                        <span key={amenity} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px]" style={{ background: "var(--g-track)" }}>
                          {React.createElement(AMENITY_ICON[amenity] || Tag, { size: 14, style: { color: "var(--g-b)" } })}
                          {getProjectOptionLabel(amenityOptions, amenity)}
                        </span>
                      ))}
                    </div>
                    {project.otherFacilities ? <p className="text-[12.5px]" style={MUT}>{project.otherFacilities}</p> : null}
                  </Panel>
                ) : null}

                {contacts.length ? (
                  <Panel title="Contacts">
                    <div className="flex flex-col">
                      {contacts.map(([label, name, phone, tone], index) => (
                        <div key={label} className="flex items-center gap-2.5 py-2.5" style={index ? { borderTop: "1px solid var(--g-div)" } : undefined}>
                          <IconTile icon={Users} tone={tone} size={38} radius={12} iconSize={17} />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[13.5px] font-medium">{name || "Not added"}</span>
                            <span className="truncate text-[11.5px]" style={MUT}>{label}{phone ? ` · ${prettyPhone(phone)}` : ""}</span>
                          </div>
                          {phone ? (
                            <>
                              <a href={telHref(phone)} aria-label={`Call ${name || label}`} className="grid h-[34px] w-[34px] place-items-center rounded-[11px]" style={{ background: "var(--g-bs)", color: "var(--g-b)" }}><Phone size={15} /></a>
                              <a href={waHref(phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${name || label}`} className="grid h-[34px] w-[34px] place-items-center rounded-[11px]" style={{ background: "var(--g-oks)", color: "var(--g-ok)" }}><MessageCircle size={15} /></a>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </Panel>
                ) : null}
              </div>
            </div>

            {project.bhkConfigurations?.length ? (
              <Panel title="BHK configurations" aside={`${project.bhkConfigurations.length} options`}>
                <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,240px),1fr))" }}>
                  {project.bhkConfigurations.map((config) => (
                    <div key={config.bhk} className="flex flex-col gap-2 rounded-[18px] p-3.5" style={{ background: "var(--g-glassHi)", border: "1px solid var(--g-edge, var(--g-line))" }}>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-[13.5px] font-semibold" style={{ color: "var(--g-b)" }}>{getProjectOptionLabel(PROJECT_BHK_OPTIONS, config.bhk)}</span>
                        <span className="text-[12px]" style={MUT}>{config.size} sq ft</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[["Beds", config.bedrooms], ["Baths", config.washrooms], ["Kitchens", config.kitchens], ["Drawing", config.drawingRooms], ["Balconies", config.balconies], ["Parking", config.reservedParking]].map(([label, value]) => (
                          <div key={label} className="flex flex-col">
                            <span className="text-[13.5px] font-medium">{value ?? 0}</span>
                            <span className="text-[11px]" style={MUT}>{label}</span>
                          </div>
                        ))}
                      </div>
                      {config.servantRoom ? <span className="text-[11.5px]" style={MUT}>Servant room included</span> : null}
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </>
        ) : null}

        {tab === "pricing" ? (
          <div className="flex flex-wrap items-start gap-4">
            {currentRate ? (
              <Panel className="min-w-0 flex-[1_1_300px]" title="Price estimate">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <span className="text-[12.5px]" style={MUT}>{plotBased ? "Plot size" : "Area"}</span>
                    <span className="font-mono text-[13px] font-semibold">{area.toLocaleString("en-IN")} sq ft</span>
                  </div>
                  <input type="range" min="200" max="10000" step="100" value={area} onChange={(event) => setArea(Number(event.target.value))} style={{ accentColor: "var(--g-b)" }} />
                </div>
                {[["At the current rate", money(estimate)], ["At the launch rate", money(launchEstimate)]].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2.5 text-[13px]">
                    <span style={MUT}>{label}</span>
                    <span className="font-mono font-medium" style={value ? undefined : FNT}>{value || "—"}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between pt-3" style={{ borderTop: "1px solid var(--g-div)" }}>
                  <span className="text-[13.5px] font-semibold">Estimate</span>
                  <span className="text-[22px] font-semibold" style={{ color: "var(--g-b)" }}>{money(estimate) || "—"}</span>
                </div>
                <span className="text-[11.5px]" style={FNT}>Rate × area only. The charges listed alongside are extra.</span>
              </Panel>
            ) : null}

            <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-4">
              <DetailGroup
                title="Rates & charges"
                rows={[
                  [`Starting rate ${rateUnit}`, money(startingRate)],
                  [`Current rate ${rateUnit}`, money(currentRate)],
                  ["Development charges", project.developmentCharges],
                  ["Maintenance charges", project.maintenanceCharges],
                  ["Amenity / club charges", project.amenityCharges],
                  ["Utilities (water / electricity)", project.utilityCharges],
                  ["Parking charges", project.parkingCharges],
                  ["Taxes (GST etc.)", project.taxes],
                  ["Registration / stamp duty", project.registrationStampDuty],
                  ["Other charges", project.otherCharges],
                ]}
              />
              <DetailGroup
                title="Preferential location charges"
                rows={[
                  ["PLC", project.plc],
                  ["Wide road", project.plcWideRoad],
                  ["Garden facing", project.plcGardenFacing],
                  ["Corner plot", project.plcCorner],
                  ["Garden + corner", project.plcGardenCorner],
                  ["Group", project.group],
                ]}
              />
            </div>
          </div>
        ) : null}

        {tab === "units" ? (
          units.length ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {[{ value: "all", label: "All", count: units.length }, ...statusCounts].map((option) => {
                  const on = unitFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setUnitFilter(option.value)}
                      className="flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition"
                      style={on
                        ? { background: "var(--g-bfill, var(--g-b))", color: "#fff", border: "1px solid var(--g-b)" }
                        : { ...field }}
                    >
                      {option.label}<span className="opacity-60">{option.count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,240px),1fr))" }}>
                {shownUnits.map((unit) => (
                  <div key={unit.key} className="flex flex-col gap-2.5 rounded-[18px] p-3.5" style={glassCard}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] font-semibold">{unit.code}</span>
                      <Pill tone={UNIT_TONE[unit.status] || "mute"}>{getProjectOptionLabel(PROJECT_UNIT_STATUS_OPTIONS, unit.status)}</Pill>
                    </div>
                    {unit.name ? <span className="truncate text-[12.5px]" style={MUT}>{unit.name}</span> : null}
                    <div className="grid grid-cols-3 gap-1.5">
                      {[[unit.floor === null || unit.floor === undefined ? "—" : `F${unit.floor}`, "Floor"],
                        [unit.area ? Number(unit.area).toLocaleString("en-IN") : "—", "sq ft"],
                        [unit.rate ? `₹${(Number(unit.rate) / 1000).toFixed(1)}K` : "—", rateUnit]].map(([value, label]) => (
                          <div key={label} className="flex min-w-0 flex-col">
                            <span className="truncate text-[13.5px] font-medium">{value}</span>
                            <span className="truncate text-[11px]" style={MUT}>{label}</span>
                          </div>
                        ))}
                    </div>
                    <span className="text-[11px]" style={FNT}>{unit.kind}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Panel>
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <IconTile icon={Building2} size={44} radius={14} iconSize={20} />
                <span className="text-[14px] font-medium">{plotBased ? "Plots are counted, not listed" : "No units listed yet"}</span>
                <span className="text-[12.5px]" style={MUT}>
                  {plotBased
                    ? `${project.plotsAvailable ?? 0} of ${project.totalPlots ?? 0} plots are with us${formatPlotSizeRange(project) ? ` · ${formatPlotSizeRange(project)}` : ""}.`
                    : countedUnits
                      ? `${countedUnits} units are counted on this project. Add them one by one under Edit → inventory to see them here.`
                      : "Office, shop and showroom units added to this project show up here."}
                </span>
              </div>
            </Panel>
          )
        ) : null}

        {tab === "location" ? (
          <div className="flex flex-wrap items-stretch gap-4">
            <div
              className="relative min-h-[300px] min-w-0 flex-[1_1_460px] overflow-hidden rounded-[22px]"
              style={{
                background: "var(--g-glass2)",
                backgroundImage: "linear-gradient(var(--g-grid, var(--g-div)) 1px,transparent 1px),linear-gradient(90deg,var(--g-grid, var(--g-div)) 1px,transparent 1px)",
                backgroundSize: "40px 40px",
                border: "1px solid var(--g-edge, var(--g-line))",
              }}
            >
              <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-full flex-col items-center">
                <div className="whitespace-nowrap rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium text-white" style={{ background: "var(--g-ink)" }}>{project.projectName}</div>
                <div className="mt-1.5 h-4 w-4 rounded-full border-[3px] border-white" style={{ background: "var(--g-b)", boxShadow: "0 0 0 8px var(--g-bs)" }} />
              </div>
              <div className="absolute bottom-3 left-3 flex gap-1.5">
                <a
                  href={project.siteLocation?.lat && project.siteLocation?.lng
                    ? `https://www.google.com/maps/search/?api=1&query=${project.siteLocation.lat},${project.siteLocation.lng}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine || project.projectName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-[11px] px-3 py-2 text-[12.5px] font-medium"
                  style={{ background: "var(--g-modal)", border: "1px solid var(--g-edge, var(--g-line))" }}
                >
                  <Navigation size={15} style={{ color: "var(--g-b)" }} />Directions
                </a>
              </div>
            </div>
            <div className="min-w-0 flex-[1_1_300px]">
              <DetailGroup
                title="Address"
                rows={[
                  ["Address", project.location],
                  ["Landmark", project.landmark],
                  ["City", project.city],
                  ["State", project.state],
                  ["Pincode", project.pincode],
                  ["Coordinates", project.siteLocation?.lat && project.siteLocation?.lng ? `${project.siteLocation.lat}, ${project.siteLocation.lng}` : ""],
                ]}
              />
            </div>
          </div>
        ) : null}

        {tab === "documents" ? (
          <>
            <ProjectKnowledgePanel projectId={id} category={project.projectCategory} canManage={canManage} isManagement={PROJECT_MANAGE_ROLES.has(role)} />
            <div className="flex items-center gap-2.5 rounded-[18px] px-[18px] py-3.5 text-[12.5px]" style={{ ...glassCard, ...MUT }}>
              <Users size={17} />
              Created by {project.createdBy?.name || "—"}
              {project.createdAt ? ` · ${new Date(project.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </div>
          </>
        ) : null}
      </div>

      {confirmingDelete && (
        <>
          <button type="button" aria-label="Close" onClick={() => setConfirmingDelete(false)} className="fixed inset-0 z-[120] cursor-default" style={{ background: "rgba(13,22,40,.32)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }} />
          <div role="dialog" aria-modal="true" aria-label="Delete project" className="fixed left-1/2 top-1/2 z-[121] flex w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[22px] p-[22px]" style={{ background: "var(--g-modal)", border: "1px solid var(--g-line)", boxShadow: "0 30px 80px rgba(13,43,51,.25)", color: "var(--g-ink)" }}>
            <IconTile icon={Trash2} tone="bad" size={46} radius={14} iconSize={21} />
            <span className="text-[17px] font-semibold">{deleteNeedsApproval ? `Request delete of ${project.projectName}?` : `Delete ${project.projectName}?`}</span>
            <span className="text-[13px] leading-[19px]" style={MUT}>
              {deleteNeedsApproval
                ? "An Admin has to approve this. The project stays until they do."
                : `${units.length ? `${units.length} units and ` : ""}${images.length} photos go with it. This cannot be undone.`}
            </span>
            <div className="mt-1 flex justify-end gap-2">
              <GhostButton className="h-[42px]" onClick={() => setConfirmingDelete(false)}>Cancel</GhostButton>
              <PrimaryButton className="h-[42px]" style={{ background: "var(--g-bad)", boxShadow: "none" }} disabled={deleting} onClick={handleDelete}>
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {deleting ? (deleteNeedsApproval ? "Sending..." : "Deleting...") : (deleteNeedsApproval ? "Send request" : "Delete project")}
              </PrimaryButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectDetailsPage;
