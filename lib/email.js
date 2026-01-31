import nodemailer from "nodemailer";

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
  console.log('process.env.SMTP_HOST', process.env.SMTP_SERVER)
  try {
    // Create reusable transporter object using SMTP transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_SERVER,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      secure: !!process.env.SMTP_SECURE && process.env.SMTP_SECURE !== "false", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
      // Optionally accept self-signed
      tls: { rejectUnauthorized: false },
    });

    const mailOptions = {
      from:
        from ||
        process.env.SMTP_FROM ||
        `"${process.env.SMTP_FROM_NAME || "App"}" <${process.env.SMTP_FROM}>`,
      to,
      subject,
      text,
      html,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("error", error.message || error);
    throw new Error(`Failed to send email: ${error || error}`);
  }
}
