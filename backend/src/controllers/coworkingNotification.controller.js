const notificationService = require("../services/coworkingNotification.service");
const logger = require("../config/logger");
const { handleControllerError: handleError } = require("../utils/httpError");

const handleControllerError = (res, error, message) => handleError(res, error, logger, message);

exports.listNotifications = async (req, res) => {
  try {
    const { notifications, pagination } = await notificationService.listNotifications({
      companyId: req.user.companyId,
      query: req.query,
    });
    return res.json({ notifications, pagination });
  } catch (error) {
    return handleControllerError(res, error, "listNotifications failed");
  }
};

exports.createNotification = async (req, res) => {
  try {
    const notification = await notificationService.createNotification({
      companyId: req.user.companyId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.status(201).json({ notification });
  } catch (error) {
    return handleControllerError(res, error, "createNotification failed");
  }
};

exports.updateNotification = async (req, res) => {
  try {
    const notification = await notificationService.updateNotification({
      companyId: req.user.companyId,
      notificationId: req.params.notificationId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.json({ notification });
  } catch (error) {
    return handleControllerError(res, error, "updateNotification failed");
  }
};

const statusHandler = (serviceFn, actionName) => async (req, res) => {
  try {
    const notification = await serviceFn({
      companyId: req.user.companyId,
      notificationId: req.params.notificationId,
      actingUser: req.user,
    });
    return res.json({ notification });
  } catch (error) {
    return handleControllerError(res, error, `${actionName} failed`);
  }
};

exports.markRead = statusHandler(notificationService.markRead, "markRead");
exports.markUnread = statusHandler(notificationService.markUnread, "markUnread");
exports.archiveNotification = statusHandler(notificationService.archiveNotification, "archiveNotification");

exports.deleteNotification = async (req, res) => {
  try {
    await notificationService.deleteNotification({
      companyId: req.user.companyId,
      notificationId: req.params.notificationId,
      actingUser: req.user,
    });
    return res.json({ message: "Notification deleted" });
  } catch (error) {
    return handleControllerError(res, error, "deleteNotification failed");
  }
};
