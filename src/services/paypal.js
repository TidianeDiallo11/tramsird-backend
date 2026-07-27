const axios = require("axios");

const PAYPAL_API_BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await axios.post(
    `${PAYPAL_API_BASE}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data.access_token;
}

async function createOrder({ orderId, amountUSD, description, returnUrl, cancelUrl }) {
  const accessToken = await getAccessToken();

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: orderId,
        invoice_id: orderId,
        description: description || "Commande Tramsird",
        amount: {
          currency_code: "USD",
          value: amountUSD.toFixed(2),
        },
      },
    ],
    application_context: {
      brand_name: "Tramsird",
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const response = await axios.post(`${PAYPAL_API_BASE}/v2/checkout/orders`, payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const approveLink = response.data.links.find((l) => l.rel === "approve");
  if (!approveLink) {
    throw new Error("Lien d'approbation PayPal introuvable.");
  }

  return { paypalOrderId: response.data.id, approveUrl: approveLink.href };
}

async function captureOrder(paypalOrderId) {
  const accessToken = await getAccessToken();

  const response = await axios.post(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`,
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

module.exports = { createOrder, captureOrder };
