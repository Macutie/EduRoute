const { Resend } = require('resend');
const env = require('../config/env');

const getResendClient = () => {
    if (!env.resendApiKey) {
        throw new Error('RESEND_API_KEY is missing');
    }

    return new Resend(env.resendApiKey);
};

const assertEmailConfigured = () => {
    if (!env.emailFrom) {
        throw new Error('EMAIL_FROM is missing');
    }
};

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendResetCodeEmail = async ({ to, fullName, resetCode }) => {
    assertEmailConfigured();

    const resend = getResendClient();
    const safeName = escapeHtml(fullName || 'Faculty Member');

    const { data, error } = await resend.emails.send({
        from: env.emailFrom,
        to,
        subject: 'EduRoute Password Reset PIN',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
              <h2>EduRoute Password Reset</h2>
              <p>Hello ${safeName},</p>
              <p>Your 6-digit password reset PIN is:</p>
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 16px 0; color: #059669;">
                ${resetCode}
              </div>
              <p>This PIN will expire in ${env.resetCodeTtlMinutes} minutes.</p>
              <p>If you did not request this password reset, please ignore this email.</p>
            </div>
        `,
        text: `Your EduRoute password reset PIN is ${resetCode}. This PIN will expire in ${env.resetCodeTtlMinutes} minutes.`
    });

    if (error) {
        throw new Error(error.message || 'Failed to send password reset email using Resend');
    }

    return data;
};

module.exports = {
    sendResetCodeEmail
};
