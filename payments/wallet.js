import axios from "axios";

// Helper to normalize/handle Cashfree errors
function handleCashfreeError(err, fallbackMsg = "Cashfree error") {
  let errorObj = {
    success: false,
    message: fallbackMsg,
    raw: err?.toString?.() || "",
  };

  if (err.response && err.response.data) {
    errorObj.message =
      err.response.data.message || err.response.data.status || fallbackMsg;
    errorObj.raw = err.response.data;
    errorObj.status = err.response.status;
  } else if (err.request) {
    errorObj.message = "No response from Cashfree API";
    errorObj.raw = err.request;
  }
  return errorObj;
}

/**
 * Cashfree wallet client using Axios.
 * Expects CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_BASE_URL, CASHFREE_PROGRAM_ID etc. in env.
 */

// Create an axios instance for Cashfree
let cashfreeInstance = null;
export function getCashfreeClient() {
  if (
    !process.env.CASHFREE_CLIENT_ID ||
    !process.env.CASHFREE_CLIENT_SECRET ||
    !process.env.CASHFREE_BASE_URL
  ) {
    throw new Error(
      "CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, and CASHFREE_BASE_URL must be set",
    );
  }
  if (!cashfreeInstance) {
    cashfreeInstance = axios.create({
      baseURL: process.env.CASHFREE_BASE_URL,
      headers: {
        "x-client-id": process.env.CASHFREE_CLIENT_ID,
        "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
        "Content-Type": "application/json",
        "x-api-version": process.env.CASHFREE_API_VERSION || "2026-01-01",
      },
    });
  }
  return cashfreeInstance;
}

// General config/utility functions
export function paymentCurrency() {
  return (process.env.PAYMENT_CURRENCY || "inr").toLowerCase();
}

export function bookingPaymentAmountCents() {
  const n = parseInt(process.env.BOOKING_AMOUNT_CENTS || "500", 10);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export function vehicleRegistrationFeeCents() {
  const n = parseInt(process.env.VEHICLE_REGISTRATION_FEE_CENTS || "1000", 10);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

export function walletTopupMinCents() {
  const n = parseInt(process.env.WALLET_TOPUP_MIN_CENTS || "100", 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function walletTopupMaxCents() {
  const n = parseInt(process.env.WALLET_TOPUP_MAX_CENTS || "10000000", 10);
  return Number.isFinite(n) && n > 0 ? n : 10000000;
}

export const createOrder = async (data) => {
  try {
    const cashfree = getCashfreeClient();
    const resp = await cashfree.post("/orders", data);
    console.log("cashfree order create => ", resp);
    return resp.data;
  } catch (err) {
    return handleCashfreeError(err, "Error while creating wallet");
  }
};

// Core wallet functions (with error handling)
export async function createWallet({ user_id, wallet_id }) {
  const cashfree = getCashfreeClient();
  const cf_program_id = process.env.CASHFREE_PROGRAM_ID;
  try {
    const resp = await cashfree.post("/ppi/wallet", {
      user_id,
      cf_program_id,
      wallet_id,
    });
    return resp.data;
  } catch (err) {
    return handleCashfreeError(err, "Error while creating wallet");
  }
}

export async function getWalletDetails({
  user_id,
  wallet_id,
  cf_sub_wallet_id,
}) {
  const cashfree = getCashfreeClient();
  try {
    const resp = await cashfree.post("/ppi/wallet/details", {
      user_id,
      wallet_id,
      cf_sub_wallet_id,
    });
    return resp.data;
  } catch (err) {
    return handleCashfreeError(err, "Error while getting wallet details");
  }
}

export async function creditWallet({
  credit_id,
  user_id,
  wallet_id,
  cf_sub_wallet_id,
  amount,
  remarks,
}) {
  const cashfree = getCashfreeClient();
  try {
    const resp = await cashfree.post("/ppi/wallet/credit", {
      credit_id,
      user_id,
      wallet_id,
      cf_sub_wallet_id,
      amount,
      remarks,
    });
    return resp.data;
  } catch (err) {
    return handleCashfreeError(err, "Error while crediting wallet");
  }
}

export async function checkWalletEligibility({
  user_id,
  wallet_id,
  cf_sub_wallet_id,
  amount,
  flow_type = "DEBIT",
}) {
  const cashfree = getCashfreeClient();
  try {
    const resp = await cashfree.post("/ppi/wallet/eligibility", {
      user_id,
      wallet_id,
      cf_sub_wallet_id,
      amount,
      flow_type,
    });
    return resp.data;
  } catch (err) {
    return handleCashfreeError(err, "Error while checking wallet eligibility");
  }
}

export async function debitWallet({
  debit_id,
  user_id,
  wallet_id,
  cf_sub_wallet_id,
  amount,
  remarks,
}) {
  const cashfree = getCashfreeClient();
  try {
    const resp = await cashfree.post("/ppi/wallet/debit", {
      debit_id,
      user_id,
      wallet_id,
      cf_sub_wallet_id,
      amount,
      remarks,
    });
    return resp.data;
  } catch (err) {
    return handleCashfreeError(err, "Error while debiting wallet");
  }
}

export async function getWalletStatement({
  user_id,
  wallet_id,
  cf_sub_wallet_id,
  from,
  to,
}) {
  const cashfree = getCashfreeClient();
  try {
    const resp = await cashfree.post("/ppi/wallet/statement", {
      user_id,
      wallet_id,
      cf_sub_wallet_id,
      from,
      to,
    });
    return resp.data;
  } catch (err) {
    return handleCashfreeError(err, "Error while getting wallet statement");
  }
}

// Withdraw wallet to bank
export async function withdrawWalletToBank({
  user_id,
  wallet_id,
  cf_sub_wallet_id,
  withdrawal_id,
  amount,
  ifsc,
  account_number,
  beneficiary_name,
  remarks,
}) {
  const cashfree = getCashfreeClient();
  try {
    const resp = await cashfree.post("/ppi/wallet/withdrawal", {
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
    return resp.data;
  } catch (err) {
    return handleCashfreeError(err, "Error while withdrawing to bank");
  }
}
