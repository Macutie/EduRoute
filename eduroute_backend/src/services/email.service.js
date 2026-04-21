const transporter = require('../config/mailer');
const env = require('../config/env');

const sendResetCodeEmail = async ({ to, fullName, resetCode }) => {
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

    return transporter.sendMail({
        from: env.mailFrom,
        to,
        subject: 'EduRoute Password Reset Code',
        html
    });
};

module.exports = {
    sendResetCodeEmail
};