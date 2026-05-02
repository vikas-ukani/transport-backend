import prisma from "../lib/prisma.js";
import {
  bookingPaymentAmountCents,
  getRazorpay,
  getRazorpayKeyId,
  paymentCurrency,
  vehicleRegistrationFeeCents,
  verifyRazorpaySignature,
  walletTopupMaxCents,
  walletTopupMinCents,
} from "../lib/razorpay.js";
import { emitToBookingRoom, sendNotificationToUser } from "../socket/socket.js";

export const getWalletBalance = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, walletBalanceCents: true },
    });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
    return res.json({
      success: true,
      walletBalanceCents: user.walletBalanceCents ?? 0,
      currency: paymentCurrency(),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const getRazorpayConfig = async (req, res) => {
  try {
    const keyId = getRazorpayKeyId();
    if (!keyId) {
      return res.status(503).json({
        success: false,
        message: "Razorpay key is not configured (RAZORPAY_KEY_ID).",
      });
    }
    return res.json({
      success: true,
      keyId,
      currency: paymentCurrency(),
      bookingAmountCents: bookingPaymentAmountCents(),
      vehicleRegistrationFeeCents: vehicleRegistrationFeeCents(),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const createPaymentAction = async (req, res) => {
  try {
    const { type, bookingId, vehicleId } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
    const currency = paymentCurrency();
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
      totalCents = agreed ? booking.paymentAmountCents : bookingPaymentAmountCents();

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
        gatewayChargeCents: 0,
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
        gatewayChargeCents: 0,
        currency,
      });
    }

    return res
      .status(400)
      .json({ success: false, message: "Invalid payment type." });
  } catch (e) {
    console.error("createPaymentAction:", e);
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
      message: e.message || "Failed to complete payment action.",
    });
  }
};

export const createRazorpayWalletTopupOrder = async (req, res) => {
  try {
    const { amountCents } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
    const min = walletTopupMinCents();
    const max = walletTopupMaxCents();
    if (!Number.isInteger(amountCents) || amountCents < min || amountCents > max) {
      return res.status(400).json({
        success: false,
        message: `Top-up amount must be between ${min} and ${max} cents.`,
      });
    }

    const razorpay = getRazorpay();
    const receipt = `wallet_${user.id}`;
    const order = await razorpay.orders.create({
      amount: amountCents,
      currency: paymentCurrency().toUpperCase(),
      receipt,
      notes: {
        userId: user.id,
        purpose: "wallet_topup",
      },
    });
    console.log('order', order)

    return res.json({
      success: true,
      orderId: order.id,
      amountCents,
      currency: paymentCurrency(),
      keyId: getRazorpayKeyId(),
      user: {
        name: user.name,
        email: user.email,
        contact: user.mobile,
      },
    });
  } catch (e) {
    console.error("createRazorpayWalletTopupOrder:", e);
    return res.status(500).json({
      success: false,
      message: e.message || "Failed to create Razorpay order.",
    });
  }
};

export const verifyRazorpayWalletTopup = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, amountCents } =
      req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay verification details.",
      });
    }
    const ok = verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });
    if (!ok) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment signature." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const topup = await prisma.walletTopup.findUnique({
      where: { razorpayPaymentId },
    });
    if (topup) {
      return res.json({
        success: true,
        alreadyProcessed: true,
        walletBalanceCents: user.walletBalanceCents ?? 0,
        currency: paymentCurrency(),
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.walletTopup.create({
        data: {
          userId: user.id,
          amountCents,
          currency: paymentCurrency(),
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          status: "captured",
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { walletBalanceCents: { increment: amountCents } },
      });
    });

    const refreshed = await prisma.user.findUnique({
      where: { id: user.id },
      select: { walletBalanceCents: true },
    });
    return res.json({
      success: true,
      walletBalanceCents: refreshed?.walletBalanceCents ?? 0,
      currency: paymentCurrency(),
    });
  } catch (e) {
    console.error("verifyRazorpayWalletTopup:", e);
    return res.status(500).json({
      success: false,
      message: e.message || "Failed to verify Razorpay payment.",
    });
  }
};
