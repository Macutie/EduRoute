const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const departmentRoutes = require('./routes/department.routes');
const locatorSlipRoutes = require('./routes/locatorSlip.routes');
const notificationRoutes = require('./routes/notification.routes');
const permissionRoutes = require('./routes/permission.routes');
const mapRoutes = require('./routes/map.routes');
const tripRoutes = require('./routes/trip.routes');
const facultyTripFlowRoutes = require('./routes/facultyTripFlow.routes');
const searchRoutes = require('./routes/search.routes');
const deanDashboardRoutes = require('./routes/deanDashboard.routes');
const hrmuDashboardRoutes = require('./routes/hrmuDashboard.routes');
const cssuDashboardRoutes = require('./routes/cssuDashboard.routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');
const env = require('./config/env');

const app = express();

app.use(helmet());
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);

            const isConfiguredOrigin = env.frontendUrls.includes(origin);
            const isLocalNetworkOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
            const isNgrokOrigin = /^https?:\/\/[a-z0-9-]+\.ngrok(-free)?\.(app|dev)$/.test(origin);

            if (isConfiguredOrigin || (env.nodeEnv !== 'production' && (isLocalNetworkOrigin || isNgrokOrigin))) {
                return callback(null, true);
            }

            return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
    res.json({ success: true, message: 'EduRoute backend is running.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/locator-slips', locatorSlipRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/maps', mapRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/faculty', facultyTripFlowRoutes);
app.use('/api/dean', deanDashboardRoutes);
app.use('/api/hrmu', hrmuDashboardRoutes);
app.use('/api/cssu', cssuDashboardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
