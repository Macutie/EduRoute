const transporter = require('../config/mailer');
const env = require('../config/env');

const RESET_EMAIL_TIMEOUT_MS = Number(process.env.RESET_EMAIL_TIMEOUT_MS || 30000);

const assertMailerConfigured = () => {
    if (!env.smtpHost || !env.smtpUser || !env.smtpPass || !env.mailFrom) {
        throw new Error('SMTP is not configured for password recovery emails.');
    }
};

const sendMailWithTimeout = async (mailOptions, mailTransporter = transporter) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error('Password recovery email request timed out.'));
        }, RESET_EMAIL_TIMEOUT_MS);
    });

    try {
        return await Promise.race([mailTransporter.sendMail(mailOptions), timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
};

const shouldRetryWithFallbackSmtp = (error) => {
    const code = String(error?.code || '');
    const command = String(error?.command || '');
    const message = String(error?.message || '');

    return ['ESOCKET', 'ETIMEDOUT', 'ECONNECTION'].includes(code)
        || command === 'CONN'
        || /ENETUNREACH|ETIMEDOUT|ECONNREFUSED|Connection timeout/i.test(message);
};

const sendResetCodeEmail = async ({ to, fullName, resetCode }) => {
    assertMailerConfigured();

    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
      <h2>EduRoute Faculty Portal Password Reset</h2>
      <p>Hello ${fullName || 'Faculty Member'},</p>
      <p>You requested to reset your password. Use the code below to continue:</p>
      <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 20px 0; color: #059669;">
        ${resetCode}
      </div>
      <p>This code will expire in ${env.resetCodeTtlMinutes} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

    const mailOptions = {
        from: env.mailFrom,
        to,
        subject: 'EduRoute Password Reset Code',
        html
    };

    const safeMailerConfig = typeof transporter.getSafeConfig === 'function'
        ? transporter.getSafeConfig()
        : null;

    const primaryTransporter = typeof transporter.createIpv4Transport === 'function'
        ? await transporter.createIpv4Transport()
        : transporter;

    try {
        return await sendMailWithTimeout(mailOptions, primaryTransporter);
    } catch (error) {
        if (!shouldRetryWithFallbackSmtp(error) || typeof transporter.createFallbackTransport !== 'function') {
            throw error;
        }

        console.warn('Primary SMTP transport failed; retrying with fallback SMTP transport:', {
            code: error?.code,
            command: error?.command,
            message: error?.message,
            smtp: safeMailerConfig
        });

        const fallbackTransporter = typeof transporter.createIpv4FallbackTransport === 'function'
            ? await transporter.createIpv4FallbackTransport()
            : transporter.createFallbackTransport();
        try {
            return await sendMailWithTimeout(mailOptions, fallbackTransporter);
        } catch (fallbackError) {
            console.error('Fallback SMTP transport failed:', {
                code: fallbackError?.code,
                command: fallbackError?.command,
                message: fallbackError?.message,
                smtp: safeMailerConfig
            });
            throw fallbackError;
        }
    }
};

module.exports = {
    sendResetCodeEmail
};
