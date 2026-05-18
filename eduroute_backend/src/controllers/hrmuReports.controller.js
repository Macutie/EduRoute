const { successResponse } = require('../utils/apiResponse');
const hrmuReportsService = require('../services/hrmuReports.service');

const getMonthlyReport = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getMonthlyReport(req.user.sub, req.query);
        return res.json(successResponse('HRMU monthly report fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const getMonthlyReportLogs = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getMonthlyReportLogs(req.user.sub, req.query);
        return res.json(successResponse('HRMU monthly report logs fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const getMonthlyReportSummary = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getMonthlyReportSummary(req.user.sub, req.query);
        return res.json(successResponse('HRMU monthly report summary fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const downloadMonthlyReport = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getMonthlyReportDownload(req.user.sub, req.query);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
        return res.send(payload.buffer);
    } catch (error) {
        return next(error);
    }
};

const downloadNotificationMonthlyLog = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getNotificationMonthlyLogDownload(req.user.sub);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
        return res.send(payload.buffer);
    } catch (error) {
        return next(error);
    }
};

const getMonthlyReportDetails = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getMonthlyReportDetails(req.user.sub, req.params.locatorSlipId);
        return res.json(successResponse('HRMU monthly report detail fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getMonthlyReport,
    getMonthlyReportLogs,
    getMonthlyReportSummary,
    downloadMonthlyReport,
    downloadNotificationMonthlyLog,
    getMonthlyReportDetails
};
