const nodemailer = require('nodemailer');
const dns = require('dns');
const env = require('./env');

dns.setDefaultResultOrder?.('ipv4first');

const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    family: Number(process.env.SMTP_ADDRESS_FAMILY || 4),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
    auth: {
        user: env.smtpUser,
        pass: env.smtpPass
    }
});

module.exports = transporter;
