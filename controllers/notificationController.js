import prisma from '../lib/prisma.js';

/**
 * Get notifications for a user by userId.
 * Expects req.userId to be available (from auth middleware).
 */
export const getNotificationsByUserId = async (req, res) => {
  try {
    const userId = req.userId;

    // Implement pagination: get page and limit from query, default to page=1, limit=10
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const skip = (page - 1) * limit;

    // Get the total number of notifications for the user
    const total = await prisma.notification.count({
      where: { userId },
    });

    // Fetch paginated notifications
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    res.status(200).json({
      success: true,
      notifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message,
    });
  }
};

/**
 * Mark all notifications for the current user as read.
 * Expects req.userId to be available (from auth middleware).
 * Route: PATCH /api/notifications/read-all
 */
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.userId;

    const { count } = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.status(200).json({
      success: true,
      message: `${count} notifications marked as read.`,
      count,
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message,
    });
  }
};


/**
 * Mark a notification as read by its ID.
 * Expects req.userId to be available (from auth middleware).
 * Route: PATCH /api/notifications/:id/read
 */
export const markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    // Verify the notification belongs to the logged-in user
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    if (notification.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const updatedNotification = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.status(200).json({
      success: true,
      notification: updatedNotification,
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message,
    });
  }
};
