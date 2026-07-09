const axios = require("axios");

const CINETPAY_BASE_URL = "https://api-checkout.cinetpay.com/v2";

async function initiatePayment({ orderId, amount, currency, customerName, customerEmail, customerPhone, description }) {
  const payload = {
    apikey: process.env.CINETPAY_API_KEY,
    site_id: process.env.CINETPAY_SITE_ID,
    transaction_id: orderId,
    amount: Math.round(amount),
    currency: currency || "XOF",
    description: description || "Commande Tramsird",
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone_number: customerPhone || "",
    notify_url: `${process.env.PUBLIC_BACKEND_URL}/api/payments/webhook`,
    return_url: `${process.env.PUBLIC_SITE_URL}/commande/${orderId}`,
    channels: "ALL",
    lang: "fr",
  };

  const response = await axios.post(`${CINETPAY_BASE_URL}/payment`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  if (response.data.code !== "201") {
    throw new Error(response.data.message || "Echec de l'initialisation du paiement CinetPay.");
  }

  return {
    paymentUrl: response.data.data.payment_url,
    paymentToken: response.data.data.payment_token,
  };
}

async function checkPaymentStatus(transactionId) {
  const payload = {
    apikey: process.env.CINETPAY_API_KEY,
    site_id: process.env.CINETPAY_SITE_ID,
    transaction_id: transactionId,
  };

  const response = await axios.post(`${CINETPAY_BASE_URL}/payment/check`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  const data = response.data.data;
  return {
    status: data.status,
    paymentMethod: data.payment_method,
    operatorId: data.operator_id,
    amount: data.amount,
    currency: data.currency,
    raw: data,
  };
}

module.exports = { initiatePayment, checkPaymentStatus };
