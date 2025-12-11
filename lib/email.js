import nodemailer from 'nodemailer';

/**
 * Sends an email using nodemailer and environment SMTP config.
 * @param {Object} params
 * @param {string|string[]} params.to - Recipient email(s)
 * @param {string} params.subject - Email subject
 * @param {string} [params.text] - Plain text body
 * @param {string} [params.html] - HTML body (preferred)
 * @param {string} [params.from] - Optional from email (defaults to ENV)
 * @returns {Promise<void>}
 */
export async function sendEmail({ to, subject, text, html, from }) {
  // Create reusable transporter object using SMTP transport
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: !!process.env.SMTP_SECURE && process.env.SMTP_SECURE !== 'false', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Optionally accept self-signed
    tls: { rejectUnauthorized: false },
  });

  const mailOptions = {
    from:
      from ||
      process.env.SMTP_FROM ||
      `"${process.env.APP_NAME || 'App'}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message || error}`);
  }
}
