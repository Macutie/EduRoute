const transporter = require('../config/mailer');
const env = require('../config/env');

const RESET_EMAIL_TIMEOUT_MS = Number(process.env.RESET_EMAIL_TIMEOUT_MS || 9000);

const isSmtpConfigured = () => Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.mailFrom);
const isResendConfigured = () => Boolean(env.resendApiKey && env.resendFrom);

const assertEmailDeliveryConfigured = () => {
    if (env.emailProvider === 'resend' && !isResendConfigured()) {
        throw new Error('Resend is not configured for password recovery emails.');
    }

    if (env.emailProvider !== 'resend' && !isSmtpConfigured() && !isResendConfigured()) {
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

const buildResetEmailContent = ({ fullName, resetCode }) => {
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

    return {
        subject: 'EduRoute Password Reset Code',
        html,
        text: [
            `Hello ${fullName || 'Faculty Member'},`,
            '',
            'You requested to reset your EduRoute password.',
            `Your reset code is: ${resetCode}`,
            `This code will expire in ${env.resetCodeTtlMinutes} minutes.`,
            '',
            'If you did not request this, you can ignore this email.'
        ].join('\n')
    };
};

const sendWithResend = async ({ to, subject, html, text }) => {
    if (!isResendConfigured()) {
        throw new Error('Resend is not configured for password recovery emails.');
    }

    if (typeof fetch !== 'function') {
        throw new Error('This Node runtime does not support fetch for Resend email delivery.');
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.resendApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: env.resendFrom,
            to,
            subject,
            html,
            text
        })
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Resend email delivery failed (${response.status}): ${responseText}`);
    }

    return response.json();
};

const sendWithSmtp = async (mailOptions) => {
    if (!isSmtpConfigured()) {
        throw new Error('SMTP is not configured for password recovery emails.');
    }

    try {
        return await sendMailWithTimeout(mailOptions);
    } catch (error) {
        if (!shouldRetryWithFallbackSmtp(error) || typeof transporter.createFallbackTransport !== 'function') {
            throw error;
        }

        console.warn('Primary SMTP transport failed; retrying with fallback SMTP transport:', {
            code: error?.code,
            command: error?.command,
            message: error?.message
        });

        const fallbackTransporter = transporter.createFallbackTransport();
        return sendMailWithTimeout(mailOptions, fallbackTransporter);
    }
};

const sendResetCodeEmail = async ({ to, fullName, resetCode }) => {
    assertEmailDeliveryConfigured();

    const emailContent = buildResetEmailContent({ fullName, resetCode });
    const mailOptions = {
        from: env.mailFrom,
        to,
        ...emailContent
    };

    if (env.emailProvider === 'resend') {
        return sendWithResend({
            to,
            ...emailContent
        });
    }

    try {
        return await sendWithSmtp(mailOptions);
    } catch (error) {
        if (!isResendConfigured() || !shouldRetryWithFallbackSmtp(error)) {
            throw error;
        }

        console.warn('SMTP delivery failed; retrying password recovery email through Resend HTTPS API:', {
            code: error?.code,
            command: error?.command,
            message: error?.message
        });

        return sendWithResend({
            to,
            ...emailContent
        });
    }
};

module.exports = {
    sendResetCodeEmail
};
