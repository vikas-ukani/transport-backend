import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { handleStripeWebhook } from "./controllers/stripeWebhookController.js";
import prisma from "./lib/prisma.js";
import apiRouters from "./router/api/apiRouters.js";
import authRouter from "./router/api/authRouter.js";
import uploadRouter from "./router/uploadRouter.js";
const app = express();

// Middlewares
const whitelist = [
  "*",
  "http://192.168.0.101:8081",
  "192.168.0.101:8081",
  "http://localhost:8081/",
];
const corsOptions = {
  origin: whitelist,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};
app.use(cors());
// app.use(cors(corsOptions));

// Stripe webhooks require the raw body for signature verification (must be before JSON parser)
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook,
);

app.use(bodyParser.json());

// Routes

app.use("/api/auth/", authRouter);
app.use("/api/", apiRouters);

// Account verification router

app.get("/verify-account", async (req, res) => {
  try {
    const { token, email } = req.query;
    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: "Verification token and email are required.",
      });
    }

    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (err) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid token." });
    }

    // Find user by id and email
    const user = await prisma.user.findFirst({ where: { id: userId, email } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    if (user.isVerified) {
      return res.json({ success: true, message: "Account already verified." });
    }

    // Update user as verified
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    });

    // For this demo, just return success
    return res.json({
      success: true,
      message: "Account verified successfully. You can now sign in.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to verify account.",
    });
  }
});

// Assuming you have an upload router in ./router/api/uploadRouter.js
app.use("/", uploadRouter);
// Serve static files from the 'uploads' directory at the root path
app.use("/", express.static("uploads"));

app.get("/", (req, res) => {
  res.json({
    message: `Welcome to the ${
      process.env.APP_NAME || "project"
    } project via nodejs `,
  });
});

// Global error handling middleware (should be last)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(`Something broke! ${err.message}`);
});

export default app;
