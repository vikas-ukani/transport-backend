import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { createRazorPayOrder } from "../payments/razorpay.js";

export const createGaragePayOrder = async (req, res) => {
  try {
    const userId = req.userId;

    const setting = await prisma.systemSetting.findFirst();

    const PAY_AMOUNT = setting.garageCreateAmount;

    // Try to find the user in your database (for customer_details in Razorpay order)
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        name: true,
        mobile: true,
        email: true,
      },
    });

    const order = await createRazorPayOrder({
      amount: PAY_AMOUNT,
      receipt: `garage_${userId}`,
      notes: {
        userId: userId || "",
        payAmount: PAY_AMOUNT,
      },
      customer_details: {
        name: user?.name || "",
        contact: user?.mobile || "",
        email: user?.email || "",
      },
    });

    await prisma.paymentTransaction.create({
      data: {
        amount: Number(PAY_AMOUNT),
        status: "PENDING",
        userId: userId,
        purpose: order.receipt,
        paymentId: null,
        orderId: order.id,
      },
    });

    return res.json({
      success: true,
      order,
      payAmount: PAY_AMOUNT,
    });
  } catch (e) {
    console.log("e.message", e.message);
    return res.json({
      success: false,
      message: e.message,
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_SECRET_KEY || "YOUR_RAZORPAY_KEY_SECRET",
      )
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      // Update the booking record with the razorpay_payment_id in paymentId field

      // Find the related PaymentTransaction by orderId, update if found
      const paymentTxn = await prisma.paymentTransaction.findFirst({
        where: { orderId: razorpay_order_id, status: "PENDING" },
      });

      if (paymentTxn) {
        await prisma.paymentTransaction.update({
          where: { id: paymentTxn.id },
          data: {
            paymentId: razorpay_payment_id,
            status: "SUCCESS",
          },
        });
      }

      res.status(200).json({
        success: true,
        data: {
          razorpay_payment_id,
          razorpay_order_id,
        },
        message: "Payment verified successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Payment has been failed.",
      });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify payment.",
      error: error.message,
    });
  }
};

export const verifyBookingPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    const { bookingId } = req.params;
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_SECRET_KEY || "YOUR_RAZORPAY_KEY_SECRET",
      )
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      // Update the booking record with the razorpay_payment_id in paymentId field
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          paymentId: razorpay_payment_id,
        },
      });
      // Find the related PaymentTransaction by orderId, update if found
      const paymentTxn = await prisma.paymentTransaction.findFirst({
        where: { orderId: razorpay_order_id, status: "PENDING", bookingId },
      });

      if (paymentTxn) {
        await prisma.paymentTransaction.update({
          where: { id: paymentTxn.id },
          data: {
            paymentId: razorpay_payment_id,
            status: "SUCCESS",
          },
        });
      }

      res
        .status(200)
        .json({ success: true, message: "Payment verified successfully" });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid signature, payment verification failed",
      });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify payment.",
      error: error.message,
    });
  }
};
