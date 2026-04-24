const { successResponse } = require('../utils/apiResponse');
const mapboxGeocodingService = require('../services/mapboxGeocoding.service');

const searchDestination = async (req, res, next) => {
    try {
        const results = await mapboxGeocodingService.searchDestinations(req.query.q);
        return res.json(successResponse('Destination search completed successfully.', results));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    searchDestination
};
