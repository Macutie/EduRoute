const { successResponse } = require('../utils/apiResponse');
const hrmuAnalyticsService = require('../services/hrmuAnalytics.service');

const getOverview = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const overview = await hrmuAnalyticsService.getOverview(req.query);
        return res.json(successResponse('HRMU analytics overview fetched successfully.', overview));
    } catch (error) {
        return next(error);
    }
};

const getDailyMovement = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const dailyMovement = await hrmuAnalyticsService.getDailyMovement(req.query);
        return res.json(successResponse('HRMU daily faculty movement fetched successfully.', dailyMovement));
    } catch (error) {
        return next(error);
    }
};

const getApprovalRate = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const approvalRate = await hrmuAnalyticsService.getApprovalRate(req.query);
        return res.json(successResponse('HRMU approval rate fetched successfully.', approvalRate));
    } catch (error) {
        return next(error);
    }
};

const getFrequentDestinations = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const destinations = await hrmuAnalyticsService.getFrequentDestinations(req.query);
        return res.json(successResponse('HRMU frequent destinations fetched successfully.', destinations));
    } catch (error) {
        return next(error);
    }
};

const getMonthlySummary = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const summary = await hrmuAnalyticsService.getMonthlySummary(req.query);
        return res.json(successResponse('HRMU monthly performance summary fetched successfully.', summary));
    } catch (error) {
        return next(error);
    }
};

const exportCsv = async (req, res, next) => {
    try {
        const placeholder = await hrmuAnalyticsService.getExportPlaceholder(req.user.sub, 'csv');
        return res.json(successResponse('HRMU analytics CSV placeholder returned successfully.', placeholder));
    } catch (error) {
        return next(error);
    }
};

const exportPdf = async (req, res, next) => {
    try {
        const placeholder = await hrmuAnalyticsService.getExportPlaceholder(req.user.sub, 'pdf');
        return res.json(successResponse('HRMU analytics PDF placeholder returned successfully.', placeholder));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getOverview,
    getDailyMovement,
    getApprovalRate,
    getFrequentDestinations,
    getMonthlySummary,
    exportCsv,
    exportPdf
};
