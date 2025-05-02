// src/api/v1/approval.routes.js

const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const approvalService = require('../../services/approval.service');
const router = express.Router();

/**
 * @route GET /api/v1/approvals
 * @desc Get approvals with filtering and pagination
 * @access Private (Management roles)
 */
router.get(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        query('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status'),
        query('type').optional().isIn(['discount', 'special_terms', 'cancellation', 'amendment', 'payment_schedule']).withMessage('Invalid type'),
        query('entityId').optional().isMongoId().withMessage('Invalid entity ID'),
        query('entityType').optional().isIn(['booking', 'payment_schedule']).withMessage('Invalid entity type'),
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Extract query parameters for filtering
            const filters = {
                status: req.query.status,
                type: req.query.type,
                entityId: req.query.entityId,
                entityType: req.query.entityType,
                assignedTo: req.query.assignedTo,
                role: req.query.role,
            };

            // Extract pagination parameters
            const pagination = {
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 10,
            };

            const approvals = await approvalService.getApprovals(req.user.tenantId, filters, pagination);

            res.status(200).json({
                status: 'success',
                data: approvals.data,
                pagination: approvals.pagination,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/approvals/pending
 * @desc Get pending approvals for the current user
 * @access Private (Management roles)
 */
router.get(
    '/pending',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    async (req, res, next) => {
        try {
            const approvals = await approvalService.getPendingApprovalsForUser(
                req.user.tenantId,
                req.user.id
            );

            res.status(200).json({
                status: 'success',
                data: approvals,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/approvals/:id
 * @desc Get approval details
 * @access Private (Management roles)
 */
router.get(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    async (req, res, next) => {
        try {
            const approval = await approvalService.getApprovalById(req.params.id);

            // Check if approval belongs to the user's tenant
            if (approval.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            res.status(200).json({
                status: 'success',
                data: approval,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/approvals/:id/approve
 * @desc Approve an approval request
 * @access Private (Management roles)
 */
router.post(
    '/:id/approve',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('comment').optional().notEmpty().withMessage('Comment cannot be empty'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const approval = await approvalService.getApprovalById(req.params.id);

            // Check if approval belongs to the user's tenant
            if (approval.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Process approval
            const actionData = {
                userId: req.user.id,
                comment: req.body.comment || 'Approved',
            };

            const updatedApproval = await approvalService.processApproval(
                req.params.id,
                'approve',
                actionData
            );

            res.status(200).json({
                status: 'success',
                message: 'Approval request approved successfully',
                data: updatedApproval,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/approvals/:id/reject
 * @desc Reject an approval request
 * @access Private (Management roles)
 */
router.post(
    '/:id/reject',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('comment').notEmpty().withMessage('Rejection reason is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const approval = await approvalService.getApprovalById(req.params.id);

            // Check if approval belongs to the user's tenant
            if (approval.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Process rejection
            const actionData = {
                userId: req.user.id,
                comment: req.body.comment,
            };

            const updatedApproval = await approvalService.processApproval(
                req.params.id,
                'reject',
                actionData
            );

            res.status(200).json({
                status: 'success',
                message: 'Approval request rejected',
                data: updatedApproval,
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;