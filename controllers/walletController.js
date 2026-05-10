import * as Wallet from "../payments/wallet.js";

/**
 * Controller: Get Wallet Balance for current user.
 * Expects req.user injected by auth middleware.
 */
export async function getWalletBalance(req, res) {
  try {
    const { id: user_id, wallet_id, cf_sub_wallet_id } = req.user;
    if (!user_id || !wallet_id) {
      return res
        .status(400)
        .json({ error: "User wallet not found or not yet created" });
    }

    const walletDetails = await Wallet.getWalletDetails({
      user_id,
      wallet_id,
      cf_sub_wallet_id,
    });
    return res.json(walletDetails);
  } catch (err) {
    console.error("getWalletBalance error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Failed to fetch wallet details" });
  }
}

/**
 * Controller: Credit wallet (top up).
 * Expects: { amount, remarks }
 */
export async function topupWallet(req, res) {
  try {
    const { id: user_id, wallet_id, cf_sub_wallet_id } = req.user;
    const { amount, remarks } = req.body;

    // Validation
    if (!user_id || !wallet_id) {
      return res
        .status(400)
        .json({ error: "Missing user_id or wallet_id for this account." });
    }
    if (
      amount === undefined ||
      amount === null ||
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        error:
          "Invalid amount provided. Amount must be a positive numeric value.",
      });
    }
    if (remarks && typeof remarks !== "string") {
      return res
        .status(400)
        .json({ error: "Remarks, if provided, must be a string." });
    }

    // For idempotency, credit_id could be generated, for now use Date.now + user_id
    const credit_id = `credit_${user_id}_${Date.now()}`;
    const result = await Wallet.creditWallet({
      credit_id,
      user_id,
      wallet_id,
      cf_sub_wallet_id,
      amount,
      remarks,
    });
    return res.json(result);
  } catch (err) {
    console.error("creditWallet error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to credit wallet",
    });
  }
}

export const createWalletOrder = async (req, res) => {
  try {
    // {
    //     "order_amount": 1.00,
    //     "order_id": "order_id"
    //     "order_currency": "INR",
    //     "customer_details": {
    //     "customer_id": "customer_id",
    //     "customer_name":  "customer_name",
    //     "customer_email": "customer_email",
    //     "customer_phone": "customer_phone"
    //     },
    //     "order_meta": {
    //     "notify_url": "https://test.cashfree.com"
    //     },
    //     "order_note": "some order note here",
    // }
    const data = req.body;
    console.log("req", data);

    const result = await Wallet.createOrder(data);
    console.log('create wallet results: ', result)
    return res.json(result);
  } catch (err) {
    console.error("createWalletOrder error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to create wallet order",
    });
  }
};

/**
 * Controller: Create wallet for a user (if not exists).
 * Expects: wallet_id (optional in req.body)
 */
export async function createWallet(req, res) {
  try {
    const { id: user_id } = req.user;
    let { wallet_id } = req.body;

    // Validation
    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id." });
    }
    if (wallet_id && typeof wallet_id !== "string") {
      return res
        .status(400)
        .json({ error: "wallet_id, if provided, must be a string." });
    }
    if (!wallet_id) {
      wallet_id = `wallet_${user_id}`;
    }

    // wallet_id pattern check (basic)
    if (!/^wallet_[a-zA-Z0-9._-]+$/.test(wallet_id)) {
      return res.status(400).json({
        error: "Invalid wallet_id format.",
      });
    }

    const result = await Wallet.createWallet({
      user_id,
      wallet_id,
    });
    return res.json(result);
  } catch (err) {
    console.error("createWallet error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to create wallet",
    });
  }
}

/**
 * Controller: Get wallet details for a user.
 * Expects: wallet_id (optional in req.query or req.body), cf_sub_wallet_id (optional)
 */
export async function getWalletDetails(req, res) {
  try {
    const { id: user_id } = req.user;
    let wallet_id = req.query.wallet_id || req.body.wallet_id;
    let cf_sub_wallet_id =
      req.query.cf_sub_wallet_id || req.body.cf_sub_wallet_id;

    // Validation
    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id." });
    }
    if (wallet_id && typeof wallet_id !== "string") {
      return res
        .status(400)
        .json({ error: "wallet_id, if provided, must be a string." });
    }
    if (cf_sub_wallet_id && typeof cf_sub_wallet_id !== "string") {
      return res
        .status(400)
        .json({ error: "cf_sub_wallet_id, if provided, must be a string." });
    }
    if (!wallet_id) {
      wallet_id = `wallet_${user_id}`;
    }
    // wallet_id pattern check (basic)
    if (!/^wallet_[a-zA-Z0-9._-]+$/.test(wallet_id)) {
      return res.status(400).json({ error: "Invalid wallet_id format." });
    }

    const result = await Wallet.getWalletDetails({
      user_id,
      wallet_id,
      cf_sub_wallet_id,
    });
    return res.json(result);
  } catch (err) {
    console.error("getWalletDetails error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to fetch wallet details",
    });
  }
}

/**
 * Controller: Get wallet statement for a user.
 * Expects: wallet_id (optional in req.query or req.body), cf_sub_wallet_id (optional),
 *          from (ISO string or timestamp), to (ISO string or timestamp)
 */
export async function getWalletStatement(req, res) {
  try {
    const { id: user_id } = req.user;
    let wallet_id = req.query.wallet_id || req.body.wallet_id;
    let cf_sub_wallet_id =
      req.query.cf_sub_wallet_id || req.body.cf_sub_wallet_id;
    let from = req.query.from || req.body.from;
    let to = req.query.to || req.body.to;

    // Validation
    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id." });
    }
    if (wallet_id && typeof wallet_id !== "string") {
      return res
        .status(400)
        .json({ error: "wallet_id, if provided, must be a string." });
    }
    if (cf_sub_wallet_id && typeof cf_sub_wallet_id !== "string") {
      return res
        .status(400)
        .json({ error: "cf_sub_wallet_id, if provided, must be a string." });
    }
    if (!wallet_id) {
      wallet_id = `wallet_${user_id}`;
    }

    // wallet_id pattern check (basic)
    if (!/^wallet_[a-zA-Z0-9._-]+$/.test(wallet_id)) {
      return res.status(400).json({ error: "Invalid wallet_id format." });
    }

    // from and to validation (should be provided)
    if (!from || !to) {
      return res
        .status(400)
        .json({ error: "Both 'from' and 'to' date parameters are required." });
    }
    // Optional: parse/validate date range (assuming ISO format or numbers)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({
        error:
          "'from' and 'to' should be valid dates (ISO string or timestamp).",
      });
    }
    if (fromDate > toDate) {
      return res
        .status(400)
        .json({ error: "'from' date must not be after 'to' date." });
    }

    const result = await Wallet.getWalletStatement({
      user_id,
      wallet_id,
      cf_sub_wallet_id,
      from,
      to,
    });
    return res.json(result);
  } catch (err) {
    console.error("getWalletStatement error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to fetch wallet statement",
    });
  }
}

export async function withdrawWalletToBank(req, res) {
  try {
    const {
      user_id,
      wallet_id,
      cf_sub_wallet_id,
      withdrawal_id,
      amount,
      ifsc,
      account_number,
      beneficiary_name,
      remarks,
    } = req.body || {};

    // Required fields validation
    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id." });
    }
    if (!wallet_id) {
      return res.status(400).json({ error: "Missing wallet_id." });
    }
    if (!cf_sub_wallet_id) {
      return res.status(400).json({ error: "Missing cf_sub_wallet_id." });
    }
    if (!withdrawal_id) {
      return res.status(400).json({ error: "Missing withdrawal_id." });
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "Invalid amount. Must be a positive number." });
    }
    if (!ifsc || typeof ifsc !== "string") {
      return res.status(400).json({ error: "Missing or invalid IFSC." });
    }
    if (!account_number || typeof account_number !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid account_number." });
    }
    if (!beneficiary_name || typeof beneficiary_name !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid beneficiary_name." });
    }

    // wallet_id pattern check (basic)
    if (!/^wallet_[a-zA-Z0-9._-]+$/.test(wallet_id)) {
      return res.status(400).json({ error: "Invalid wallet_id format." });
    }

    const result = await Wallet.withdrawWalletToBank({
      user_id,
      wallet_id,
      cf_sub_wallet_id,
      withdrawal_id,
      amount,
      ifsc,
      account_number,
      beneficiary_name,
      remarks,
    });

    return res.json(result);
  } catch (err) {
    console.error("withdrawWalletToBank error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to withdraw wallet to bank",
    });
  }
}
