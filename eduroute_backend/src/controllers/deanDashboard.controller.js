const { successResponse } = require('../utils/apiResponse');
const deanDashboardService = require('../services/deanDashboard.service');

const getSummary = async (req, res, next) => {
    try {
        const summary = await deanDashboardService.getDashboardSummary(req.user.sub);
        return res.json(successResponse('Dean dashboard summary fetched successfully.', summary));
    } catch (error) {
        return next(error);
    }
};

const getNotifications = async (req, res, next) => {
    try {
        const notifications = await deanDashboardService.getDeanNotifications(req.user.sub, req.query);
        return res.json(successResponse('Dean notifications fetched successfully.', notifications));
    } catch (error) {
        return next(error);
    }
};

const markNotificationRead = async (req, res, next) => {
    try {
        const notification = await deanDashboardService.markNotificationRead(req.user.sub, req.params.id);
        return res.json(successResponse('Notification marked as read.', notification));
    } catch (error) {
        return next(error);
    }
};

const getLocatorSlips = async (req, res, next) => {
    try {
        const locatorSlips = await deanDashboardService.getDeanLocatorSlips(req.user.sub, req.query);
        return res.json(successResponse('Dean locator slips fetched successfully.', locatorSlips));
    } catch (error) {
        return next(error);
    }
};

const getPendingApprovals = async (req, res, next) => {
    try {
        const approvals = await deanDashboardService.getPendingApprovalsPreview(req.user.sub, req.query.limit);
        return res.json(successResponse('Pending approvals fetched successfully.', approvals));
    } catch (error) {
        return next(error);
    }
};

const getFacultyOverview = async (req, res, next) => {
    try {
        const faculty = await deanDashboardService.getFacultyOverview(req.user.sub, req.query);
        return res.json(successResponse('Dean faculty overview fetched successfully.', faculty));
    } catch (error) {
        return next(error);
    }
};

const getPendingRequestsPage = async (req, res, next) => {
    try {
        const requests = await deanDashboardService.getPendingRequestsPage(req.user.sub);
        return res.json(successResponse('Dean pending requests fetched successfully.', requests));
    } catch (error) {
        return next(error);
    }
};

const getRegistryPage = async (req, res, next) => {
    try {
        const registry = await deanDashboardService.getRegistryPage(req.user.sub);
        return res.json(successResponse('Dean registry fetched successfully.', registry));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getSummary,
    getNotifications,
    markNotificationRead,
    getLocatorSlips,
    getPendingApprovals,
    getFacultyOverview,
    getPendingRequestsPage,
    getRegistryPage
};
