import jwt from 'jsonwebtoken';
import { sendEmail } from '../lib/email.js'; // Adjust as needed
import { createToken, hashPassword, verifyPassword } from '../lib/jwt.js'; // Adjust as needed
import prisma from '../lib/prisma.js'; // Adjust path as needed

// In-memory stores for OTPs and used tokens
const mobileOtpStore = {};
const emailOtpStore = {};
const usedResetTokens = new Set();

// Signin
export const signin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findFirst({
      where: { email, isVerified: true },
    });
    if (user) {
      if (!password || !verifyPassword(password, user.password)) {
        return res.json({
          success: false,
          message: 'Incorrect email or password.',
        });
      }
      console.log('user.id', user.id)
      const token = createToken(String(user.id));
      console.log('token', token)
      const userObj = { ...user };
      delete userObj.password;
      return res.json({ success: true, token, user: userObj });
    } else {
      return res.json({
        success: false,
        message: 'Unable to get your account. Please create new one.',
      });
    }
  } catch (error) {
    return res.json({
      success: false,
      message: error.message,
    });
  }
};

// Register
export const register = async (req, res) => {
  try {
    // The validation for error comes from middleware, but keeping try to catch runtime errors
    // Assuming input from validated req.body
    const input = req.body;

    // Check if email or mobile already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { mobile: input.mobile }],
      },
    });
    if (existingUser) {
      return res.json({
        success: false,
        message: 'The email or mobile already exists.',
      });
    }
    if (input.password !== input.confirm_password) {
      return res.json({
        success: false,
        message: 'Password not matching with confirm password.',
      });
    }

    const payload = { ...input };
    payload.password = hashPassword(payload.password);
    delete payload.confirm_password;
    delete payload.createdAt;
    delete payload.updatedAt;

    const user = await prisma.user.create({ data: payload });

    const newUser = await prisma.user.findFirst({ where: { id: user.id } });
    if (newUser.password) delete newUser.password;
    return res.status(201).json({
      success: true,
      token: createToken(String(user.id)),
      user: newUser,
      message: 'Your account has been created.',
    });
  } catch (error) {
    return res.json({
      success: false,
      message: `Something is wrong: ${error.toString()}`,
    });
  }
};

// Mobile OTP: send and verify
export const sendMobileOTP = async (req, res) => {
  try {
    const { mobile } = req.body;
    // Generate a 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000)).padStart(
      6,
      '0'
    );
    mobileOtpStore[mobile] = otp;
    // TODO: Integrate with SMS gateway
    return res.json({
      success: true,
      message: `OTP sent to ${mobile}.`,
      otp, // Remove this field in production!
    });
  } catch (error) {
    return res.json({
      success: false,
      message: error.message || 'Failed to send mobile OTP.',
    });
  }
};

export const verifyMobileOTP = async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    const expectedOtp = mobileOtpStore[mobile];
    if (!expectedOtp) {
      return res.json({
        success: false,
        message: 'OTP not requested for this mobile.',
      });
    }
    if (otp === expectedOtp) {
      delete mobileOtpStore[mobile];
      return res.json({ success: true, message: 'OTP verified successfully.' });
    } else {
      return res.json({ success: false, message: 'Invalid OTP.' });
    }
  } catch (error) {
    return res.json({
      success: false,
      message: error.message || 'Failed to verify mobile OTP.',
    });
  }
};

// Email OTP: send and verify
export const sendEmailOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const otp = String(Math.floor(100000 + Math.random() * 900000)).padStart(
      6,
      '0'
    );
    emailOtpStore[email] = otp;

    const subject = 'Your OTP for Verification';
    const body = `Your verification OTP is: ${otp}`;

    await sendEmail({
      to: email,
      subject,
      text: body,
      // You may want to send HTML here as well if desired: html: ...
    });
    return res.json({
      success: true,
      message: `OTP sent to ${email}.`,
    });
  } catch (e) {
    return res.json({ message: `Failed to send email: ${e}`, success: false });
  }
};

export const verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const expectedOtp = emailOtpStore[email];
    if (!expectedOtp) {
      return res.json({
        success: false,
        message: 'OTP not requested for this email.',
      });
    }
    if (otp === expectedOtp) {
      delete emailOtpStore[email];
      return res.json({
        success: true,
        message: 'Email OTP verified successfully.',
      });
    } else {
      return res.json({ success: false, message: 'Invalid OTP.' });
    }
  } catch (error) {
    return res.json({
      success: false,
      message: error.message || 'Failed to verify email OTP.',
    });
  }
};

// Forgot password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findFirst({ where: { email } });
    // Don't reveal if email doesn't exist
    if (!user) {
      return res.json({
        success: true,
        message:
          "If an account with that email exists, you'll receive a password reset link.",
      });
    }
    // Expire in 30 minutes
    const exp = Math.floor(Date.now() / 1000) + 30 * 60;
    const token = jwt.sign(
      {
        sub: String(user.id),
        email,
        exp,
        type: 'reset',
      },
      process.env.JWT_SECRET
    );

    const resetLink = `${process.env.CLIENT_ORIGIN}/reset-password?token=${token}&email=${email}`;

    const subject = 'Reset Your Password';
    const body = `
      <html>
        <body style="font-family:Arial,sans-serif; background-color:#f7f7f7; color:#333; padding:32px;">
          <div style="max-width:520px; background:white; margin:0 auto; border-radius:8px; box-shadow:0 3px 14px rgba(128,0,128,0.16),0 1.5px 4px rgba(128,0,128,0.08); padding:32px;">
            <h2 style="color:#6c2eb8; margin-bottom:16px;">Reset Your Password</h2>
            <p>Hello ${user.name},</p>
            <p>
              We received a request to reset your password. 
              Please use the button below to reset your password. This link can only be used once and will expire in 30 minutes.
            </p>
            <div style="text-align:center; margin:32px 0;">
              <a href="${resetLink}" 
                 style="
                    display:inline-block; 
                    padding:16px 32px; 
                    background-color:#6c2eb8; 
                    color:#fff; 
                    font-weight:bold; 
                    font-size:16px; 
                    border-radius:6px; 
                    text-decoration:none;
                    box-shadow:0 2px 8px rgba(108,46,184,0.10);">
                Reset Password
              </a>
            </div>
            <p style="color:#888;font-size:13px;">
              If you did not request this, please ignore this email.<br>
              — ${process.env.APP_NAME} Team
            </p>
          </div>
        </body>
      </html>
    `;

    await sendEmail({
      to: email,
      subject,
      html: body,
    });
    return res.json({
      success: true,
      message:
        "If an account with that email exists, you'll receive a password reset link.",
    });
  } catch (e) {
    return res.json({
      message: `Failed to send reset email: ${e}`,
      success: false,
    });
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  try {
    const { token, new_password } = req.body;
    // Check if token is already used
    if (usedResetTokens.has(token)) {
      return res.json({
        success: false,
        message: "You've already changed your password.",
      });
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.type !== 'reset') {
        return res.json({ success: false, message: 'Invalid reset token.' });
      }
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.json({
          success: false,
          message: "You're link has expired. Please request a new one.",
        });
      }
      return res.json({
        success: false,
        message: "You're link is invalid. Please request a new one.",
      });
    }

    const userId = parseInt(payload.sub);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.json({ success: false, message: 'User not found.' });
    }
    usedResetTokens.add(token);
    const hashedPw = hashPassword(new_password);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPw },
    });
    return res.json({
      success: true,
      message: 'Password has been reset successfully.',
    });
  } catch (error) {
    return res.json({
      success: false,
      message: error.message || 'Failed to reset password.',
    });
  }
};
