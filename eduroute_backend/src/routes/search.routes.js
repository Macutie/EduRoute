const express = require('express');
const searchController = require('../controllers/search.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, requireRole('faculty'));

router.get('/destination', searchController.searchDestination);

module.exports = router;
