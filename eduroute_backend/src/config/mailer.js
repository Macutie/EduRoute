const nodemailer = require('nodemailer');
const env = require('./env');

const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
        user: env.smtpUser,
        pass: env.smtpPass
    }
});

module.exports = transporter;