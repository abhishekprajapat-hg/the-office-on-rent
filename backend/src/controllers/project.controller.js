const {
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectList,
  parsePagination,
  buildPaginationMeta,
} = require("../services/project.service");

const details = require("../services/projectDetails.service");
const Project = require("../models/Project");
const Inventory = require("../models/Inventory");
const { writeAuditLog } = require("../services/auditLog.service");

const handleError = (res, error) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error("Project route error:", error);
  }
  return res.status(statusCode).json({ message: error.message || "Something went wrong" });
};

exports.getProjects = async (req, res) => {
  try {
    const pagination = parsePagination(req.query, {
      defaultLimit: Number.parseInt(process.env.PROJECT_PAGE_LIMIT, 10) || 25,
      maxLimit: Number.parseInt(process.env.PROJECT_PAGE_MAX_LIMIT, 10) || 200,
    });

    const { rows, totalCount } = await getProjectList({
      user: req.user,
      filters: {
        projectCategory: req.query?.projectCategory,
        projectType: req.query?.projectType,
        status: req.query?.status,
        search: req.query?.search,
        createdBy: req.query?.createdBy,
        developer: req.query?.developer,
        city: req.query?.city,
        amenity: req.query?.amenity,
        priceMin: req.query?.priceMin,
        priceMax: req.query?.priceMax,
        sizeMin: req.query?.sizeMin,
        sizeMax: req.query?.sizeMax,
      },
      pagination,
    });

    return res.status(200).json({
      count: rows.length,
      projects: rows,
      pagination: pagination.enabled
        ? buildPaginationMeta({ page: pagination.page, limit: pagination.limit, totalCount })
        : undefined,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getProject = async (req, res) => {
  try {
    const project = await getProjectById({ user: req.user, projectId: req.params.id });
    // Requirements 16 Oct 2026 (section 05): Channel Partners see the client
    // view of the knowledge record; staff see the internal one.
    const knowledge = details.toKnowledgeView(project, { user: req.user, mode: req.user.role === "CHANNEL_PARTNER" ? "client" : "internal" });
    const row = project.toObject();
    delete row.details; delete row.projectContacts; delete row.documentLibrary; delete row.media; delete row.history;
    return res.status(200).json({ project: row, knowledge });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.createProject = async (req, res) => {
  try {
    const project = await createProject({ user: req.user, payload: req.body });
    return res.status(201).json({ project });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.updateProject = async (req, res) => {
  try {
    const project = await updateProject({
      user: req.user,
      projectId: req.params.id,
      payload: req.body,
    });
    return res.status(200).json({ project });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteProject = async (req, res) => {
  try {
    await deleteProject({ user: req.user, projectId: req.params.id });
    return res.status(200).json({ message: "Project deleted" });
  } catch (error) {
    return handleError(res, error);
  }
};


/* ----------------------------------- project knowledge (section 05) -- */

exports.getDetailsCatalogue = async (req, res) => res.json({ catalogue: details.catalogueFor(req.user) });

/* PATCH /projects/:id/details - edit the knowledge record (Admin/Manager). */
exports.updateProjectDetails = async (req, res) => {
  try {
    const project = await getProjectById({ user: req.user, projectId: req.params.id });
    const beforePricing = JSON.stringify(project.details?.pricing || {});
    const beforeApproval = project.details?.approvalStatus;
    const changed = details.applyDetailsPatch(project, req.body || {}, req.user);
    project.updatedBy = req.user._id;
    await project.save();
    // Pricing and approval changes are audited (section 12).
    if (changed.includes("pricing") && JSON.stringify(project.details.pricing || {}) !== beforePricing) {
      await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "PROJECT_PRICING_CHANGED", entityType: "Project", entityId: project._id, metadata: { projectId: project.projectId, before: JSON.parse(beforePricing), after: project.details.pricing }, req });
    }
    if (changed.includes("approvalStatus") && project.details.approvalStatus !== beforeApproval) {
      await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: "PROJECT_APPROVAL_CHANGED", entityType: "Project", entityId: project._id, metadata: { projectId: project.projectId, before: beforeApproval, after: project.details.approvalStatus }, req });
    }
    return res.json({ message: "Project details saved", knowledge: details.toKnowledgeView(project, { user: req.user }) });
  } catch (error) {
    return handleError(res, error);
  }
};

/* POST /projects/:id/verify - "I checked this project's details today". */
exports.verifyProject = async (req, res) => {
  try {
    const project = await getProjectById({ user: req.user, projectId: req.params.id });
    project.lastVerifiedAt = new Date();
    project.lastVerifiedBy = req.user._id;
    project.history = [...(project.history || []), { at: new Date(), by: req.user._id, byName: req.user.name || "", change: "verified" }].slice(-100);
    await project.save();
    return res.json({ message: "Marked as verified today", lastVerifiedAt: project.lastVerifiedAt });
  } catch (error) {
    return handleError(res, error);
  }
};

/* Units of this project in the Inventory module - availability lives there (5.6). */
const linkedInventory = async (req, project) => {
  if (project.projectCategory === "COWORKING") {
    // A workspace's units are its cabins, from cabin mapping (section 10).
    const CoworkingProperty = require("../models/CoworkingProperty");
    const CoworkingCabin = require("../models/CoworkingCabin");
    const properties = await CoworkingProperty.find({ companyId: req.user.companyId, projectId: project._id }).select("_id name").lean();
    const cabins = properties.length
      ? await CoworkingCabin.find({ companyId: req.user.companyId, propertyId: { $in: properties.map((p) => p._id) } }).select("cabinCode name status seatCount propertyId").limit(500).lean()
      : [];
    const counts = cabins.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] || 0) + 1 }), {});
    return { counts, units: cabins.map((c) => ({ _id: c._id, propertyId: c.cabinCode || c.name, unitNumber: c.name, status: c.status, isCabin: true })), properties };
  }
  const rows = await Inventory.find({ companyId: req.user.companyId, $or: [{ projectId: project._id }, { projectName: project.projectName }] })
    .select("propertyId projectId projectName towerName unitNumber status type price rent totalArea areaUnit floorNumber inventoryType")
    .sort({ status: 1, unitNumber: 1 }).limit(500).lean();
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  return { counts, units: rows };
};

/*
 * POST /projects/:id/link-inventory - units that only match this project by
 * their typed project name get properly linked to it (21 Oct 2026).
 */
exports.linkProjectInventory = async (req, res) => {
  try {
    const project = await getProjectById({ user: req.user, projectId: req.params.id });
    if (project.projectCategory === "COWORKING") return res.status(400).json({ message: "A workspace's units come from cabin mapping" });
    const escaped = String(project.projectName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const result = await Inventory.updateMany(
      { companyId: req.user.companyId, projectId: null, projectName: { $regex: `^${escaped}$`, $options: "i" } },
      { $set: { projectId: project._id } },
    );
    return res.json({ linked: result.modifiedCount || 0, ...(await linkedInventory(req, project)) });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getProjectInventory = async (req, res) => {
  try {
    const project = await getProjectById({ user: req.user, projectId: req.params.id });
    return res.json(await linkedInventory(req, project));
  } catch (error) {
    return handleError(res, error);
  }
};

/*
 * GET /projects/:id/export?type=client|internal - the data for the two PDFs
 * (5.6), from the latest saved project. The client brochure is open to anyone
 * who can see the project; the internal dossier only to Admin/Manager.
 */
exports.exportProject = async (req, res) => {
  try {
    const type = String(req.query.type || "client").toLowerCase() === "internal" ? "internal" : "client";
    if (type === "internal" && !details.isManagement(req.user)) {
      return res.status(403).json({ message: "Only Admin or Manager can download the internal dossier" });
    }
    const project = await getProjectById({ user: req.user, projectId: req.params.id });
    const base = project.toObject();
    const knowledge = details.toKnowledgeView(project, { user: req.user, mode: type });
    const summary = {
      projectId: base.projectId, projectName: base.projectName, projectCategory: base.projectCategory, projectType: base.projectType,
      status: base.status, location: base.location, landmark: base.landmark, city: base.city, state: base.state, pincode: base.pincode,
      totalLandArea: base.totalLandArea, amenities: base.amenities || [], images: base.images || [],
      ...(type === "internal" || knowledge.pricingPublished ? { startingRate: base.startingRate, currentRate: base.currentRate, otherCharges: base.otherCharges } : {}),
      ...(type === "internal" ? { ownerManagerName: base.ownerManagerName, ownerManagerMobile: base.ownerManagerMobile, brokerManagerName: base.brokerManagerName, brokerManagerMobile: base.brokerManagerMobile } : {}),
    };
    const inventory = type === "internal" ? await linkedInventory(req, project) : null;
    await writeAuditLog({ companyId: req.user.companyId, actor: req.user, action: type === "internal" ? "PROJECT_DOSSIER_EXPORTED" : "PROJECT_BROCHURE_EXPORTED", entityType: "Project", entityId: project._id, metadata: { projectId: base.projectId }, req });
    return res.json({ type, generatedAt: new Date(), project: summary, knowledge, inventory });
  } catch (error) {
    return handleError(res, error);
  }
};
