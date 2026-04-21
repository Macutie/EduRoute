const dotenv = require('dotenv');

dotenv.config();

module.exports = {
    port: process.env.PORT || 5000,
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpSecure: String(process.env.SMTP_SECURE) === 'true',
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    mailFrom: process.env.MAIL_FROM,
    resetCodeTtlMinutes: Number(process.env.RESET_CODE_TTL_MINUTES || 15),
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 12)
};