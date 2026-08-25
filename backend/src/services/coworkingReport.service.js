const CoworkingAsset = require("../models/CoworkingAsset");
const CoworkingBooking = require("../models/CoworkingBooking");
const CoworkingCabin = require("../models/CoworkingCabin");
const CoworkingClient = require("../models/CoworkingClient");
const CoworkingContract = require("../models/CoworkingContract");
const CoworkingExpense = require("../models/CoworkingExpense");
const CoworkingInvoice = require("../models/CoworkingInvoice");
const CoworkingMeetingRoom = require("../models/CoworkingMeetingRoom");
const CoworkingPayment = require("../models/CoworkingPayment");
const CoworkingProperty = require("../models/CoworkingProperty");
const CoworkingTicket = require("../models/CoworkingTicket");
const CoworkingVisitor = require("../models/CoworkingVisitor");

const sumField = async (Model, filter, field) => {
  const [result] = await Model.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return result?.total || 0;
};

const countByField = async (Model, filter, field) => {
  const rows = await Model.aggregate([
    { $match: filter },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((row) => ({ key: row._id || "UNKNOWN", count: row.count }));
};

const buildDateRange = (query = {}) => {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDate = query.startDate ? new Date(query.startDate) : defaultStart;
  const endDate = query.endDate ? new Date(query.endDate) : now;

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { startDate: defaultStart, endDate: now };
  }
  endDate.setHours(23, 59, 59, 999);
  return { startDate, endDate };
};

const getSummary = async ({ companyId, query = {} }) => {
  const { startDate, endDate } = buildDateRange(query);
  const dateFilter = { $gte: startDate, $lte: endDate };
  const companyFilter = { companyId };

  const [
    propertyCount,
    cabinCount,
    clientCount,
    activeContractCount,
    bookingCount,
    meetingRoomCount,
    activeVisitorCount,
    openTicketCount,
    assetCount,
    invoiceCount,
    invoiceTotal,
    paymentTotal,
    expenseTotal,
    paidExpenseTotal,
    seatStats,
    cabinsByStatus,
    ticketsByStatus,
    assetsByStatus,
    bookingsByStatus,
    invoiceByStatus,
    recentTickets,
    recentVisitors,
    recentPayments,
  ] = await Promise.all([
    CoworkingProperty.countDocuments(companyFilter),
    CoworkingCabin.countDocuments(companyFilter),
    CoworkingClient.countDocuments({ ...companyFilter, status: { $in: ["ACTIVE", "PROSPECT"] } }),
    CoworkingContract.countDocuments({ ...companyFilter, status: "ACTIVE" }),
    CoworkingBooking.countDocuments({ ...companyFilter, createdAt: dateFilter }),
    CoworkingMeetingRoom.countDocuments(companyFilter),
    CoworkingVisitor.countDocuments({ ...companyFilter, status: "CHECKED_IN" }),
    CoworkingTicket.countDocuments({ ...companyFilter, status: { $in: ["OPEN", "IN_PROGRESS"] } }),
    CoworkingAsset.countDocuments(companyFilter),
    CoworkingInvoice.countDocuments({ ...companyFilter, createdAt: dateFilter }),
    sumField(CoworkingInvoice, { ...companyFilter, createdAt: dateFilter }, "totalAmount"),
    sumField(CoworkingPayment, { ...companyFilter, paymentDate: dateFilter, status: "COMPLETED" }, "amount"),
    sumField(CoworkingExpense, { ...companyFilter, expenseDate: dateFilter }, "amount"),
    sumField(CoworkingExpense, { ...companyFilter, expenseDate: dateFilter, status: "PAID" }, "amount"),
    CoworkingCabin.aggregate([
      { $match: companyFilter },
      { $unwind: { path: "$seats", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalSeats: { $sum: { $cond: [{ $ifNull: ["$seats.seatCode", false] }, 1, 0] } },
          occupiedSeats: { $sum: { $cond: [{ $eq: ["$seats.status", "OCCUPIED"] }, 1, 0] } },
          reservedSeats: { $sum: { $cond: [{ $eq: ["$seats.status", "RESERVED"] }, 1, 0] } },
          blockedSeats: { $sum: { $cond: [{ $in: ["$seats.status", ["BLOCKED", "MAINTENANCE"]] }, 1, 0] } },
        },
      },
    ]),
    countByField(CoworkingCabin, companyFilter, "status"),
    countByField(CoworkingTicket, companyFilter, "status"),
    countByField(CoworkingAsset, companyFilter, "status"),
    countByField(CoworkingBooking, { ...companyFilter, createdAt: dateFilter }, "status"),
    countByField(CoworkingInvoice, { ...companyFilter, createdAt: dateFilter }, "status"),
    CoworkingTicket.find(companyFilter).sort({ createdAt: -1 }).limit(5).select("ticketCode title status priority createdAt").lean(),
    CoworkingVisitor.find(companyFilter).sort({ checkInAt: -1 }).limit(5).select("visitorCode visitorName status checkInAt checkOutAt").lean(),
    CoworkingPayment.find(companyFilter)
      .sort({ paymentDate: -1 })
      .limit(5)
      .select("paymentCode amount method paymentDate status")
      .lean(),
  ]);

  const seatRow = seatStats?.[0] || {};
  const totalSeats = seatRow.totalSeats || 0;
  const occupiedSeats = seatRow.occupiedSeats || 0;
  const occupancyRate = totalSeats ? Math.round((occupiedSeats / totalSeats) * 100) : 0;

  return {
    range: { startDate, endDate },
    metrics: {
      propertyCount,
      cabinCount,
      totalSeats,
      occupiedSeats,
      reservedSeats: seatRow.reservedSeats || 0,
      blockedSeats: seatRow.blockedSeats || 0,
      occupancyRate,
      clientCount,
      activeContractCount,
      bookingCount,
      meetingRoomCount,
      activeVisitorCount,
      openTicketCount,
      assetCount,
      invoiceCount,
      invoiceTotal,
      paymentTotal,
      expenseTotal,
      paidExpenseTotal,
      netCash: paymentTotal - paidExpenseTotal,
    },
    breakdowns: {
      cabinsByStatus,
      ticketsByStatus,
      assetsByStatus,
      bookingsByStatus,
      invoiceByStatus,
    },
    recent: {
      tickets: recentTickets,
      visitors: recentVisitors,
      payments: recentPayments,
    },
  };
};

module.exports = { getSummary };
