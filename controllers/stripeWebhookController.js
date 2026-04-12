import prisma from "../lib/prisma.js";
import { getStripe } from "../lib/stripe.js";

async function refundWalletDebitFromIntent(paymentIntent) {
  const md = paymentIntent.metadata || {};
  const userId = md.userId;
  const raw = md.walletDebitedAtIntentCents;
  const n = raw ? parseInt(raw, 10) : 0;
  if (!userId || !Number.isFinite(n) || n <= 0) return;
  await prisma.user.update({
    where: { id: userId },
    data: { walletBalanceCents: { increment: n } },
  });
}

async function handlePaymentSucceeded(paymentIntent) {
  const md = paymentIntent.metadata || {};
  const purpose = md.purpose;
  const userId = md.userId;
  if (purpose === "wallet_topup") {
    if (!userId) return;
    await prisma.user.update({
      where: { id: userId },
      data: { walletBalanceCents: { increment: paymentIntent.amount } },
    });
    return;
  }

  if (purpose === "booking_payment" && md.bookingId) {
    const booking = await prisma.booking.findFirst({
      where: { id: md.bookingId, customerId: userId },
    });
    if (!booking || booking.paymentStatus === "Paid") return;
    const totalFromMd = md.totalCents ? parseInt(md.totalCents, 10) : NaN;
    await prisma.booking.update({
      where: { id: md.bookingId },
      data: {
        paymentStatus: "Paid",
        stripePaymentIntentId: paymentIntent.id,
        paymentAmountCents: Number.isFinite(totalFromMd) ? totalFromMd : null,
      },
    });
    return;
  }

  if (purpose === "vehicle_registration" && md.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: md.vehicleId, ownerId: userId },
    });
    if (!vehicle || vehicle.registrationPaid) return;
    await prisma.vehicle.update({
      where: { id: md.vehicleId },
      data: {
        registrationPaid: true,
        stripePaymentIntentId: paymentIntent.id,
      },
    });
  }
}

export const handleStripeWebhook = async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"];
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return res.status(500).send("Webhook not configured");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, whSecret);
  } catch (err) {
    console.error("Stripe webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        await handlePaymentSucceeded(pi);
        break;
      }
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const pi = event.data.object;
        await refundWalletDebitFromIntent(pi);
        if (pi.metadata?.purpose === "booking_payment" && pi.metadata?.bookingId) {
          await prisma.booking.updateMany({
            where: {
              id: pi.metadata.bookingId,
              paymentStatus: { not: "Paid" },
            },
            data: { paymentStatus: "Failed" },
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("Stripe webhook handler error:", e);
    return res.status(500).json({ received: false });
  }

  return res.json({ received: true });
};
