const axios = require("axios");

const CINETPAY_BASE_URL = "https://api-checkout.cinetpay.com/v2";

/**
 * Initie un paiement CinetPay (carte bancaire ou Orange Money selon le choix du client
 * sur la page de paiement hébergée par CinetPay).
 *
 * Doc officielle : https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation
 */
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
    channels: "ALL", // laisse CinetPay proposer carte ET Orange Money au client
    lang: "fr",
  };

  const response = await axios.post(`${CINETPAY_BASE_URL}/payment`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  // response.data.data.payment_url = lien à ouvrir/rediriger pour que le client paie
  if (response.data.code !== "201") {
    throw new Error(response.data.message || "Échec de l'initialisation du paiement CinetPay.");
  }

  return {
    paymentUrl: response.data.data.payment_url,
    paymentToken: response.data.data.payment_token,
  };
}

/**
 * Vérifie le statut réel d'une transaction auprès de CinetPay.
 * À TOUJOURS appeler après un webhook reçu, pour ne jamais faire confiance
 * uniquement au contenu du webhook (qui peut être falsifié).
 */
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
    status: data.status, // 'ACCEPTED' | 'REFUSED' | ...
    paymentMethod: data.payment_method, // ex: 'ORANGE MONEY CI', 'VISA', ...
    operatorId: data.operator_id,
    amount: data.amount,
    currency: data.currency,
    raw: data,
  };
}

module.exports = { initiatePayment, checkPaymentStatus };
