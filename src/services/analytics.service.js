// src/services/analytics.service.js
const Booking = require('../models/booking.model');
const Lead = require('../models/lead.model');
const Unit = require('../models/unit.model');
const PaymentSchedule = require('../models/payment-schedule.model');
const logger = require('../utils/logger');
const toOid = require('../utils/toObjectId');

/*---------------------------------------------
  SALES  PERFORMANCE
---------------------------------------------*/
const getSalesPerformance = async (tenantId, filters = {}) => {
    try {
        /* date range */
        const end = filters.endDate ? new Date(filters.endDate) : new Date();
        const start = filters.startDate ? new Date(filters.startDate) : new Date(end.getTime() - 30 * 864e5);
        const dateMatch = { createdAt: { $gte: start, $lte: end } };

        /* project / tower filters */
        const projTower = {};
        if (filters.projectId) projTower.projectId = toOid(filters.projectId);
        if (filters.towerId) projTower.towerId = toOid(filters.towerId);

        /* BOOKINGS aggregation */
        const bookingAgg = await Booking.aggregate([
            {
                $match: {
                    ...(toOid(tenantId) && { tenantId: toOid(tenantId) }),
                    status: { $in: ['approved', 'executed'] },
                    ...dateMatch
                }
            },
            { $lookup: { from: 'units', localField: 'unitId', foreignField: '_id', as: 'unit' } },
            { $unwind: '$unit' },
            { $match: projTower },
            {
                $group: {
                    _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' }, d: { $dayOfMonth: '$createdAt' } },
                    bookings: { $sum: 1 },
                    rev: { $sum: '$totalBookingAmount' },
                    discounts: {
                        $sum: {
                            $reduce: {
                                input: {
                                    $filter: { input: '$discounts', cond: { $eq: ['$$this.status', 'approved'] } }
                                },
                                initialValue: 0,
                                in: { $add: ['$$value', '$$this.amount'] }
                            }
                        }
                    }
                }
            },
            { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
            {
                $project: {
                    _id: 0,
                    date: { $dateFromParts: { year: '$_id.y', month: '$_id.m', day: '$_id.d' } },
                    bookingCount: '$bookings',
                    totalAmount: '$rev',
                    discountAmount: '$discounts',
                    averageBookingValue: {
                        $cond: [{ $eq: ['$bookings', 0] }, 0, { $divide: ['$rev', '$bookings'] }]
                    }
                }
            }
        ]);

        /* AGENT performance */
        const agentPerf = await Booking.aggregate([
            {
                $match: {
                    ...(toOid(tenantId) && { tenantId: toOid(tenantId) }),
                    status: { $in: ['approved', 'executed'] },
                    ...dateMatch
                }
            },
            { $lookup: { from: 'units', localField: 'unitId', foreignField: '_id', as: 'unit' } },
            { $unwind: '$unit' },
            { $match: projTower },
            { $group: { _id: '$createdBy', bookingCount: { $sum: 1 }, totalAmount: { $sum: '$totalBookingAmount' } } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agent' } },
            { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
            { $sort: { totalAmount: -1 } },
            {
                $project: {
                    _id: 0,
                    agentId: '$_id',
                    agentName: { $ifNull: ['$agent.name', 'Unknown'] },
                    bookingCount: 1,
                    totalAmount: 1,
                    averageBookingValue: {
                        $cond: [{ $eq: ['$bookingCount', 0] }, 0, { $divide: ['$totalAmount', '$bookingCount'] }]
                    }
                }
            }
        ]);

        /* LEAD conversion */
        const leadConv = await Lead.aggregate([
            { $match: { ...(toOid(tenantId) && { tenantId: toOid(tenantId) }), ...dateMatch } },
            { $lookup: { from: 'bookings', localField: '_id', foreignField: 'leadId', as: 'b' } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    converted: { $sum: { $cond: [{ $gt: [{ $size: '$b' }, 0] }, 1, 0] } }
                }
            },
            {
                $project: {
                    _id: 0,
                    status: '$_id',
                    count: 1,
                    converted: 1,
                    conversionRate: {
                        $cond: [{ $eq: ['$count', 0] }, 0, { $multiply: [{ $divide: ['$converted', '$count'] }, 100] }]
                    }
                }
            }
        ]);

        const totals = bookingAgg.reduce(
            (acc, cur) => ({
                sales: acc.sales + cur.bookingCount,
                rev: acc.rev + cur.totalAmount,
                disc: acc.disc + cur.discountAmount
            }),
            { sales: 0, rev: 0, disc: 0 }
        );

        return {
            dailySales: bookingAgg,
            agentPerformance: agentPerf,
            leadConversion: leadConv,
            summary: {
                totalSales: totals.sales,
                totalRevenue: totals.rev,
                totalDiscounts: totals.disc,
                averageBookingValue: totals.sales ? totals.rev / totals.sales : 0
            }
        };
    } catch (err) {
        logger.error('Error getting sales performance', { err, tenantId });
        throw err;
    }
};

/*---------------------------------------------
  FINANCIAL  ANALYTICS  (collections vs dues)
---------------------------------------------*/
const getFinancialAnalytics = async (tenantId, filters = {}) => {
    try {
        const now = new Date();
        const end = filters.endDate ? new Date(filters.endDate) : now;
        const start = filters.startDate ? new Date(filters.startDate) : new Date(end.getTime() - 30 * 864e5);

        /* ---------- base $match ---------- */
        const match = {
            ...(toOid(tenantId) && { tenantId: toOid(tenantId) }),
            createdAt: { $gte: start, $lte: end }
        };

        /* ---------- flatten installments ---------- */
        const flat = [
            { $match: match },
            { $unwind: '$installments' },
            {
                $project: {
                    dueDate: '$installments.dueDate',
                    amount: '$installments.amount',
                    paid: '$installments.amountPaid',
                    status: '$installments.status'
                }
            }
        ];

        /* ---------- collection summary ---------- */
        const [summaryAgg] = await PaymentSchedule.aggregate([
            ...flat,
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    collectedAmount: { $sum: '$paid' },
                    overdueAmount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $lt: ['$dueDate', now] },
                                        { $lt: ['$paid', '$amount'] }
                                    ]
                                },
                                { $subtract: ['$amount', '$paid'] },
                                0
                            ]
                        }
                    },
                    overdueInstallments: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $lt: ['$dueDate', now] },
                                        { $lt: ['$paid', '$amount'] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalAmount: 1,
                    collectedAmount: 1,
                    pendingAmount: { $subtract: ['$totalAmount', '$collectedAmount'] },
                    overdueAmount: 1,
                    overdueInstallments: 1,
                    collectionEfficiency: {
                        $cond: [
                            { $eq: ['$totalAmount', 0] },
                            0,
                            { $multiply: [{ $divide: ['$collectedAmount', '$totalAmount'] }, 100] }
                        ]
                    }
                }
            }
        ]);

        const collectionSummary = summaryAgg || {
            totalAmount: 0,
            collectedAmount: 0,
            pendingAmount: 0,
            overdueAmount: 0,
            overdueInstallments: 0,
            collectionEfficiency: 0
        };

        /* ---------- upcoming collections buckets ---------- */
        const upcomingAgg = await PaymentSchedule.aggregate([
            ...flat,
            {
                $addFields: {
                    bucket: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $gte: ['$dueDate', new Date(now.setHours(0, 0, 0, 0))] },
                                            { $lt: ['$dueDate', new Date(now.setHours(23, 59, 59, 999))] }
                                        ]
                                    },
                                    then: 'Today'
                                },
                                {
                                    case: {
                                        $and: [
                                            { $gte: ['$dueDate', new Date(now)] },
                                            { $lt: ['$dueDate', new Date(now.getTime() + 7 * 864e5)] }
                                        ]
                                    },
                                    then: 'This Week'
                                },
                                {
                                    case: {
                                        $and: [
                                            { $gte: ['$dueDate', new Date(now.getTime() + 7 * 864e5)] },
                                            { $lt: ['$dueDate', new Date(now.getTime() + 14 * 864e5)] }
                                        ]
                                    },
                                    then: 'Next Week'
                                }
                            ],
                            default: 'Future'
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$bucket',
                    count: { $sum: 1 },
                    totalAmount: { $sum: { $subtract: ['$amount', '$paid'] } }
                }
            },
            { $project: { _id: 1, count: 1, totalAmount: 1 } }
        ]);

        return {
            collectionSummary,
            upcomingCollections: upcomingAgg,
            cashflow: [] // (keep the earlier cash‑flow chart here if you like)
        };
    } catch (err) {
        logger.error('Error getting financial analytics', { err, tenantId });
        throw err;
    }
};

/*---------------------------------------------
  INVENTORY ANALYTICS  (unchanged logic,
  just safer tenantId filter)
---------------------------------------------*/
const getInventoryAnalytics = async (tenantId, filters = {}) => {
    try {
        const projTower = {};
        if (filters.projectId) projTower.projectId = toOid(filters.projectId);
        if (filters.towerId) projTower.towerId = toOid(filters.towerId);

        const baseMatch = { ...(toOid(tenantId) && { tenantId: toOid(tenantId) }), ...projTower };

        /* inventory status summary */
        const inventorySummary = await Unit.aggregate([
            { $match: baseMatch },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalValue: { $sum: '$basePrice' }
                }
            },
            { $project: { _id: 0, status: '$_id', count: 1, totalValue: 1 } }
        ]);

        /* inventory by type */
        const inventoryByType = await Unit.aggregate([
            { $match: baseMatch },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: 1 },
                    available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
                    sold: { $sum: { $cond: [{ $eq: ['$status', 'sold'] }, 1, 0] } },
                    locked: { $sum: { $cond: [{ $eq: ['$status', 'locked'] }, 1, 0] } },
                    totalValue: { $sum: '$basePrice' },
                    soldValue: { $sum: { $cond: [{ $eq: ['$status', 'sold'] }, '$basePrice', 0] } }
                }
            },
            {
                $project: {
                    _id: 0,
                    type: '$_id',
                    total: 1, available: 1, sold: 1, locked: 1,
                    totalValue: 1, soldValue: 1,
                    soldPercentage: {
                        $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$sold', '$total'] }, 100] }]
                    }
                }
            },
            { $sort: { type: 1 } }
        ]);

        /* inventory by tower */
        const inventoryByTower = await Unit.aggregate([
            { $match: baseMatch },
            { $lookup: { from: 'towers', localField: 'towerId', foreignField: '_id', as: 'tower' } },
            { $unwind: '$tower' },
            {
                $group: {
                    _id: '$towerId',
                    towerName: { $first: '$tower.name' },
                    projectId: { $first: '$projectId' },
                    total: { $sum: 1 },
                    available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
                    sold: { $sum: { $cond: [{ $eq: ['$status', 'sold'] }, 1, 0] } },
                    locked: { $sum: { $cond: [{ $eq: ['$status', 'locked'] }, 1, 0] } },
                    totalValue: { $sum: '$basePrice' },
                    soldValue: { $sum: { $cond: [{ $eq: ['$status', 'sold'] }, '$basePrice', 0] } }
                }
            },
            { $lookup: { from: 'projects', localField: 'projectId', foreignField: '_id', as: 'project' } },
            { $unwind: '$project' },
            {
                $project: {
                    _id: 0,
                    towerId: '$_id',
                    towerName: 1,
                    projectId: 1,
                    projectName: '$project.name',
                    total: 1, available: 1, sold: 1, locked: 1,
                    totalValue: 1, soldValue: 1,
                    soldPercentage: {
                        $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$sold', '$total'] }, 100] }]
                    }
                }
            },
            { $sort: { projectName: 1, towerName: 1 } }
        ]);

        /* overall summary */
        const totals = inventorySummary.reduce(
            (a, i) => ({
                units: a.units + i.count,
                value: a.value + i.totalValue,
                soldUnits: i.status === 'sold' ? a.soldUnits + i.count : a.soldUnits,
                soldVal: i.status === 'sold' ? a.soldVal + i.totalValue : a.soldVal,
                avail: i.status === 'available' ? a.avail + i.count : a.avail
            }),
            { units: 0, value: 0, soldUnits: 0, soldVal: 0, avail: 0 }
        );

        return {
            summary: {
                totalUnits: totals.units,
                availableUnits: totals.avail,
                soldUnits: totals.soldUnits,
                lockedUnits: totals.units - totals.avail - totals.soldUnits,
                totalInventoryValue: totals.value,
                soldInventoryValue: totals.soldVal,
                soldPercentage: totals.units ? (totals.soldUnits / totals.units) * 100 : 0,
                availablePercentage: totals.units ? (totals.avail / totals.units) * 100 : 0
            },
            inventorySummary,
            inventoryByType,
            inventoryByTower
        };
    } catch (err) {
        logger.error('Error getting inventory analytics', { err, tenantId });
        throw err;
    }
};

module.exports = {
    getSalesPerformance,
    getFinancialAnalytics,
    getInventoryAnalytics
};
