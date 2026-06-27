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
    console.warn(
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
        status: "ACTIVE", // default status
        paymentStatus: "Unpaid",
        biddingOpen: true,
        assignedDriverUserId: null,
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
          biddingOpen: Boolean(booking.biddingOpen),
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
              { AND: [{ biddingOpen: true }, { driverId: null }] },
              { driverId: me },
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
                mobile: true,
                photo: true,
                latitude: true,
                longitude: true,
              },
            },
            vehicle: {
              select: {
                id: true,
                driverName: true,
                mobileNumber: true,
                rcNumber: true,
                vehicleNumber: true,
              },
            },
          },
          // include: {
          // driver: {
          // select: {
          //   id: true
          // },
          // include: {
          //   user: {
          //     select: {
          //       id: true,
          //       name: true,
          //       mobile: true,
          //       photo: true,
          //     },
          //   },
          // },
          // },
          // },
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
    const { amount: amount, note } = req.body;
    const driverId = req.userId;

    if (req.userType !== "driver") {
      return res.status(403).json({
        success: false,
        message: "Only drivers can place bids.",
      });
    }

    if (!Number.isInteger(amount) || amount < 100) {
      return res.status(400).json({
        success: false,
        message: "Bid amount must be an integer >= 100 (minimum ₹1).",
      });
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        ownerId: driverId,
        status: "verified",
        isAvailable: true,
      },
    });
    if (!vehicle) {
      return res.status(400).json({
        success: false,
        message: "Please register your vehicle to place bid.",
      });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId },
    });
    if (!booking) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }
    if (booking.customerId === driverId) {
      return res.status(400).json({
        success: false,
        message: "You cannot bid on your own request.",
      });
    }
    if (!booking.biddingOpen || booking.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "This request is not accepting bids.",
      });
    }
    if (
      booking.assignedDriverUserId &&
      booking.assignedDriverUserId !== driverId
    ) {
      return res.status(400).json({
        success: false,
        message: "Another driver has already been selected.",
      });
    }

    const existing = await prisma.bookingBid.findFirst({
      where: {
        bookingId,
        driverId: driverId,
        status: { in: ["PENDING", "ACTIVE"] },
      },
    });

    // Check if driver has enough wallet balance before placing bid
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: { walletAmount: true },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found.",
      });
    }

    if (driver.walletAmount == null || driver.walletAmount < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance to place this bid.",
      });
    }
    let bid;
    if (existing) {
      bid = await prisma.bookingBid.update({
        where: { id: existing.id },
        data: {
          amount,
          status: "PENDING",
          vehicleId: vehicle.id,
          note: note != null ? String(note).slice(0, 500) : null,
        },
      });
    } else {
      bid = await prisma.bookingBid.create({
        data: {
          bookingId,
          status: "PENDING",
          driverId: driverId,
          vehicleId: vehicle.id,
          amount,
          note: note != null ? String(note).slice(0, 500) : null,
        },
      });
    }

    try {
      emitToBookingRoom(bookingId, "booking:bid", { bid, bookingId });
      sendNotificationToUser(booking.customerId, {
        type: "booking_bid",
        title: existing ? "Bid amount updated." : "New driver bid",
        message: `A driver bid ${amount.toFixed(2)} on your transport request.`,
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

export const getDriverRides = async (req, res) => {
  try {
    const driverId = req.userId;
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    const skip = (page - 1) * limit;

    let tab = req.query.tab || "all";
    const openRideWhere = {
      // customerId: { not: driverId },
      // OR: [
      //   { AND: [{ biddingOpen: true }, { driverId: null }] },
      //   // { driverId: driverId },
      // ],
    };
    if (tab == "my") {
      openRideWhere.status = undefined;
      openRideWhere.driverId = driverId;
    } else if (tab == "closed") {
      openRideWhere.status = "FINISHED";
    } else {
      openRideWhere.status = "ACTIVE";
      openRideWhere.biddingOpen = true;
    }

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
            updatedAt: true,
            isVerified: true,
          },
        },
        bids: {
          where: { driverId },
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
          },
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
 * Get the highest five bids for a booking, including driver information.
 * Expects: req.params.id (bookingId)
 * Returns: { success, bids }
 */
export const getBidsForBooking = async (req, res) => {
  const bookingId = req.params.id;
  if (!bookingId) {
    return res.status(400).json({
      success: false,
      message: "Booking ID is required",
    });
  }

  try {
    // Fetch top 5 highest bids for the given booking, with driver info
    // Only return bids where driver exists (i.e., bid.driverId is not null)
    const bids = await prisma.bookingBid.findMany({
      where: {
        bookingId: bookingId,
        driverId: {
          not: undefined,
        },
      },
      orderBy: {
        amount: "desc",
      },
      take: 5,
    });

    // Note: If bid.driverId is undefined or null, then skip fetching.
    const bidsWithDrivers = await Promise.all(
      bids.map(async (bid) => {
        let driver = null;
        if (bid.driverId) {
          driver = await prisma.user.findUnique({
            where: { id: bid.driverId },
            select: {
              id: true,
              name: true,
              rating: true,
              photo: true,
            },
          });
        }
        return {
          ...bid,
          driver,
        };
      }),
    );

    res.status(200).json({
      success: true,
      bids: bidsWithDrivers.map((bid) => ({
        id: bid.id,
        driver: bid.driver // compatibility with frontend using "user"
          ? {
              id: bid.driver.id,
              name: bid.driver.name,
              avatar: bid.driver.photo,
              rating: bid.driver.rating || 0,
            }
          : null,
        amount: typeof bid.amount === "number" ? bid.amount : bid.amount,
        createdAt: bid.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching bids for booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bids for this booking",
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
