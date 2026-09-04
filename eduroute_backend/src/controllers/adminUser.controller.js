const adminUserService = require('../services/adminUser.service');
const adminDashboardService = require('../services/adminDashboard.service');
const { successResponse } = require('../utils/apiResponse');

const list = async (req, res, next) => {
    try { return res.json(successResponse('User accounts fetched successfully.', await adminUserService.listUsers(req.query))); } catch (error) { return next(error); }
};
const create = async (req, res, next) => {
    try { return res.status(201).json(successResponse('User account created successfully.', await adminUserService.createUser(req.body))); } catch (error) { return next(error); }
};
const update = async (req, res, next) => {
    try { return res.json(successResponse('User account updated successfully.', await adminUserService.updateUser(req.params.id, req.body))); } catch (error) { return next(error); }
};
const status = async (req, res, next) => {
    try { return res.json(successResponse('User account status updated successfully.', await adminUserService.updateStatus(req.params.id, req.body.status, req.user.sub))); } catch (error) { return next(error); }
};
const password = async (req, res, next) => {
    try { return res.json(successResponse('User password reset successfully.', await adminUserService.resetPassword(req.params.id, req.body))); } catch (error) { return next(error); }
};

const dashboard = async (req, res, next) => {
    try { return res.json(successResponse('Admin dashboard fetched successfully.', await adminDashboardService.getDashboard())); } catch (error) { return next(error); }
};

module.exports = { list, create, update, status, password, dashboard };
