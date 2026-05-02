import crypto from "crypto";
import Razorpay from "razorpay";

let razorpaySingleton = null;

export function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
  }
  if (!razorpaySingleton) {
    razorpaySingleton = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpaySingleton;
}

export function getRazorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID || "";
}

export function paymentCurrency() {
  return (process.env.PAYMENT_CURRENCY || "inr").toLowerCase();
}

export function bookingPaymentAmountCents() {
  const n = parseInt(process.env.BOOKING_AMOUNT_CENTS || "500", 10);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export function vehicleRegistrationFeeCents() {
  const n = parseInt(process.env.VEHICLE_REGISTRATION_FEE_CENTS || "1000", 10);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

export function walletTopupMinCents() {
  const n = parseInt(process.env.WALLET_TOPUP_MIN_CENTS || "100", 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function walletTopupMaxCents() {
  const n = parseInt(process.env.WALLET_TOPUP_MAX_CENTS || "10000000", 10);
  return Number.isFinite(n) && n > 0 ? n : 10000000;
}

export function verifyRazorpaySignature({
  orderId,
  paymentId,
  signature,
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}
