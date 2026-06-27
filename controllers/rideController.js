import prisma from "../lib/prisma.js";
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

    // After bid accepted, transfer 50% of the agreed amount to the driver's account (wallet)
    // Remaining 50% will be transferred after successful delivery (handled elsewhere).

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

    // Ensure customer has enough balance
    if (parseFloat(customer.walletAmount) < partialAmountCents) {
      throw new Error("Insufficient wallet balance for partial payment.");
    }

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
          finalAmount: bid.amount,
          // Generate a 6-digit OTP code and store it in the accepted bid (for later delivery confirmation)
          otpCode: Math.floor(100000 + Math.random() * 900000).toString(),
        },
      });

      // Deduct from customer wallet and add to driver wallet (partial transfer only)
      // Deduct from customer wallet
      await tx.user.update({
        where: { id: customer.id },
        data: {
          walletAmount: { decrement: partialAmountCents },
        },
      });

      // Credit to driver wallet
      await tx.user.update({
        where: { id: driver.id },
        data: {
          walletAmount: { increment: partialAmountCents },
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
      emitToBookingRoom(bookingId, "booking:bid_accepted", {
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
      message:
        "Booking bid accepted. Partial amount has been paid to the driver. You can pay the remaining amount from your wallet once booking is completed.",
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
 * Expects: req.params.id (bookingId), req.params.otp (otpCode, as string)
 * Returns: { success: boolean, message?: string }
 */
export const verifyCompleteRide = async (req, res) => {
  const { id: bookingId, otp: otpCode } = req.params;

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

    if (!booking.otpCode) {
      return res.status(400).json({
        success: false,
        message: "No OTP is set for this booking. Ask them to create new one.",
      });
    }

    // Make sure OTP matches exactly (string/number safe)
    if (booking.otpCode.toString() !== otpCode.toString()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP code.",
      });
    }

    if (!booking) {
      throw new Error("Booking not found.");
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

    // Calculate the remaining payment amount (already paid 50% on bid accept, so pay the rest now)
    const totalAmountCents = Number(
      acceptedBid.amount || booking.paymentAmountCents,
    );
    const initialPaid = Math.floor(
      (totalAmountCents * PARTIAL_AMOUNT_TO_CUT) / 100,
    );
    const remainingAmountCents = totalAmountCents - initialPaid;

    // Check if customer has enough wallet balance for the remaining payment
    if (parseFloat(customer.walletAmount) < remainingAmountCents) {
      throw new Error("Insufficient wallet balance for remaining payment.");
    }

    await prisma.$transaction(async (tx) => {
      // Update booking as completed, clear OTP, and reset remainingAmount
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          otpCode: null,
          remainingAmount: "0",
        },
      });

      // Deduct from customer wallet
      await tx.user.update({
        where: { id: customer.id },
        data: {
          walletAmount: { decrement: remainingAmountCents },
        },
      });

      // Credit to driver wallet
      await tx.user.update({
        where: { id: driver.id },
        data: {
          walletAmount: { increment: remainingAmountCents },
        },
      });

      // Log debit transaction for customer
      await tx.walletTransaction.create({
        data: {
          userId: customer.id,
          counterpartyId: driver.id,
          amount: remainingAmountCents,
          type: "debit",
          purpose: "ride_payment",
          currency: "inr",
          referenceId: bookingId,
          status: "COMPLETED",
          description:
            "Final 50% ride payment debited from customer wallet on ride completion by OTP",
        },
      });

      // Log credit transaction for driver
      await tx.walletTransaction.create({
        data: {
          userId: driver.id,
          counterpartyId: customer.id,
          amount: remainingAmountCents,
          type: "credit",
          purpose: "ride_payment",
          currency: "inr",
          referenceId: bookingId,
          status: "COMPLETED",
          description:
            "Final 50% ride payment credited to driver wallet on ride completion by OTP",
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: "Ride completed successfully by OTP verification.",
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

    // Save OTP code to the booking
    await prisma.booking.update({
      where: { id: bookingId },
      data: { otpCode: otp.toString() },
    });

    return res.status(200).json({
      success: true,
      message: "OTP regenerated successfully.",
      otpCode: otp.toString(),
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
