import { Router } from 'express';

import {
  forgotPassword,
  register,
  resetPassword,
  sendEmailOTP,
  sendMobileOTP,
  signin,
  verifyEmailOTP,
  verifyMobileOTP,
} from '../../controllers/authController.js';
import {
  createPost,
  deletePost,
  getAllPosts,
  getAllVideos,
  getMyPosts,
  getPost,
  likePost,
  updatePost
} from '../../controllers/postController.js';
import { createUser, getUsers, partialUpdate } from '../../controllers/userController.js';
import {
  deleteVehicle,
  getVehicleById,
  getVehicles,
  registerVehicle,
  updateVehicle,
} from '../../controllers/vehicleController.js';
import { validateRequest } from '../../lib/validateRequest.js';
import { apiMiddleware } from '../../middlewares/authMiddleware.js';
import {
  createPostSchema,
  loginSchema,
  registerSchema,
  RegisterVehicleSchema,
  UpdateVehicleSchema,
} from '../../schema/apiSchema.js';

const authRouters = Router();

// Auth Routers
authRouters.post('/signin', validateRequest(loginSchema), signin);
authRouters.post('/register', validateRequest(registerSchema), register);
// OTP
authRouters.post('/mobile-send-otp', sendMobileOTP);
authRouters.post('/mobile-verify-otp', verifyMobileOTP);
authRouters.post('/email-send-otp', sendEmailOTP);
authRouters.post('/email-verify-otp', verifyEmailOTP);

authRouters.post('/forgot-password', forgotPassword);
authRouters.post('/reset-password', resetPassword);

// API ////   ---------

const apiRouters = Router();
// API Middleware
apiRouters.use(apiMiddleware);

apiRouters.route('/videos').get(getAllVideos);
apiRouters
  .route('/posts')
  .get(getAllPosts)
  .post(validateRequest(createPostSchema), createPost);
apiRouters.get('/my-posts', getMyPosts);
apiRouters
  .route('/posts/:id', apiMiddleware)
  .get(getPost)
  .put(validateRequest(createPostSchema), updatePost)
  .delete(deletePost);
apiRouters.get('/like-post/:id', likePost);
//   .post(validateRequest(createPostSchema), createPost);

// vehicles routes
apiRouters
  .route('/vehicles')
  .get(getVehicles)
  .post(validateRequest(RegisterVehicleSchema), registerVehicle);
apiRouters
  .route('/vehicle/:id')
  .get(getVehicleById)
  .put(validateRequest(UpdateVehicleSchema), updateVehicle)
  .delete(deleteVehicle);

apiRouters.route('/users', apiMiddleware).get(getUsers).post(createUser);
apiRouters.put('/users/partial-update/:id', partialUpdate);
// authRouters
//   .route('/users/:id')
//   .get(getUserById)
//   .put(updateUser)
//   .delete(deleteUser);

authRouters.use('/', apiRouters);
export default authRouters;
