import prisma from "../lib/prisma.js";
import {
    bookingPaymentAmountCents,
    getStripe,
    getStripePublishableKey,
    stripeCurrency,
    vehicleRegistrationFeeCents,
} from "../lib/stripe.js";
import { emitToBookingRoom, sendNotificationToUser } from "../socket/socket.js";

// Must match the Stripe API version used by your `stripe` Node package (see node_modules/stripe/esm/apiVersion.js).
const EPHEMERAL_KEY_API_VERSION =
  process.env.STRIPE_API_VERSION || "2025-08-27.basil";

async function ensureStripeCustomer(user) {
  const stripe = getStripe();
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  });
  console.log("ensureStripeCustomer customer", customer);
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export const getWalletBalance = async (req, res) => {
  try {
    // Retrieve the user including their Stripe customerId
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        walletBalanceCents: true,
        stripeCustomerId: true,
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    console.log("user.stripeCustomerId", user.stripeCustomerId);
    // Ensure we have a Stripe customer
    const stripe = getStripe();
    let { stripeCustomerId } = user;
    // Fetch wallet balance from Stripe (as the "wallet" balance/upcoming balance or custom Stripe balance)
    // Example assumes you're using customer "balance" (Stripe credit, which is negative for owed, positive for credit)
    const customerId = await ensureStripeCustomer(user);
    const customer = await stripe.customers.retrieve(customerId);
    const stripeWalletBalanceCents =
      typeof customer.balance === "number" ? -customer.balance : 0;
    // Stripe's .balance is in cents, but credit is represented as a _negative_ number, so negate.
    console.log("stripeWalletBalanceCents", stripeWalletBalanceCents);
    // Update latest walletBalanceCents in DB if it's out of sync
    if (stripeWalletBalanceCents !== user.walletBalanceCents) {
      await prisma.user.update({
        where: { id: user.id },
        data: { walletBalanceCents: stripeWalletBalanceCents },
      });
    }
    return res.json({
      success: true,
      walletBalanceCents:
        stripeWalletBalanceCents !== null
          ? stripeWalletBalanceCents
          : (user?.walletBalanceCents ?? 0),
      currency: stripeCurrency(),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const getStripeConfig = async (req, res) => {
  try {
    const pk = getStripePublishableKey();
    if (!pk) {
      return res.status(503).json({
        success: false,
        message:
          "Stripe publishable key is not configured (STRIPE_PUBLISHABLE_KEY).",
      });
    }
    return res.json({
      success: true,
      publishableKey: pk,
      currency: stripeCurrency(),
      bookingAmountCents: bookingPaymentAmountCents(),
      vehicleRegistrationFeeCents: vehicleRegistrationFeeCents(),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

/**
 * Booking and vehicle registration are paid **only** from in-app wallet.
 * If balance is insufficient, returns 400 INSUFFICIENT_WALLET (no card charge).
 * Wallet top-ups use Stripe Payment Sheet only.
 */
export const createStripePaymentSheet = async (req, res) => {
  try {
    const { type, bookingId, vehicleId, amountCents } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const currency = stripeCurrency();
    let totalCents = 0;

    if (type === "booking_payment") {
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, customerId: req.userId },
      });
      if (!booking) {
        return res
          .status(404)
          .json({ success: false, message: "Booking not found." });
      }
      if (booking.paymentStatus === "Paid") {
        return res
          .status(400)
          .json({ success: false, message: "Booking is already paid." });
      }

      const mustBidFirst = booking.biddingOpen === true;
      const agreed =
        booking.paymentAmountCents != null && booking.paymentAmountCents > 0;
      if (mustBidFirst && !agreed) {
        return res.status(400).json({
          success: false,
          code: "BID_REQUIRED",
          message:
            "Accept a driver bid before paying. Open your booking to review bids.",
        });
      }
      totalCents = agreed
        ? booking.paymentAmountCents
        : bookingPaymentAmountCents();

      const balance = user.walletBalanceCents ?? 0;
      if (balance < totalCents) {
        return res.status(400).json({
          success: false,
          code: "INSUFFICIENT_WALLET",
          message:
            "Insufficient wallet balance. Add funds to your wallet before paying.",
          requiredCents: totalCents,
          walletBalanceCents: balance,
        });
      }

      await prisma.$transaction(async (tx) => {
        const fresh = await tx.user.findUnique({ where: { id: user.id } });
        if (!fresh || fresh.walletBalanceCents < totalCents) {
          throw new Error("INSUFFICIENT_WALLET_RACE");
        }
        await tx.user.update({
          where: { id: user.id },
          data: { walletBalanceCents: { decrement: totalCents } },
        });
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: "Paid",
            paymentAmountCents: totalCents,
          },
        });
      });

      try {
        const b = await prisma.booking.findUnique({
          where: { id: bookingId },
          select: { assignedDriverUserId: true },
        });
        emitToBookingRoom(bookingId, "booking:payment", {
          bookingId,
          paymentStatus: "Paid",
          totalCents,
        });
        if (b?.assignedDriverUserId) {
          sendNotificationToUser(b.assignedDriverUserId, {
            type: "booking_paid",
            title: "Booking paid",
            message:
              "The customer paid from their wallet. You can proceed with the transport.",
            data: { bookingId },
          });
        }
      } catch (e) {
        console.warn("booking payment socket", e.message);
      }

      return res.json({
        success: true,
        paidWithWalletOnly: true,
        totalCents,
        walletAppliedCents: totalCents,
        stripeChargeCents: 0,
        currency,
      });
    }

    if (type === "vehicle_registration") {
      totalCents = vehicleRegistrationFeeCents();
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, ownerId: req.userId },
      });
      if (!vehicle) {
        return res
          .status(404)
          .json({ success: false, message: "Vehicle not found." });
      }
      if (vehicle.registrationPaid) {
        return res.status(400).json({
          success: false,
          message: "Registration fee already paid for this vehicle.",
        });
      }

      const balance = user.walletBalanceCents ?? 0;
      if (balance < totalCents) {
        return res.status(400).json({
          success: false,
          code: "INSUFFICIENT_WALLET",
          message:
            "Insufficient wallet balance. Add funds to your wallet before paying.",
          requiredCents: totalCents,
          walletBalanceCents: balance,
        });
      }

      await prisma.$transaction(async (tx) => {
        const fresh = await tx.user.findUnique({ where: { id: user.id } });
        if (!fresh || fresh.walletBalanceCents < totalCents) {
          throw new Error("INSUFFICIENT_WALLET_RACE");
        }
        await tx.user.update({
          where: { id: user.id },
          data: { walletBalanceCents: { decrement: totalCents } },
        });
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { registrationPaid: true },
        });
      });

      return res.json({
        success: true,
        paidWithWalletOnly: true,
        totalCents,
        walletAppliedCents: totalCents,
        stripeChargeCents: 0,
        currency,
      });
    }

    if (type === "wallet_topup") {
      const min = parseInt(
        process.env.STRIPE_WALLET_TOPUP_MIN_CENTS || "100",
        10,
      );
      const max = parseInt(
        process.env.STRIPE_WALLET_TOPUP_MAX_CENTS || "10000000",
        10,
      );
      totalCents = amountCents;
      if (
        !Number.isInteger(totalCents) ||
        totalCents < min ||
        totalCents > max
      ) {
        return res.status(400).json({
          success: false,
          message: `Top-up amount must be between ${min} and ${max} cents.`,
        });
      }

      const pk = getStripePublishableKey();
      if (!pk) {
        return res.status(503).json({
          success: false,
          message: "Stripe is not configured (STRIPE_PUBLISHABLE_KEY).",
        });
      }

      const stripe = getStripe();
      const customerId = await ensureStripeCustomer(user);

      const metadata = {
        userId: user.id,
        purpose: type,
        walletDebitedAtIntentCents: totalCents,
      };

      // For wallet top-up, create a PaymentIntent so the client can complete the top-up using Stripe payment sheet.
      // This is not an immediate wallet balance adjustment, but an initiation of a payment flow to later credit the wallet.

      if (customerId) {
        await stripe.customers.update(customerId, {
          metadata,
        });
      }

      // Create PaymentIntent for the wallet top-up amount
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalCents,
        currency,
        customer: customerId,
        metadata,
        description: "Wallet top-up",
        payment_method_types: ["card", "upi", "google_pay"], // allowed Stripe payment methods
        automatic_payment_methods: {
          enabled: true,
        },
        confirm: true,
        payment_method: "wallet",
      });

      // Create ephemeral key for the client to securely access/update payment methods via mobile Stripe SDK
      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: EPHEMERAL_KEY_API_VERSION },
      );

      return res.json({
        success: true,
        paidWithWalletOnly: false,
        paymentIntentClientSecret: paymentIntent.client_secret,
        ephemeralKeySecret: ephemeralKey.secret,
        customerId,
        publishableKey: pk,
        totalCents,
        walletAppliedCents: 0,
        stripeChargeCents: totalCents,
        currency,
      });
    }

    return res
      .status(400)
      .json({ success: false, message: "Invalid payment type." });
  } catch (e) {
    console.error("createStripePaymentSheet:", e);
    if (e.message === "INSUFFICIENT_WALLET_RACE") {
      return res.status(400).json({
        success: false,
        code: "INSUFFICIENT_WALLET",
        message:
          "Insufficient wallet balance. Add funds to your wallet before paying.",
      });
    }
    return res.status(500).json({
      success: false,
      message: e.message || "Failed to create payment session.",
    });
  }
};
