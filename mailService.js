const nodemailer = require('nodemailer');

const getMailConfig = () => {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  const from = process.env.MAIL_FROM || user;
  const secure = String(process.env.MAIL_SECURE || '').toLowerCase() === 'true' || port === 465;

  if (!host || !port || !user || !pass || !from) {
    return { isConfigured: false };
  }

  return {
    isConfigured: true,
    host,
    port,
    secure,
    auth: { user, pass },
    from,
  };
};

const getTransporter = () => {
  const config = getMailConfig();
  if (!config.isConfigured) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
};

const sendOtpEmail = async ({ to, fullName, otp, expiresInMinutes = 5 }) => {
  const config = getMailConfig();
  if (!config.isConfigured) {
    throw new Error(
      'Email delivery is not configured. Add MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, and MAIL_FROM in server/.env.'
    );
  }

  const transporter = getTransporter();

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin:0 0 12px; color:#0b2c66;">School Management ERP - OTP Verification</h2>
      <p>Hello ${fullName || 'User'},</p>
      <p>Your one-time verification code is:</p>
      <div style="margin: 14px 0; font-size: 30px; font-weight: 700; letter-spacing: 6px; color:#0b2c66;">
        ${otp}
      </div>
      <p>This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p>If you did not attempt to sign in, please contact your administrator immediately.</p>
      <p style="margin-top:18px;">Regards,<br/>School Management ERP Security</p>
    </div>
  `;

  await transporter.sendMail({
    from: config.from,
    to,
    subject: 'Your School ERP OTP Code',
    html,
    text: `Your School ERP OTP code is ${otp}. It expires in ${expiresInMinutes} minutes.`,
  });
};

module.exports = {
  getMailConfig,
  sendOtpEmail,
};

