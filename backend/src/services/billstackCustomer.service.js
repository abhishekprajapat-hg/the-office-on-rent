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
  && Boolean(String(cabin.client?.name || '').trim());
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
    const board = await Board.findOne({ companyId }).lean();
    const booked = board?.state?.cabins?.some(c => validBookedCabin(c) && !c.client.billingIdentityError && (String(c.client.canonicalClientId) === String(id) || String(c.client.id) === String(id)));
    const operational = booked || await Booking.exists({ companyId, clientId: id, status: { $in: ['ACTIVE', 'COMPLETED'] } })
      || await Contract.exists({ companyId, clientId: id, status: { $in: ['ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'] } });
    if (!operational) throw createHttpError(409, 'Customer has no eligible booking or contract');
  }
  return entity;
}
function customerPayload(companyId, type, entity) {
  const address = entity.address || {};
  const payload = {
    externalId: externalId(companyId, type, entity._id), source: 'THE_OFFICE_ON_RENT_CRM',
    name: String(type === 'lead' ? entity.name || '' : entity.companyName || '').trim(),
    phone: String(entity.phone || '').trim(), email: String(entity.email || '').trim(),
    billingAddress: type === 'lead' ? '' : ['line1', 'line2', 'city', 'state', 'pincode', 'country'].map(k => address[k]).filter(Boolean).join(', '),
    gstNumber: String(entity.gstNumber || '').trim(),
  };
  if (!payload.name || (!payload.phone && !payload.email)) throw createHttpError(409, 'Customer needs a name and phone or email before billing');
  return payload;
}
const fingerprint = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
async function buildBillingContext(companyId, type, entity, cabinCode) {
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

    const board = await Board.findOne({ companyId }).lean();
    const entityIdStr = String(entity._id || entity);
    const cabin = board?.state?.cabins?.find(c =>
      c.status === 'BOOKED' && (!cabinCode || c.code === cabinCode) && (
        String(c.client?.canonicalClientId) === entityIdStr
        || String(c.client?.id) === entityIdStr
      )
    );

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
        reference: '',
        lineItems: [
          {
            productName: 'Coworking Services',
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

module.exports = { externalId, modelFor, validBookedCabin, loadEligible, customerPayload, fingerprint, buildBillingContext };
