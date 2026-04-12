import prisma from "../lib/prisma.js";
import {
  broadcastGlobal,
  emitToBookingRoom,
  sendNotificationToUser,
} from "../socket/socket.js";

// Send Push Notification to All Drivers about New Booking
// Send Push Notification to All Drivers about New Booking

// Separate function to send notification to all drivers
async function notifyAllDriversOfBooking(booking) {
  try {
    // Fetch all users who are drivers
    const drivers = await prisma.user.findMany({
      where: { type: "driver", isVerified: true },
      select: { id: true },
    });

    if (drivers && drivers.length > 0) {
      const driverIds = drivers.map((driver) => driver.id);

      const notificationTitle = "New Booking Available";
      const notificationMessage = `A new booking has been created.`;
      // Save notifications for all drivers using createMany
      await prisma.notification.createMany({
        data: driverIds.map((driverId) => ({
          userId: driverId,
          title: notificationTitle,
          message: notificationMessage,
          payload: {
            bookingId: booking.id,
          },
        })),
      });
      // If sendPushNotification utility is implemented, call it
      if (typeof sendPushNotification === "function") {
        await sendPushNotification({
          userIds: driverIds,
          title: notificationTitle,
          message: notificationMessage,
          payload: {
            bookingId: booking.id,
          },
        });
      }
      // Otherwise, you might want to implement or stub the notification logic here
    }
  } catch (error) {
    console.log(
      "Error while saving notification and sending push notification",
      error.message,
    );
  }
}

/**
 * Create a Booking
 * @param {*} req
 * @param {*} res
 */
export const createBooking = async (req, res) => {
  try {
    const {
      fromAddress,
      fromLatitude,
      fromLongitude,
      toAddress,
      toLatitude,
      toLongitude,
      bookingDate,
      truckType,
      bodyType,
      truckLength,
      truckHeight,
      loadCapacity,
      estimatedKm,
      driverNotes,
    } = req.body;

    const customerId = req.userId;

    const booking = await prisma.booking.create({
      data: {
        customerId,
        fromAddress,
        fromLatitude,
        fromLongitude,
        toAddress,
        toLatitude,
        toLongitude,
        bookingDate: new Date(bookingDate),
        truckType,
        bodyType,
        truckLength: truckLength || null,
        truckHeight: truckHeight || null,
        loadCapacity: loadCapacity || null,
        estimatedKm: estimatedKm || null,
        driverNotes: driverNotes || null,
        status: "pending", // default status
        paymentStatus: "Unpaid",
      },
    });

    // Call the function after booking creation
    await notifyAllDriversOfBooking(booking);

    try {
      broadcastGlobal("booking:created", {
        booking: {
          id: booking.id,
          fromAddress: booking.fromAddress,
          toAddress: booking.toAddress,
          status: booking.status,
          estimatedKm: booking.estimatedKm,
          truckType: booking.truckType,
          bodyType: booking.bodyType,
          customerId: booking.customerId,
          biddingOpen: booking.biddingOpen,
        },
      });
      emitToBookingRoom(booking.id, "booking:updated", { booking });
    } catch (e) {
      console.warn("Socket broadcast booking:created failed", e.message);
    }

    res.status(201).json({
      success: true,
      message: "Booking created successfully.",
      booking,
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message,
    });
  }
};

/**
 * Get all bookings for the current user (customer), paginated.
 */
export const getMyBookings = async (req, res) => {
  try {
    const customerId = req.userId;
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await prisma.booking.count({
      where: { customerId },
    });

    // Get bookings with pagination
    const bookings = await prisma.booking.findMany({
      where: { customerId },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      bookings,
    });
  } catch (error) {
    console.error("Error fetching my bookings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const me = req.userId;
    const userType = req.userType;

    const driverAccess =
      userType === "driver"
        ? {
            status: "pending",
            OR: [
              { AND: [{ biddingOpen: true }, { assignedDriverUserId: null }] },
              { assignedDriverUserId: me },
            ],
          }
        : null;

    const booking = await prisma.booking.findFirst({
      where: {
        id,
        OR: [{ customerId: me }, ...(driverAccess ? [driverAccess] : [])],
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            photo: true,
            isVerified: true,
          },
        },
        bids: {
          orderBy: { createdAt: "desc" },
          include: {
            driver: {
              select: {
                id: true,
                name: true,
                email: true,
                mobile: true,
                photo: true,
              },
            },
          },
        },
        _count: { select: { bids: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    console.error("Error fetching booking by ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch booking",
      error: error.message,
    });
  }
};

/**
 * Driver submits or updates a price bid (INR cents) for an open transport request.
 */
export const placeBookingBid = async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const { fareOfferCents, note } = req.body;
    const driverUserId = req.userId;

    if (req.userType !== "driver") {
      return res.status(403).json({
        success: false,
        message: "Only drivers can place bids.",
      });
    }

    if (!Number.isInteger(fareOfferCents) || fareOfferCents < 100) {
      return res.status(400).json({
        success: false,
        message: "fareOfferCents must be an integer >= 100 (minimum ₹1).",
      });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId },
    });
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found." });
    }
    if (booking.customerId === driverUserId) {
      return res.status(400).json({
        success: false,
        message: "You cannot bid on your own request.",
      });
    }
    if (!booking.biddingOpen || booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "This request is not accepting bids.",
      });
    }
    if (
      booking.assignedDriverUserId &&
      booking.assignedDriverUserId !== driverUserId
    ) {
      return res.status(400).json({
        success: false,
        message: "Another driver has already been selected.",
      });
    }

    const existing = await prisma.bookingBid.findFirst({
      where: {
        bookingId,
        driverUserId,
        status: "pending",
      },
    });

    let bid;
    if (existing) {
      bid = await prisma.bookingBid.update({
        where: { id: existing.id },
        data: {
          fareOfferCents,
          note: note != null ? String(note).slice(0, 500) : null,
        },
        include: {
          driver: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
              photo: true,
            },
          },
        },
      });
    } else {
      bid = await prisma.bookingBid.create({
        data: {
          bookingId,
          driverUserId,
          fareOfferCents,
          note: note != null ? String(note).slice(0, 500) : null,
        },
        include: {
          driver: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
              photo: true,
            },
          },
        },
      });
    }

    try {
      emitToBookingRoom(bookingId, "booking:bid", { bid, bookingId });
      sendNotificationToUser(booking.customerId, {
        type: "booking_bid",
        title: "New driver bid",
        message: `A driver bid ${(fareOfferCents / 100).toFixed(2)} on your transport request.`,
        data: { bookingId, bidId: bid.id },
      });
    } catch (e) {
      console.warn("placeBookingBid socket", e.message);
    }

    return res.status(201).json({
      success: true,
      message: existing ? "Bid updated." : "Bid placed.",
      bid,
    });
  } catch (error) {
    console.error("placeBookingBid:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to place bid",
    });
  }
};

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
      return res.status(404).json({ success: false, message: "Booking not found." });
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
        status: "pending",
      },
    });
    if (!bid) {
      return res.status(404).json({ success: false, message: "Bid not found." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.bookingBid.updateMany({
        where: { bookingId, id: { not: bidId } },
        data: { status: "rejected" },
      });
      await tx.bookingBid.update({
        where: { id: bidId },
        data: { status: "accepted" },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          biddingOpen: false,
          assignedDriverUserId: bid.driverUserId,
          paymentAmountCents: bid.fareOfferCents,
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
                photo: true,
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
      sendNotificationToUser(bid.driverUserId, {
        type: "booking_bid_accepted",
        title: "Your bid was accepted",
        message: "The customer accepted your price. They may pay from wallet next.",
        data: { bookingId, bidId },
      });
    } catch (e) {
      console.warn("acceptBookingBid socket", e.message);
    }

    return res.json({
      success: true,
      message: "Bid accepted. You can pay from your wallet to confirm the booking.",
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

export const getDriverRides = async (req, res) => {
  try {
    const driverUserId = req.userId;
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    const skip = (page - 1) * limit;

    const openRideWhere = {
      status: "pending",
      OR: [
        { AND: [{ biddingOpen: true }, { assignedDriverUserId: null }] },
        { assignedDriverUserId: driverUserId },
      ],
    };

    const total = await prisma.booking.count({
      where: openRideWhere,
    });

    const rides = await prisma.booking.findMany({
      where: openRideWhere,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
            photo: true,
            updatedAt: true,
            isVerified: true,
          },
        },
        bids: {
          where: { driverUserId },
          select: { id: true, fareOfferCents: true, status: true, createdAt: true },
        },
        _count: { select: { bids: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      rides,
    });
  } catch (error) {
    console.error("Error fetching driver rides:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch rides",
      error: error.message,
    });
  }
};

/**
 * Delete a booking by its ID. Also remove all notifications related to the booking.
 * Expects: req.params.id (booking ID)
 * Returns: { success, message }
 */
export const deleteBooking = async (req, res) => {
  const bookingId = req.params.id;
  if (!bookingId) {
    return res.status(400).json({
      success: false,
      message: "Booking ID is required",
    });
  }

  try {
    // Check if the booking exists
    const existingBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!existingBooking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Alternatively: In MongoDB and Prisma, you may have to fetch and filter manually:
    const notifications = await prisma.notification.findMany();
    const idsToDelete = notifications
      .filter((n) => n.payload && n.payload.bookingId === bookingId)
      .map((n) => n.id);
    console.log("idsToDelete", idsToDelete);
    if (idsToDelete.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    // Delete the booking
    await prisma.booking.delete({
      where: { id: bookingId },
    });

    res.status(200).json({
      success: true,
      message: "Booking and related notifications deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete booking",
      error: error.message,
    });
  }
};