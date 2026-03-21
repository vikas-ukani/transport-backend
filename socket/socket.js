/**
 * Socket.IO server for React Native app.
 *
 * Connection (React Native): pass auth.token (JWT) and auth.deviceId in socket options.
 * On connect, server emits "connected" with { socketId, deviceId, userId }.
 *
 * Events from client:
 *   - vehicle:location  { vehicleId, latitude, longitude, address?, timestamp? }
 *   - vehicle:subscribe(vehicleId) / vehicle:unsubscribe(vehicleId)
 *   - driver:location   { driverId?, latitude, longitude, address?, timestamp? }
 *   - driver:subscribe(driverId) / driver:unsubscribe(driverId)
 *
 * Events to client:
 *   - connected         { socketId, deviceId, userId }
 *   - notification      { type, title, message, ... } (real-time notifications)
 *   - vehicle:location  (broadcast to vehicle subscribers)
 *   - driver:location   (broadcast to driver subscribers)
 */
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

/** @type {import("socket.io").Server} */
let io = null;

/**
 * Maps: socketId -> { userId, deviceId },  userId -> Set(socketIds),  deviceId -> socketId
 * Used for lookups and sending notifications.
 */
const socketIdToMeta = new Map();
const userIdToSocketIds = new Map();
const deviceIdToSocketId = new Map();

/**
 * Initialize Socket.IO and attach to the HTTP server.
 * Call this from server.js after creating the HTTP server.
 * @param {import("http").Server} httpServer - Express app wrapped with http.createServer(app)
 * @param {object} options - Optional Socket.IO server options (e.g. cors)
 * @returns {import("socket.io").Server}
 */
export function initSocket(httpServer, options = {}) {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    ...options,
  });

  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.headers?.authorization?.replace?.("Bearer ", "");
    const deviceId =
      socket.handshake.auth?.deviceId || socket.handshake.query?.deviceId;

    if (!token) {
      return next(new Error("Authentication required: token missing"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId ?? decoded.user_id ?? decoded.id;
      if (!userId) return next(new Error("Invalid token: no user id"));

      const user = await prisma.user.findUnique({
        where: { id: String(userId) },
        select: { id: true },
      });
      if (!user) return next(new Error("User not found"));

      socket.userId = String(user.id);
      socket.deviceId = deviceId || null;
      next();
    } catch (err) {
      next(new Error(err.message || "Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const { userId, deviceId } = socket;
    const socketId = socket.id;

    // Store mappings for notifications and lookups
    socketIdToMeta.set(socketId, { userId, deviceId });
    if (!userIdToSocketIds.has(userId)) userIdToSocketIds.set(userId, new Set());
    userIdToSocketIds.get(userId).add(socketId);
    if (deviceId) deviceIdToSocketId.set(deviceId, socketId);

    // Join rooms for targeted emits
    socket.join(`user:${userId}`);
    if (deviceId) socket.join(`device:${deviceId}`);

    // Persist socketId and deviceId on User (optional, for server-side lookups)
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { socketId, deviceId: deviceId || undefined },
      });
    } catch (e) {
      console.warn("Socket: could not update user socketId/deviceId", e.message);
    }

    // Emit connection success with socketId and deviceId to the client (React Native)
    socket.emit("connected", {
      socketId,
      deviceId: deviceId || null,
      userId,
    });

    // ----- Vehicle location (real-time tracking) -----
    socket.on("vehicle:location", (payload) => {
      const { vehicleId, latitude, longitude, address, timestamp } =
        payload || {};
      if (!vehicleId || latitude == null || longitude == null) {
        socket.emit("error", { message: "vehicleId, latitude, longitude required" });
        return;
      }
      const data = {
        vehicleId,
        latitude: Number(latitude),
        longitude: Number(longitude),
        address: address || null,
        timestamp: timestamp || new Date().toISOString(),
        driverId: userId,
      };
      io.to(`vehicle:${vehicleId}`).emit("vehicle:location", data);
      socket.emit("vehicle:location:ack", data);
    });

    // Join vehicle room so this socket receives location updates for that vehicle
    socket.on("vehicle:subscribe", (vehicleId) => {
      if (vehicleId) socket.join(`vehicle:${vehicleId}`);
    });
    socket.on("vehicle:unsubscribe", (vehicleId) => {
      if (vehicleId) socket.leave(`vehicle:${vehicleId}`);
    });

    // ----- Driver location (real-time tracking) -----
    socket.on("driver:location", (payload) => {
      const { driverId, latitude, longitude, address, timestamp } =
        payload || {};
      const did = driverId || userId;
      if (latitude == null || longitude == null) {
        socket.emit("error", { message: "latitude and longitude required" });
        return;
      }
      const data = {
        driverId: did,
        latitude: Number(latitude),
        longitude: Number(longitude),
        address: address || null,
        timestamp: timestamp || new Date().toISOString(),
      };
      io.to(`driver:${did}`).emit("driver:location", data);
      socket.emit("driver:location:ack", data);
    });

    socket.on("driver:subscribe", (driverId) => {
      if (driverId) socket.join(`driver:${driverId}`);
    });
    socket.on("driver:unsubscribe", (driverId) => {
      if (driverId) socket.leave(`driver:${driverId}`);
    });

    socket.on("disconnect", (reason) => {
      socketIdToMeta.delete(socketId);
      const set = userIdToSocketIds.get(userId);
      if (set) {
        set.delete(socketId);
        if (set.size === 0) userIdToSocketIds.delete(userId);
      }
      if (deviceId && deviceIdToSocketId.get(deviceId) === socketId) {
        deviceIdToSocketId.delete(deviceId);
      }
    });
  });

  return io;
}

/**
 * Get the Socket.IO server instance. Use after initSocket().
 * @returns {import("socket.io").Server | null}
 */
export function getIo() {
  return io;
}

/**
 * Get socketId and deviceId for a user (first connected socket).
 * @param {string} userId
 * @returns {{ socketId: string | null, deviceId: string | null }}
 */
export function getSocketIdAndDeviceId(userId) {
  const set = userIdToSocketIds.get(String(userId));
  const socketId = set ? Array.from(set)[0] ?? null : null;
  const meta = socketId ? socketIdToMeta.get(socketId) : null;
  return {
    socketId: socketId || null,
    deviceId: (meta && meta.deviceId) || null,
  };
}

/**
 * Send a real-time notification to a user (all their connected devices).
 * @param {string} userId
 * @param {object} payload - e.g. { type, title, message, data }
 */
export function sendNotificationToUser(userId, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit("notification", payload);
}

/**
 * Send a real-time notification to a specific device.
 * @param {string} deviceId
 * @param {object} payload
 */
export function sendNotificationToDevice(deviceId, payload) {
  if (!io) return;
  io.to(`device:${deviceId}`).emit("notifications:", payload);
}

/**
 * Broadcast vehicle location to all subscribers of that vehicle.
 * @param {string} vehicleId
 * @param {object} data - { latitude, longitude, address?, timestamp? }
 */
export function broadcastVehicleLocation(vehicleId, data) {
  if (!io) return;
  io.to(`vehicle:${vehicleId}`).emit("vehicle:location", data);
}

/**
 * Broadcast driver location to all subscribers of that driver.
 * @param {string} driverId
 * @param {object} data - { latitude, longitude, address?, timestamp? }
 */
export function broadcastDriverLocation(driverId, data) {
  if (!io) return;
  io.to(`driver:${driverId}`).emit("driver:location", data);
}

export default {
  initSocket,
  getIo,
  getSocketIdAndDeviceId,
  sendNotificationToUser,
  sendNotificationToDevice,
  broadcastVehicleLocation,
  broadcastDriverLocation,
};
