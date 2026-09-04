const express = require('express');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const controller = require('../controllers/adminUser.controller');

const router = express.Router();
router.use(protect, requireRole('admin'));
router.get('/dashboard', controller.dashboard);
router.get('/users', controller.list);
router.post('/users', controller.create);
router.put('/users/:id', controller.update);
router.patch('/users/:id/status', controller.status);
router.patch('/users/:id/password', controller.password);

module.exports = router;
