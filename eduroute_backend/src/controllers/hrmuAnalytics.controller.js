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

const getSmartSummary = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const summary = await hrmuAnalyticsService.getSmartSummary(req.query);
        return res.json(successResponse('Smart HRMU analytics summary fetched successfully.', summary));
    } catch (error) {
        return next(error);
    }
};

const getSmartRiskTrips = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const riskTrips = await hrmuAnalyticsService.getSmartRiskTrips(req.query);
        return res.json(successResponse('Smart HRMU risk trips fetched successfully.', riskTrips));
    } catch (error) {
        return next(error);
    }
};

const getSmartIncidents = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const incidents = await hrmuAnalyticsService.getSmartIncidents(req.query);
        return res.json(successResponse('Smart HRMU incidents fetched successfully.', incidents));
    } catch (error) {
        return next(error);
    }
};

const getSmartCollegeSummary = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const collegeSummary = await hrmuAnalyticsService.getSmartCollegeSummary(req.query);
        return res.json(successResponse('Smart HRMU college summary fetched successfully.', collegeSummary));
    } catch (error) {
        return next(error);
    }
};

const generateSmartAnalytics = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const analytics = await hrmuAnalyticsService.generateSmartAnalytics(req.query);
        return res.json(successResponse('Smart HRMU analytics generated successfully.', analytics));
    } catch (error) {
        return next(error);
    }
};

const generateSmartAnalyticsForTrip = async (req, res, next) => {
    try {
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const analytics = await hrmuAnalyticsService.generateSmartAnalyticsForTrip(req.params.tripId, req.query);
        return res.json(successResponse('Smart HRMU trip analytics generated successfully.', analytics));
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
        await hrmuAnalyticsService.assertAnalyticsAccess(req.user.sub);
        const result = await hrmuAnalyticsService.getAnalyticsExportPdf(req.user.sub, req.query);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        return res.send(result.buffer);
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
    getSmartSummary,
    getSmartRiskTrips,
    getSmartIncidents,
    getSmartCollegeSummary,
    generateSmartAnalytics,
    generateSmartAnalyticsForTrip,
    exportCsv,
    exportPdf
};
