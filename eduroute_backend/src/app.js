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
        origin: env.frontendUrl,
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
