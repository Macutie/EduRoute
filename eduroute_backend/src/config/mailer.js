const nodemailer = require('nodemailer');
const dns = require('dns');
const env = require('./env');

dns.setDefaultResultOrder?.('ipv4first');

const smtpAddressFamily = Number(process.env.SMTP_ADDRESS_FAMILY || 4);
const smtpTimeouts = {
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 20000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 20000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000)
};

const lookupSmtpHost = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, family: smtpAddressFamily }, callback);
};

const createSmtpTransport = (overrides = {}) => nodemailer.createTransport({
    host: overrides.host || env.smtpHost,
    port: overrides.port || env.smtpPort,
    secure: typeof overrides.secure === 'boolean' ? overrides.secure : env.smtpSecure,
    family: smtpAddressFamily,
    lookup: lookupSmtpHost,
    ...smtpTimeouts,
    tls: {
        servername: overrides.host || env.smtpHost
    },
    auth: {
        user: env.smtpUser,
        pass: env.smtpPass
    }
});

const transporter = createSmtpTransport();

transporter.getSafeConfig = () => ({
    host: env.smtpHost || null,
    port: env.smtpPort || null,
    secure: env.smtpSecure,
    addressFamily: smtpAddressFamily,
    fallbackPort: Number(process.env.SMTP_FALLBACK_PORT || 465),
    fallbackSecure: String(process.env.SMTP_FALLBACK_SECURE || 'true') === 'true',
    hasUser: Boolean(env.smtpUser),
    hasPassword: Boolean(env.smtpPass),
    hasMailFrom: Boolean(env.mailFrom),
    ...smtpTimeouts
});

transporter.createFallbackTransport = () => createSmtpTransport({
    port: Number(process.env.SMTP_FALLBACK_PORT || 465),
    secure: String(process.env.SMTP_FALLBACK_SECURE || 'true') === 'true'
});

module.exports = transporter;
