const nodemailer = require('nodemailer');
const dns = require('dns');
const env = require('./env');

dns.setDefaultResultOrder?.('ipv4first');

const smtpAddressFamily = Number(process.env.SMTP_ADDRESS_FAMILY || 4);

const lookupSmtpHost = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, family: smtpAddressFamily }, callback);
};

const createSmtpTransport = (overrides = {}) => nodemailer.createTransport({
    host: overrides.host || env.smtpHost,
    port: overrides.port || env.smtpPort,
    secure: typeof overrides.secure === 'boolean' ? overrides.secure : env.smtpSecure,
    family: smtpAddressFamily,
    lookup: lookupSmtpHost,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
    tls: {
        servername: overrides.host || env.smtpHost
    },
    auth: {
        user: env.smtpUser,
        pass: env.smtpPass
    }
});

const transporter = createSmtpTransport();

transporter.createFallbackTransport = () => createSmtpTransport({
    port: Number(process.env.SMTP_FALLBACK_PORT || 465),
    secure: String(process.env.SMTP_FALLBACK_SECURE || 'true') === 'true'
});

module.exports = transporter;
