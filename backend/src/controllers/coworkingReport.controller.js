const reportService = require("../services/coworkingReport.service");
const logger = require("../config/logger");
const { handleControllerError: handleError } = require("../utils/httpError");

const handleControllerError = (res, error, message) => handleError(res, error, logger, message);

exports.getSummary = async (req, res) => {
  try {
    const report = await reportService.getSummary({
      companyId: req.user.companyId,
      query: req.query,
    });
    return res.json({ report });
  } catch (error) {
    return handleControllerError(res, error, "getCoworkingReportSummary failed");
  }
};
