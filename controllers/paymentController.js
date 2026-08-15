
import crypto from "crypto";
import prisma from "../lib/prisma.js";

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
