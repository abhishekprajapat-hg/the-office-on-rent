const settingService = require("../services/coworkingSetting.service");
const logger = require("../config/logger");
const { handleControllerError: handleError } = require("../utils/httpError");

const handleControllerError = (res, error, message) => handleError(res, error, logger, message);

exports.getSettings = async (req, res) => {
  try {
    const settings = await settingService.getSettings(req.user.companyId);
    return res.json({ settings });
  } catch (error) {
    return handleControllerError(res, error, "getSettings failed");
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = await settingService.updateSettings({
      companyId: req.user.companyId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.json({ settings });
  } catch (error) {
    return handleControllerError(res, error, "updateSettings failed");
  }
};
