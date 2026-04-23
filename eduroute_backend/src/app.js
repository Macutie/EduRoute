const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const departmentRoutes = require('./routes/department.routes');
const locatorSlipRoutes = require('./routes/locatorSlip.routes');
const permissionRoutes = require('./routes/permission.routes');
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

            if (isConfiguredOrigin || (env.nodeEnv !== 'production' && isLocalNetworkOrigin)) {
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
app.use('/api/permissions', permissionRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
