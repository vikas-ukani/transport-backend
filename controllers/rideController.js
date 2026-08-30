import prisma from "../lib/prisma.js";
import { createRazorPayOrder } from "../payments/razorpay.js";
import { emitToBookingRoom, sendNotificationToUser } from "../socket/socket.js";
const PARTIAL_AMOUNT_TO_CUT = 50;

/**
 * Customer accepts a bid; agreed price is stored for wallet payment.
 */
export const acceptBookingBid = async (req, res) => {
  try {
    const { id: bookingId, bidId } = req.params;
    const customerId = req.userId;

    if (req.userType !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Only customers can accept bids.",
      });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, customerId },
    });
    if (!booking) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not available." });
    }
    if (!booking.biddingOpen) {
      return res.status(400).json({
        success: false,
        message: "Bidding is already closed for this booking.",
      });
    }

    const bid = await prisma.bookingBid.findFirst({
      where: {
        id: bidId,
        bookingId,
        status: "PENDING",
      },
    });

    if (!bid) {
      return res
        .status(404)
        .json({ success: false, message: "Bid not found." });
    }

    // Get customer (payer) and driver (payee)
    const customer = await prisma.user.findUnique({
      where: { id: booking.customerId },
    });
    const driver = await prisma.user.findUnique({
      where: { id: bid.driverId },
    });

    // Calculate amounts: 50% now, 50% after delivery
    const totalAmountCents = Number(bid.amount);
    const partialAmountCents = Math.floor(
      (totalAmountCents * PARTIAL_AMOUNT_TO_CUT) / 100,
    );

    await prisma.$transaction(async (tx) => {
      await tx.bookingBid.updateMany({
        where: { bookingId, id: { not: bidId } },
        data: { status: "REJECTED" },
      });
      await tx.bookingBid.update({
        where: { id: bidId },
        data: {
          status: "ACCEPTED",
        },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          biddingOpen: false,
          status: "RUNNING",
          assignedDriverUserId: bid.driverId,
          paymentAmountCents: bid.amount,
          finalAmount: String(bid.amount),
        },
      });

      // Log debit transaction for customer
      await tx.walletTransaction.create({
        data: {
          userId: customer.id,
          counterpartyId: driver.id,
          amount: partialAmountCents,
          type: "debit",
          purpose: "ride_payment",
          currency: "inr",
          referenceId: bookingId,
          status: "COMPLETED",
          description: `${PARTIAL_AMOUNT_TO_CUT}% payment debited from customer wallet on bid acceptance`,
        },
      });

      // Log credit transaction for driver
      await tx.walletTransaction.create({
        data: {
          userId: driver.id,
          counterpartyId: customer.id,
          amount: partialAmountCents,
          type: "credit",
          purpose: "ride_payment",
          currency: "inr",
          referenceId: bookingId,
          status: "COMPLETED",
          description: `${PARTIAL_AMOUNT_TO_CUT}% payment credited to driver wallet on bid acceptance`,
        },
      });
    });

    const updated = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        bids: {
          orderBy: { createdAt: "desc" },
          include: {
            driver: {
              select: {
                id: true,
                name: true,
                email: true,
                mobile: true,
              },
            },
          },
        },
      },
    });

    try {
      emitToBookingRoom(bookingId, `booking:${bookingId}`, {
        bookingId,
        bidId,
        booking: updated,
      });
      sendNotificationToUser(bid.driverId, {
        type: "booking_bid_accepted",
        title: "Your bid was accepted",
        message:
          "The customer accepted your price. They may pay from wallet next.",
        data: { bookingId, bidId },
      });
    } catch (e) {
      console.warn("acceptBookingBid socket", e.message);
    }

    return res.json({
      success: true,
      message: "Booking bid accepted. ",
      booking: updated,
    });
  } catch (error) {
    console.error("acceptBookingBid:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to accept bid",
    });
  }
};

/**
 * Verifies the OTP code for completing a ride (delivery).
 * Expects: req.params.id (bookingId), req.params.otp (endRideOTP, as string)
 * Returns: { success: boolean, message?: string }
 */
export const verifyCompleteRide = async (req, res) => {
  const { id: bookingId, otp: otpCode, type } = req.params;

  if (!bookingId || !otpCode) {
    return res.status(400).json({
      success: false,
      message: "Booking ID and OTP code are required.",
    });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        owner: true, // customer info
        bids: {
          where: { status: "ACCEPTED" },
        },
      },
      omit: {
        createdAt: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Already completed?
    if (booking.status === "COMPLETED" || booking.status === "DELIVERED") {
      return res.status(400).json({
        success: false,
        message: "This ride is already completed.",
      });
    }

    if (type === "start" && !booking.startRideOTP) {
      return res.status(400).json({
        success: false,
        message:
          "No start OTP is set for this booking. Please request a new OTP.",
      });
    }
    if (type === "end" && !booking.endRideOTP) {
      return res.status(400).json({
        success: false,
        message:
          "No end OTP is set for this booking. Please request a new OTP.",
      });
    }

    // Check OTP based on type (start/end)
    if (
      (type === "start" &&
        booking.startRideOTP.toString() !== otpCode.toString()) ||
      (type === "end" && booking.endRideOTP.toString() !== otpCode.toString())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP code. Please use correct OTP",
      });
    }

    const acceptedBid = booking.bids[0];
    if (!acceptedBid) {
      throw new Error("No accepted bid found for this booking.");
    }

    // Get driver and customer
    const customer = await prisma.user.findUnique({
      where: { id: booking.customerId },
    });

    const driverId = booking.assignedDriverUserId || acceptedBid.driverId;
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
    });

    if (!customer || !driver) {
      throw new Error("Driver or customer record not found.");
    }

    await prisma.$transaction(async (tx) => {
      // Update booking as completed, clear OTP
      const updateBooking = {
        // status: "COMPLETED",
        // completedAt: new Date(),
        // startRideOTP: null,
        // endRideOTP: null,
      };
      if (type === "start") {
        // Once verified then set it to TRUE
        updateBooking.startRideOTPVerified = true;
      } else if (type === "end") {
        // Once verified then set it to TRUE
        updateBooking.endRideOTPVerified = true;
        updateBooking.status = "COMPLETED";
        updateBooking.completedAt = new Date();
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: updateBooking,
      });
    });

    return res.status(200).json({
      success: true,
      message:
        type === "start"
          ? "Ride start OTP verified successfully."
          : type === "end"
            ? "Ride end OTP verified successfully. Ride marked as completed."
            : "Ride OTP verified successfully.",
    });
  } catch (error) {
    console.error("Error verifying OTP for complete ride:", error);
    return res.status(500).json({
      success: false,
      message: "Could not verify OTP or complete the ride.",
      error: error.message,
    });
  }
};

export const regenerateBookingOtp = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const type = req.params.type;
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required.",
      });
    }

    // Find the booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Generate a 4 or 6 digit OTP (choose length as needed)
    const otp = Math.floor(100000 + Math.random() * 900000); // 4-digit OTP

    let updateData = {};
    if (type === "start") {
      updateData = { startRideOTP: otp.toString() };
    } else if (type === "end") {
      updateData = { endRideOTP: otp.toString() };
    } else {
      updateData = {
        startRideOTP: null,
        endRideOTP: null,
      };
    }

    // Save OTP code to the booking
    await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: "OTP regenerated successfully.",
      data: updateData,
    });
  } catch (error) {
    console.error("Error regenerating booking OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Could not regenerate OTP.",
      error: error.message,
    });
  }
};

export const getMyActiveRide = async (req, res) => {
  try {
    // You may need to adjust this depending on your authentication.
    const driverId = req.userId;

    if (!driverId) {
      return res.status(401).json({
        success: false,
        message: "Driver ID not found in request/user context",
      });
    }

    // Find one active ride for the driver
    const activeRide = await prisma.booking.findFirst({
      where: {
        status: "RUNNING",
        assignedDriverUserId: driverId,
        biddingOpen: false,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            updatedAt: true,
            isVerified: true,
          },
        },
        bids: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            driverId: true,
          },
        },
        vehicle: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (!activeRide) {
      return res.status(200).json({
        success: false,
        activeRide: null,
        message: "No active ride found",
      });
    }

    const driverCommissionPercent = process.env.DRIVER_COMMISSION_PERCENT || 10;
    // Attach commission percent to the returned ride (if found)
    activeRide.driverCommissionPercent = driverCommissionPercent
      ? driverCommissionPercent
      : 10.0; // fallback to default 10 if not found
    activeRide.driverCommissionPercentAmount = Number(
      (
        (Number(activeRide.finalAmount) *
          Number(activeRide.driverCommissionPercent)) /
        100
      ).toFixed(2),
    );

    return res.status(200).json({
      success: true,
      activeRide,
    });
  } catch (error) {
    console.error("Error fetching active ride:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch active ride",
      error: error.message,
    });
  }
};

/**
 * Cancel the currently active ride for the authenticated driver.
 * Sets the ride status to "CANCELED" if found and not already completed/CANCELED.
 *
 * Route: GET /api/cancel-active-ride/:id
 */
export const cancelMyActiveRide = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const driverId = req.userId;

    // Find the ride assigned to this user and not already completed/CANCELED
    const ride = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        assignedDriverUserId: driverId,
        status: { notIn: ["COMPLETED", "FINISHED", "CANCELED"] },
      },
    });

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Active ride not found or already finished/CANCELED.",
      });
    }

    const cancelledRide = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "ACTIVE",
        biddingOpen: true,
        assignedDriverUserId: null,
        endRideOTP: null,
      },
    });
    // Pending all rejected bids to make them available for bidding again
    await prisma.bookingBid.updateMany({
      where: { bookingId },
      data: { status: "PENDING" },
    });
    // Reject all pending bids
    await prisma.bookingBid.updateMany({
      where: { bookingId, driverId: driverId },
      data: { status: "CANCELED" },
    });

    return res.status(200).json({
      success: true,
      message: "Ride cancelled successfully.",
      ride: cancelledRide,
    });
  } catch (error) {
    console.error("Error cancelling active ride:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel active ride.",
      error: error.message,
    });
  }
};

/**
 * Get all finished rides for the currently authenticated user.
 *
 * Returns rides where status is 'COMPLETED' (or equivalent for finished).
 *
 * Route: GET /api/rides/finished
 */
export const getMyFinishedRide = async (req, res) => {
  try {
    const userId = req.userId;

    const queryWhere = {
      assignedDriverUserId: userId,
      status: { in: ["COMPLETED", "FINISHED"] }, // completed or finished
    };
    // Query rides where user is owner or driver, and ride is finished/completed
    const finishedRides = await prisma.booking.findMany({
      where: queryWhere,
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            updatedAt: true,
            isVerified: true,
          },
        },
        bids: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            driverId: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      rides: finishedRides,
    });
  } catch (error) {
    console.error("Error fetching finished rides:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch finished rides",
      error: error.message,
    });
  }
};

export const createBookingPayOrder = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const driverId = req.userId;

    // Find the booking
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId },
      include: {
        bids: {
          where: {
            status: "ACCEPTED",
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found for user.",
      });
    }

    const acceptedBid =
      booking.bids && booking.bids.length > 0 ? booking.bids[0] : null;
    if (!acceptedBid) {
      return res.status(400).json({
        success: false,
        message: "No accepted bid found for this booking.",
      });
    }

    const bidAmount = Number(acceptedBid.amount);
    if (!bidAmount || isNaN(bidAmount) || bidAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bid amount.",
      });
    }

    // Suppose commission is 10% (adjust as needed)
    const driverCommissionPercent = process.env.DRIVER_COMMISSION_PERCENT || 10;
    const commissionAmount =
      Math.round(bidAmount * driverCommissionPercent) / 100;
    const driverCommissionPercentAmount = commissionAmount.toFixed(2);

    // Try to find the user in your database (for customer_details in Razorpay order)
    const user = await prisma.user.findUnique({
      where: {
        id: driverId,
      },
      select: {
        name: true,
        mobile: true,
        email: true,
      },
    });

    const order = await createRazorPayOrder({
      amount: driverCommissionPercentAmount,
      receipt: `booking_start_${bookingId}`,
      notes: {
        bookingId: bookingId || "",
        customerId: driverId || "",
        bidId: acceptedBid.id,
        payAmount: driverCommissionPercentAmount,
      },
      customer_details: {
        // Replace with actual user details if available in your user model/request
        name: user?.name || "",
        contact: user?.mobile || "",
        email: user?.email || "",
      },
    });
    // Create a payment record in DB with status "PENDING" and all relevant details

    await prisma.paymentTransaction.create({
      data: {
        amount: Number(driverCommissionPercentAmount),
        status: "PENDING",
        userId: driverId,
        purpose: order.receipt,
        paymentId: null,
        bookingId: bookingId,
        orderId: order.id,
      },
    });

    return res.json({
      success: true,
      order,
      bookingId,
      bidId: acceptedBid.id,
      bidAmount,
      payAmount: driverCommissionPercentAmount,
    });
  } catch (error) {
    console.error("Error creating Razorpay order for booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment order.",
      error: error.message,
    });
  }
};
