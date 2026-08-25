const visitorService = require("../services/coworkingVisitor.service");
const logger = require("../config/logger");
const { handleControllerError: handleError } = require("../utils/httpError");

const handleControllerError = (res, error, message) => handleError(res, error, logger, message);

exports.listVisitors = async (req, res) => {
  try {
    const { visitors, pagination } = await visitorService.listVisitors({
      companyId: req.user.companyId,
      query: req.query,
    });
    return res.json({ visitors, pagination });
  } catch (error) {
    return handleControllerError(res, error, "listVisitors failed");
  }
};

exports.createVisitor = async (req, res) => {
  try {
    const visitor = await visitorService.createVisitor({
      companyId: req.user.companyId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.status(201).json({ visitor });
  } catch (error) {
    return handleControllerError(res, error, "createVisitor failed");
  }
};

exports.updateVisitor = async (req, res) => {
  try {
    const visitor = await visitorService.updateVisitor({
      companyId: req.user.companyId,
      visitorId: req.params.visitorId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.json({ visitor });
  } catch (error) {
    return handleControllerError(res, error, "updateVisitor failed");
  }
};

exports.checkoutVisitor = async (req, res) => {
  try {
    const visitor = await visitorService.checkoutVisitor({
      companyId: req.user.companyId,
      visitorId: req.params.visitorId,
      actingUser: req.user,
    });
    return res.json({ visitor });
  } catch (error) {
    return handleControllerError(res, error, "checkoutVisitor failed");
  }
};

exports.deleteVisitor = async (req, res) => {
  try {
    await visitorService.deleteVisitor({
      companyId: req.user.companyId,
      visitorId: req.params.visitorId,
      actingUser: req.user,
    });
    return res.json({ message: "Visitor deleted" });
  } catch (error) {
    return handleControllerError(res, error, "deleteVisitor failed");
  }
};
