import { Router } from "express";

import {
    acceptBookingBid,
    createBooking,
    deleteBooking,
    getBookingById,
    getDriverRides,
    getMyBookings,
    placeBookingBid,
} from "../../controllers/bookingController.js";
import {
    getNotificationsByUserId,
    markAllNotificationsAsRead,
    markNotificationAsRead,
} from "../../controllers/notificationController.js";
import {
    createPost,
    deletePost,
    getAllPosts,
    getAllVideos,
    getMyPosts,
    getPost,
    likePost,
    updatePost,
} from "../../controllers/postController.js";
import { getMe } from "../../controllers/authController.js";
import {
    createPaymentAction,
    createRazorpayWalletTopupOrder,
    getRazorpayConfig,
    getWalletBalance,
    verifyRazorpayWalletTopup,
} from "../../controllers/razorpayPaymentController.js";
import {
    createUser,
    getUsers,
    partialUpdate,
} from "../../controllers/userController.js";
import {
    deleteVehicle,
    getVehicleById,
    getVehicles,
    registerVehicle,
    updateVehicle,
} from "../../controllers/vehicleController.js";
import { validateRequest } from "../../lib/validateRequest.js";
import { apiMiddleware } from "../../middlewares/authMiddleware.js";
import {
    CreateBookingSchema,
    createPostSchema,
    CreatePaymentActionSchema,
    CreateRazorpayWalletTopupOrderSchema,
    placeBookingBidSchema,
    RegisterVehicleSchema,
    UpdateVehicleSchema,
    VerifyRazorpayWalletTopupSchema,
} from "../../schema/apiSchema.js";

// API ////   ---------

const apiRouters = Router();
// API Middleware
apiRouters.use(apiMiddleware);

apiRouters.get("/me", getMe);

apiRouters.route("/videos").get(getAllVideos);
apiRouters
  .route("/posts")
  .get(getAllPosts)
  .post(validateRequest(createPostSchema), createPost);
apiRouters.get("/my-posts", getMyPosts);
apiRouters
  .route("/posts/:id", apiMiddleware)
  .get(getPost)
  .put(validateRequest(createPostSchema), updatePost)
  .delete(deletePost);
apiRouters.get("/like-post/:id", likePost);
//   .post(validateRequest(createPostSchema), createPost);

// vehicles routes
apiRouters
  .route("/vehicles")
  .get(getVehicles)
  .post(validateRequest(RegisterVehicleSchema), registerVehicle);
apiRouters
  .route("/vehicle/:id")
  .get(getVehicleById)
  .put(validateRequest(UpdateVehicleSchema), updateVehicle)
  .delete(deleteVehicle);

apiRouters.route("/users", apiMiddleware).get(getUsers).post(createUser);
apiRouters.put("/users/partial-update/:id", partialUpdate);

apiRouters
  .route("/bookings")
  .get(getMyBookings)
  .post(validateRequest(CreateBookingSchema), createBooking);
apiRouters.route("/booking/:id").get(getBookingById).delete(deleteBooking);
apiRouters.post(
  "/booking/:id/bids",
  validateRequest(placeBookingBidSchema),
  placeBookingBid,
);
apiRouters.post("/booking/:id/bids/:bidId/accept", acceptBookingBid);
apiRouters.get("/driver-rides", getDriverRides);

apiRouters.get("/payments/razorpay/config", getRazorpayConfig);
apiRouters.get("/payments/wallet", getWalletBalance);
apiRouters.post(
  "/payments/action",
  validateRequest(CreatePaymentActionSchema),
  createPaymentAction,
);
apiRouters.post(
  "/payments/razorpay/wallet/order",
  validateRequest(CreateRazorpayWalletTopupOrderSchema),
  createRazorpayWalletTopupOrder,
);
apiRouters.post(
  "/payments/razorpay/wallet/verify",
  validateRequest(VerifyRazorpayWalletTopupSchema),
  verifyRazorpayWalletTopup,
);

// Notifications routes
apiRouters.get("/notifications", getNotificationsByUserId);
apiRouters.patch("/notifications/:id/read", markNotificationAsRead);
apiRouters.patch("/notifications/read-all", markAllNotificationsAsRead);

export default apiRouters;