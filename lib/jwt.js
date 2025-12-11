import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from './prisma.js';

const ACCESS_TOKEN_EXPIRES_IN_MINUTES = process.env
  .ACCESS_TOKEN_EXPIRES_IN_MINUTES
  ? parseInt(process.env.ACCESS_TOKEN_EXPIRES_IN_MINUTES)
  : 60; // fallback to 60 minutes if not set

/**
 * Hashes a password using bcrypt.
 * @param {string} password
 * @returns {string} hashed password
 */
export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

/**
 * Verifies a password against a hash using bcrypt.
 * @param {string} password
 * @param {string} hashedPassword
 * @returns {boolean}
 */
export function verifyPassword(password, hashedPassword) {
  return bcrypt.compareSync(password, hashedPassword);
}

/**
 * Creates a JWT token for the given user ID.
 * @param {string|number} userId
 * @returns {string} JWT
 */
export function createToken(userId) {
  const payload = { userId };
  const expireSeconds = ACCESS_TOKEN_EXPIRES_IN_MINUTES * 60;
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: expireSeconds,
  });
  return token;
}

/**
 * Fetches the current user from a JWT token.
 * @param {string} token - Bearer token (without 'Bearer ' prefix)
 * @returns {Promise<object|null>} user object or null
 * @throws {Error} if token invalid or user not found
 */
export async function getCurrentUser(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user_id;
    const user = await prisma.user.findFirst({ where: { id: Number(userId) } });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  } catch (error) {
    const err = new Error('Invalid authentication token.');
    err.status = 401;
    err.data = { success: false, message: 'Invalid authentication token.' };
    throw err;
  }
}
