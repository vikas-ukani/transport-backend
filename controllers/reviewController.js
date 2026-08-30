import prisma from "../lib/prisma.js";

export const createBookingReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const userId = req.userId; // Authenticated user (customer who gives review)

    // Find the booking using bookingId for validation and referencing driverId
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        assignedDriverUserId: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Prevent duplicate reviews for same booking by this user
    const existingReview = await prisma.userRating.findFirst({
      where: {
        bookingId,
        userId: userId,
      },
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this booking.",
      });
    }

    const review = await prisma.userRating.create({
      data: {
        bookingId,
        givenById: userId,
        userId: booking.assignedDriverUserId,
        rating,
        comment: comment ? String(comment).trim().slice(0, 1000) : null,
      },
    });

    // Optionally: Update driver rating (average)
    const [driverReviews, _] = await Promise.all([
      prisma.userRating.findMany({
        where: { userId: booking.assignedDriverUserId },
        select: { rating: true },
      }),
      // Possibly notify driver
      prisma.notification
        ? prisma.notification.create({
            data: {
              userId: booking.assignedDriverUserId,
              title: "You received a new review",
              message: `Rating: ${rating} - ${comment ? comment : ""}`,
              payload: { reviewId: review.id, bookingId },
            },
          })
        : Promise.resolve(),
    ]);
    const driverReviewCount = driverReviews.length;
    const averageRating =
      driverReviewCount > 0
        ? (
            driverReviews.reduce((acc, r) => acc + r.rating, 0) /
            driverReviewCount
          ).toFixed(2)
        : rating.toFixed(2);

    // Update driver's overall rating
    await prisma.user.update({
      where: { id: booking.assignedDriverUserId },
      data: { rating: Number(averageRating) },
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted",
      review,
      newDriverRating: Number(averageRating),
    });
  } catch (error) {
    console.error("Error creating review:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Could not create review",
    });
  }
};
