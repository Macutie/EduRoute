const { successResponse } = require('../utils/apiResponse');
const authService = require('../services/auth.service');

const getDepartments = async (req, res, next) => {
    try {
        const departments = await authService.getDepartments();
        return res.json(successResponse('Departments fetched successfully.', departments));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getDepartments
};