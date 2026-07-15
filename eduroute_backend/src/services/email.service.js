const env = require('../config/env');

const BREVO_SEND_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';

const assertEmailConfigured = () => {
    if (!env.brevoApiKey || /^your_/i.test(String(env.brevoApiKey).trim())) {
        throw new Error('BREVO_API_KEY is missing');
    }

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

const parseEmailFrom = (value = '') => {
    const trimmedValue = String(value || '').trim();
    const match = trimmedValue.match(/^(.*?)\s*<([^<>@\s]+@[^<>@\s]+)>$/);

    if (match) {
        return {
            name: match[1].trim() || 'EduRoute',
            email: match[2].trim()
        };
    }

    return {
        name: 'EduRoute',
        email: trimmedValue
    };
};

const parseBrevoErrorMessage = async (response) => {
    try {
        const data = await response.json();
        return data?.message || data?.error || JSON.stringify(data);
    } catch (error) {
        return response.statusText || 'Brevo rejected the password reset email request';
    }
};

const sendResetCodeEmail = async ({ to, fullName, resetCode }) => {
    assertEmailConfigured();

    const safeName = escapeHtml(fullName || 'Faculty Member');
    const sender = parseEmailFrom(env.emailFrom);
    const htmlContent = `
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
    `;
    const textContent = `Your EduRoute password reset PIN is ${resetCode}. This PIN will expire in ${env.resetCodeTtlMinutes} minutes.`;

    const response = await fetch(BREVO_SEND_EMAIL_URL, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': env.brevoApiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender,
            to: [{ email: to, name: fullName || undefined }],
            subject: 'EduRoute Password Reset PIN',
            htmlContent,
            textContent
        })
    });

    if (!response.ok) {
        const message = await parseBrevoErrorMessage(response);
        throw new Error(message || 'Failed to send password reset email using Brevo');
    }

    return response.json();
};

module.exports = {
    sendResetCodeEmail
};
