const meetingRoomService = require("../services/coworkingMeetingRoom.service");
const logger = require("../config/logger");
const { handleControllerError: handleError } = require("../utils/httpError");

const handleControllerError = (res, error, message) => handleError(res, error, logger, message);

exports.listMeetingRooms = async (req, res) => {
  try {
    const { meetingRooms, pagination } = await meetingRoomService.listMeetingRooms({
      companyId: req.user.companyId,
      query: req.query,
    });
    return res.json({ meetingRooms, pagination });
  } catch (error) {
    return handleControllerError(res, error, "listMeetingRooms failed");
  }
};

exports.createMeetingRoom = async (req, res) => {
  try {
    const meetingRoom = await meetingRoomService.createMeetingRoom({
      companyId: req.user.companyId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.status(201).json({ meetingRoom });
  } catch (error) {
    return handleControllerError(res, error, "createMeetingRoom failed");
  }
};

exports.updateMeetingRoom = async (req, res) => {
  try {
    const meetingRoom = await meetingRoomService.updateMeetingRoom({
      companyId: req.user.companyId,
      meetingRoomId: req.params.meetingRoomId,
      actingUser: req.user,
      payload: req.body,
    });
    return res.json({ meetingRoom });
  } catch (error) {
    return handleControllerError(res, error, "updateMeetingRoom failed");
  }
};

exports.deleteMeetingRoom = async (req, res) => {
  try {
    await meetingRoomService.deleteMeetingRoom({
      companyId: req.user.companyId,
      meetingRoomId: req.params.meetingRoomId,
      actingUser: req.user,
    });
    return res.json({ message: "Meeting room deleted" });
  } catch (error) {
    return handleControllerError(res, error, "deleteMeetingRoom failed");
  }
};
