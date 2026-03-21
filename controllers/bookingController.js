import prisma from "../lib/prisma.js";

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
    console.log("id", id);
    const customerId = req.userId;

    const booking = await prisma.booking.findFirst({
      where: {
        id: id,
        customerId: customerId,
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

export const getDriverRides = async (req, res) => {
  try {
    const driverId = req.userId;
    console.log("driverId", driverId);
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await prisma.booking.count({
      where: { status: "pending" },
    });

    // Get bookings with pagination
    const rides = await prisma.booking.findMany({
      where: { status: "pending" },
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
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    console.log("rides", rides);

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
