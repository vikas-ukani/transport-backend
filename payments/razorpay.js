import Razorpay from "razorpay";

// Initialize Razorpay with credentials from your dashboard
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_API_KEY || "YOUR_RAZORPAY_KEY_ID",
  key_secret: process.env.RAZORPAY_SECRET_KEY || "YOUR_RAZORPAY_KEY_SECRET",
});

export const createRazorPayOrder = async ({ amount, receipt, notes, customer_details }) => {
 try {
  const order = await razorpay.orders.create({
    amount: amount * 100, // in paisa
    currency: "INR",
    receipt: receipt || `pay_order_by_user`,
    notes,
    customer_details,
  });

  return order
 } catch (error) {
  throw new Error(error.message);
 }
};

export default razorpay;
