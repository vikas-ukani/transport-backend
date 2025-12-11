import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js'; // Import the Prisma client utility

// Middleware to protect routes
export const apiMiddleware = async (req, res, next) => {
  let token;
  // 1. Check if the Authorization header exists and has the 'Bearer ' format
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header (removes 'Bearer ' prefix)
      token = req.headers.authorization.split(' ')[1];

      // 2. Verify token
      if (!process.env.JWT_SECRET) {
        // Log error and stop execution if secret is missing
        console.error('JWT_SECRET is not defined in environment variables.');
        return res.status(500).json({ message: 'Server configuration error' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // 3. Retrieve the user from the database using the ID in the payload
      // Assuming the JWT payload looks like { id: 1, email: '...' }
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, name: true },
      });

      if (!user) {
        return res
          .status(401)
          .json({ message: 'Not authorized, user not found' });
      }

      // 4. Attach the user ID to the request object (Express custom property)
      // This makes req.userId available in subsequent controller functions
      req.userId = user.id;

      // Continue to the next middleware or controller function
      next();
    } catch (error) {
      console.error(error.message);
      return res.status(401).json({ message: error.message });
    }
  }

  // If no token is provided at all in the header
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: 'Not authenticated' });
  }
};

// Optional: Middleware to restrict access only to admins
export const adminMiddleware = (req, res, next) => {
  // Check user roles attached by the 'protect' middleware
  // Example: if (req.user && req.user.role === 'admin') { next(); }
  res.status(403).json({ message: 'Not authorized as an admin' });
};
