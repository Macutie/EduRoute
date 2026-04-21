const { successResponse } = require('../utils/apiResponse');
const permissionService = require('../services/permission.service');

const getMyPermissionPreferences = async (req, res, next) => {
    try {
        const preferences = await permissionService.ensurePermissionPreferences(req.user.sub);
        return res.json(successResponse('Permission preferences fetched successfully.', preferences));
    } catch (error) {
        return next(error);
    }
};

const updateMyPermissionPreferences = async (req, res, next) => {
    try {
        const preferences = await permissionService.updatePermissionPreferences(req.user.sub, req.body);
        return res.json(successResponse('Permission preferences updated successfully.', preferences));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getMyPermissionPreferences,
    updateMyPermissionPreferences
};
