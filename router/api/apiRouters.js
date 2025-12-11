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
  getAllVideos,
  getPost,
  getPosts,
  updatePost,
} from '../../controllers/postController.js';
import { createUser, getUsers } from '../../controllers/userController.js';
import { registerVehicle } from '../../controllers/vehicleController.js';
import { validateRequest } from '../../lib/validateRequest.js';
import { apiMiddleware } from '../../middlewares/authMiddleware.js';
import {
  createPostSchema,
  loginSchema,
  registerSchema,
  RegisterVehicleSchema,
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
  .get(getPosts)
  .post(validateRequest(createPostSchema), createPost);
apiRouters
  .route('/posts/:id', apiMiddleware)
  .get(getPost)
  .put(validateRequest(createPostSchema), updatePost)
  .delete(deletePost);
//   .post(validateRequest(createPostSchema), createPost);

apiRouters.post(
  '/register-vehicle',
  validateRequest(RegisterVehicleSchema),
  registerVehicle
);

apiRouters.route('/users', apiMiddleware).get(getUsers).post(createUser);
// authRouters
//   .route('/users/:id')
//   .get(getUserById)
//   .put(updateUser)
//   .delete(deleteUser);

authRouters.use('/', apiRouters);
export default authRouters;
