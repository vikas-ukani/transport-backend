import { Router } from "express";
import { validateRequest } from "../../lib/validateRequest.js";
import { loginSchema, registerSchema, sendEmailOTPSchema } from "../../schema/apiSchema.js";
import {
  signin,
  register,
  sendMobileOTP,
  verifyMobileOTP,
  sendEmailOTP,
  verifyEmailOTP,
  forgotPassword,
  resetPassword,
} from "../../controllers/authController.js";

const router = Router();
// Auth Routers
router.post("/signin", validateRequest(loginSchema), signin);
router.post("/register", validateRequest(registerSchema), register);
// OTP
router.post("/mobile-send-otp", sendMobileOTP);
router.post("/mobile-verify-otp", verifyMobileOTP);
router.post("/email-send-otp", sendEmailOTP);
router.post("/email-verify-otp", verifyEmailOTP);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;
