/**
 * Stripe helpers. In-app charges for bookings and vehicle registration use
 * wallet balance only (see stripePaymentController); Stripe PaymentIntents are used for wallet top-up.
 */
import Stripe from "stripe";

let stripeSingleton = null;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeSingleton;
}

export function getStripePublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || "";
}

export function bookingPaymentAmountCents() {
  const n = parseInt(process.env.STRIPE_BOOKING_AMOUNT_CENTS || "500", 10);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export function vehicleRegistrationFeeCents() {
  const n = parseInt(process.env.STRIPE_VEHICLE_REGISTRATION_FEE_CENTS || "1000", 10);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

export function stripeCurrency() {
  return (process.env.STRIPE_CURRENCY || "inr").toLowerCase();
}
