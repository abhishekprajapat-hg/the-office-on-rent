const crypto = require('node:crypto');
const Lead = require('../models/Lead');
const Client = require('../models/CoworkingClient');
const Board = require('../models/CoworkingBoardState');
const Booking = require('../models/CoworkingBooking');
const Contract = require('../models/CoworkingContract');
const { createHttpError } = require('../utils/httpError');
const externalId = (companyId, type, id) => `toor:${String(companyId).toLowerCase()}:${type}:${String(id).toLowerCase()}`;
const modelFor = (type) => type === 'lead' ? Lead : type === 'coworking-client' ? Client : null;
const validBookedCabin = (cabin) => cabin?.status === 'BOOKED'
  && Boolean(String(cabin.client?.name || cabin.client?.companyName || '').trim());
// Presence and validity are separate from value: an intentional zero is valid.
const suppliedAmount = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && Number.isFinite(Number(value)) && Number(value) >= 0;

async function loadEligible(companyId, type, id) {
  const Model = modelFor(type);
  if (!Model || !/^[a-f\d]{24}$/i.test(String(id))) throw createHttpError(400, 'Invalid customer');
  const entity = await Model.findOne({ _id: id, companyId }).lean();
  if (!entity) throw createHttpError(404, 'Customer not found');
  id = entity._id;
  if (type === 'lead') {
    if (entity.status !== 'CLOSED') throw createHttpError(409, 'Only closed customers are eligible');
  } else {
    // For coworking clients, if entity exists in database, it is eligible
    const board = await Board.findOne({ companyId }).lean();
    const booked = board?.state?.cabins?.some(c => validBookedCabin(c) && (String(c.client?.canonicalClientId) === String(id) || String(c.client?.id) === String(id)));
    const operational = booked || await Booking.exists({ companyId, clientId: id, status: { $in: ['ACTIVE', 'COMPLETED'] } })
      || await Contract.exists({ companyId, clientId: id, status: { $in: ['ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'] } });
    // If neither booked nor operational, still allow billing as a general client
  }
  return entity;
}

function customerPayload(companyId, type, entity) {
  const address = entity.address || {};
  // Priority: Company name first; if absent, use client name or contact person
  const name = String(
    (type === 'lead'
      ? (entity.companyName || entity.name)
      : (entity.companyName || entity.name || entity.contactPerson)) || ''
  ).trim() || 'Valued Customer';

  const payload = {
    externalId: externalId(companyId, type, entity._id),
    source: 'THE_OFFICE_ON_RENT_CRM',
    name,
    phone: String(entity.phone || '').trim(),
    email: String(entity.email || '').trim(),
    billingAddress: type === 'lead' ? '' : ['line1', 'line2', 'city', 'state', 'pincode', 'country'].map(k => address[k]).filter(Boolean).join(', '),
    gstNumber: String(entity.gstNumber || '').trim(),
  };
  return payload;
}

const fingerprint = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

// Every booked cabin that belongs to the same customer as the selected cabin.
// A client with several cabins must be billed for all of them in one invoice.
// Grouping mirrors the CRM Clients page exactly (same `client.id`). The
// canonical-client link is deliberately NOT used: it is resolved from shared
// phone/email/name and can join two different clients.
function clientBoardCabins(board, entityId, cabinCode) {
  const cabins = (board?.state?.cabins || []).filter(validBookedCabin);
  const selected = cabinCode ? cabins.find(c => c.code === cabinCode) : null;
  if (selected) {
    const clientId = selected.client?.id;
    if (!clientId) return [selected];
    return cabins.filter(c => c === selected || String(c.client?.id) === String(clientId));
  }
  const id = String(entityId);
  return cabins.filter(c => String(c.client?.canonicalClientId) === id || String(c.client?.id) === id);
}

function boardCabinRent(cabin) {
  const amount = cabin.contract?.monthlyRent ?? cabin.monthlyRent;
  return { amount, rent: suppliedAmount(amount) ? Number(amount) : 0, reliable: suppliedAmount(amount) };
}

function multiCabinContext(entity, cabins, currentPeriod) {
  const clientName = entity.companyName || entity.name;
  const agreements = [...new Set(cabins.map(c => c.contract?.id).filter(Boolean))];
  const labelOf = c => c.label || c.code;
  return {
    billingType: 'COWORKING',
    billingEntityCode: '',
    sourceRef: {
      source: 'THE_OFFICE_ON_RENT_CRM',
      sourceType: 'board',
      // One invoice per client per month, covering every cabin.
      sourceId: `multi:${String(entity._id)}:${currentPeriod}`,
      billingPurpose: 'RENT',
      billingPeriod: currentPeriod,
    },
    prefill: {
      notes: `Cabins: ${cabins.map(c => `${labelOf(c)} (${c.seats} Seater)`).join(', ')} | Client: ${clientName}`.slice(0, 500),
      reference: agreements.join(', ') || cabins.map(c => c.code).join(', '),
      lineItems: cabins.map(cabin => {
        const { rent, reliable } = boardCabinRent(cabin);
        return {
          productName: `Coworking Space Rental - Cabin ${labelOf(cabin)} (${cabin.seats} Seats) - ${currentPeriod}`,
          quantity: 1,
          rate: rent,
          rateReliable: reliable,
          hsnSac: '997212',
        };
      }),
    },
  };
}

async function buildBillingContextInner(companyId, type, entity, cabinCode) {
  if (!entity) return null;
  if (type === 'lead') {
    let inventory = null;
    if (entity.inventoryId) {
      const Inventory = require('../models/Inventory');
      inventory = await Inventory.findOne({ _id: entity.inventoryId, companyId }).lean();
    }

    const reqType = String(entity.requirements?.inventoryType || '').toUpperCase();
    const invType = String(inventory?.inventoryType || '').toUpperCase();
    const isResidential = reqType === 'RESIDENTIAL' || (!reqType && invType === 'RESIDENTIAL');

    const billingType = isResidential ? 'RESIDENTIAL' : 'COMMERCIAL';
    const billingEntityCode = isResidential ? 'GOLDHAWK' : '';

    const brokerage = suppliedAmount(entity.brokerageReceived)
      ? Number(entity.brokerageReceived)
      : 0;

    let propDesc = '';
    if (inventory) {
      propDesc = [inventory.projectName, inventory.towerName, inventory.unitNumber ? `Unit ${inventory.unitNumber}` : '']
        .filter(Boolean).join(', ');
    } else if (entity.projectInterested) {
      propDesc = entity.projectInterested;
    }

    return {
      billingType,
      billingEntityCode,
      sourceRef: {
        source: 'THE_OFFICE_ON_RENT_CRM',
        sourceType: 'lead',
        sourceId: String(entity._id),
        billingPurpose: 'BROKERAGE',
        billingPeriod: '',
      },
      prefill: {
        notes: propDesc ? `Property: ${propDesc}` : '',
        reference: entity.dealPayment?.paymentReference || (inventory?.propertyId ? `PropID: ${inventory.propertyId}` : ''),
        lineItems: [
          {
            productName: `Brokerage Services - ${isResidential ? 'Residential' : 'Commercial'}`,
            quantity: 1,
            rate: brokerage,
            rateReliable: suppliedAmount(entity.brokerageReceived),
            hsnSac: '997222',
          },
        ],
      },
    };
  }

  if (['coworking-client', 'board'].includes(type)) {
    const boardRow = await Board.findOne({ companyId }).lean();
    const clientCabins = clientBoardCabins(boardRow, entity._id, cabinCode);
    if (clientCabins.length > 1) {
      const n = new Date();
      return multiCabinContext(entity, clientCabins, `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`);
    }

    const contract = await Contract.findOne({
      companyId,
      clientId: entity._id,
      status: { $in: ['ACTIVE', 'EXPIRING', 'EXPIRED'] },
    }).sort({ createdAt: -1 }).lean();

    const booking = !contract ? await Booking.findOne({
      companyId,
      clientId: entity._id,
      status: { $in: ['ACTIVE', 'COMPLETED', 'CONFIRMED'] },
    }).sort({ createdAt: -1 }).lean() : null;

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (contract) {
      const rent = suppliedAmount(contract.rent) ? Number(contract.rent) : 0;
      return {
        billingType: 'COWORKING',
        billingEntityCode: '',
        sourceRef: {
          source: 'THE_OFFICE_ON_RENT_CRM',
          sourceType: 'coworking-contract',
          sourceId: String(contract._id),
          billingPurpose: 'RENT',
          billingPeriod: currentPeriod,
        },
        prefill: {
          notes: `Contract: ${contract.contractCode || contract._id}`,
          reference: contract.contractCode || '',
          lineItems: [
            {
              productName: `Coworking Space Rental (${currentPeriod})`,
              quantity: 1,
              rate: rent,
              rateReliable: suppliedAmount(contract.rent),
              hsnSac: '997212',
            },
          ],
        },
      };
    }

    if (booking) {
      const price = suppliedAmount(booking.price) ? Number(booking.price) : 0;
      return {
        billingType: 'COWORKING',
        billingEntityCode: '',
        sourceRef: {
          source: 'THE_OFFICE_ON_RENT_CRM',
          sourceType: 'coworking-booking',
          sourceId: String(booking._id),
          billingPurpose: 'BOOKING',
          billingPeriod: '',
        },
        prefill: {
          notes: `Booking: ${booking.bookingCode || booking._id}`,
          reference: booking.bookingCode || '',
          lineItems: [
            {
              productName: `Coworking Booking - ${booking.bookingCode || ''}`,
              quantity: 1,
              rate: price,
              rateReliable: suppliedAmount(booking.price),
              hsnSac: '997212',
            },
          ],
        },
      };
    }

    const board = boardRow;
    const entityIdStr = String(entity._id || entity);
    // The cabin the user opened always wins. Only without one fall back to a
    // cabin linked to this customer, and then never by the shared canonical
    // link alone being found first in board order.
    const bookedCabins = (board?.state?.cabins || []).filter(c => c.status === 'BOOKED');
    const cabin = (cabinCode && bookedCabins.find(c => c.code === cabinCode))
      || bookedCabins.find(c => String(c.client?.id) === entityIdStr)
      || bookedCabins.find(c => String(c.client?.canonicalClientId) === entityIdStr);

    if (cabin) {
      const amount = cabin.contract?.monthlyRent ?? cabin.monthlyRent;
      const rent = suppliedAmount(amount) ? Number(amount) : 0;
      const cabinLabel = cabin.label || cabin.code;
      const agreementId = cabin.contract?.id || '';
      return {
        billingType: 'COWORKING',
        billingEntityCode: '',
        sourceRef: {
          source: 'THE_OFFICE_ON_RENT_CRM',
          sourceType: 'board',
          sourceId: `${cabin.code}:${agreementId || currentPeriod}`,
          billingPurpose: 'RENT',
          billingPeriod: currentPeriod,
        },
        prefill: {
          notes: `Cabin: ${cabinLabel} (${cabin.seats} Seater) | Agreement: ${agreementId} | Client: ${entity.companyName || entity.name}`,
          reference: agreementId || cabin.code,
          lineItems: [
            {
              productName: `Coworking Space Rental - Cabin ${cabinLabel} (${cabin.seats} Seats) - ${currentPeriod}`,
              quantity: 1,
              rate: rent,
              rateReliable: suppliedAmount(amount),
              hsnSac: '997212',
            },
          ],
        },
      };
    }

    return {
      billingType: 'COWORKING',
      billingEntityCode: '',
      sourceRef: {
        source: 'THE_OFFICE_ON_RENT_CRM',
        sourceType: 'coworking-client',
        sourceId: String(entity._id),
        billingPurpose: 'COWORKING_SERVICE',
        billingPeriod: '',
      },
      prefill: {
        notes: `Client: ${entity.companyName || entity.name}`,
        reference: entity.clientCode || '',
        lineItems: [
          {
            productName: 'Coworking Space Rental / Service',
            quantity: 1,
            rate: 0,
            rateReliable: false,
          },
        ],
      },
    };
  }

  return null;
}

// The name the user saw in the CRM (the clicked cabin's client), so BillStack can
// refuse to bill a different customer than the one that was opened.
async function buildBillingContext(companyId, type, entity, cabinCode) {
  const context = await buildBillingContextInner(companyId, type, entity, cabinCode);
  if (!context) return context;
  let name = '';
  if (type !== 'lead' && cabinCode) {
    const board = await Board.findOne({ companyId }).lean();
    const cabin = (board?.state?.cabins || []).find(c => c.code === cabinCode);
    name = String(cabin?.client?.companyName || cabin?.client?.name || '').trim();
  }
  context.clientName = (name || String(entity?.companyName || entity?.name || '')).slice(0, 160);
  return context;
}

module.exports = {
  externalId,
  modelFor,
  validBookedCabin,
  loadEligible,
  customerPayload,
  fingerprint,
  buildBillingContext,
};
