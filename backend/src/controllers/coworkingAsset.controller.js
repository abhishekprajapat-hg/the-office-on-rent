const assetService = require("../services/coworkingAsset.service");
const logger = require("../config/logger");
const { handleControllerError: handleError } = require("../utils/httpError");

const handleControllerError = (res, error, message) => handleError(res, error, logger, message);

exports.listAssets = async (req, res) => {
  try {
    const { assets, pagination } = await assetService.listAssets({
      companyId: req.user.companyId,
      query: req.query,
    });
    return res.json({ assets, pagination });
  } catch (error) {
    return handleControllerError(res, error, "listAssets failed");
  }
};

exports.createAsset = async (req, res) => {
  try {
    const asset = await assetService.createAsset({
      companyId: req.user.companyId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.status(201).json({ asset });
  } catch (error) {
    return handleControllerError(res, error, "createAsset failed");
  }
};

exports.updateAsset = async (req, res) => {
  try {
    const asset = await assetService.updateAsset({
      companyId: req.user.companyId,
      assetId: req.params.assetId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.json({ asset });
  } catch (error) {
    return handleControllerError(res, error, "updateAsset failed");
  }
};

const statusHandler = (serviceFn, actionName) => async (req, res) => {
  try {
    const asset = await serviceFn({
      companyId: req.user.companyId,
      assetId: req.params.assetId,
      actingUser: req.user,
    });
    return res.json({ asset });
  } catch (error) {
    return handleControllerError(res, error, `${actionName} failed`);
  }
};

exports.markMaintenance = statusHandler(assetService.markMaintenance, "markMaintenance");
exports.markActive = statusHandler(assetService.markActive, "markActive");
exports.retireAsset = statusHandler(assetService.retireAsset, "retireAsset");
exports.markLost = statusHandler(assetService.markLost, "markLost");

exports.deleteAsset = async (req, res) => {
  try {
    await assetService.deleteAsset({
      companyId: req.user.companyId,
      assetId: req.params.assetId,
      actingUser: req.user,
    });
    return res.json({ message: "Asset deleted" });
  } catch (error) {
    return handleControllerError(res, error, "deleteAsset failed");
  }
};
