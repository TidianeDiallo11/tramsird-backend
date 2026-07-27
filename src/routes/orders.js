const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");
const { initiatePayment } = require("../services/cinetpay");
const paypalService = require("../services/paypal");

const router = express.Router();

// Taux fixe utilise uniquement pour convertir le total XOF en USD cote PayPal
// (PayPal ne supporte pas le FCFA). Aligne sur le taux affiche au client dans le selecteur de devise.
const XOF_TO_USD = 0.00164;

function parseOrder(row) {
  return { ...row, items: JSON.parse(row.items || "[]") };
}

router.post("/", async (req, res) => {
  const {
    customerName, customerEmail, customerPhone, shippingAddress,
    items, currency, paymentMethod,
  } = req.body;

  if (!customerName || !customerEmail || !items || !items.length) {
    return res.status(400).json({ error: "Informations client ou panier manquants." });
  }

  let subtotal = 0;
  const verifiedItems = [];
  for (const item of items) {
    const product = await db.one("SELECT * FROM products WHERE id = $1 AND active = 1", [item.productId]);
    if (!product) {
      return res.status(400).json({ error: `Produit introuvable : ${item.productId}` });
    }
    if (product.stock < item.qty) {
      return res.status(400).json({ error: `Stock insuffisant pour ${product.name}.` });
    }
    const lineTotal = product.price * item.qty;
    subtotal += lineTotal;
    verifiedItems.push({
      product_id: product.id,
      name: product.name,
      color: item.color,
      size: item.size,
      qty: item.qty,
      unit_price: product.price,
    });
  }

  const shippingFee = 2000;
  const total = subtotal + shippingFee;
  const orderId = uuidv4();

  await db.query(
    `INSERT INTO orders (
      id, customer_name, customer_email, customer_phone, shipping_address,
      items, subtotal, shipping_fee, total, currency, payment_status, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', 'new')`,
    [
      orderId,
      customerName,
      customerEmail,
      customerPhone || "",
      shippingAddress || "",
      JSON.stringify(verifiedItems),
      subtotal,
      shippingFee,
      total,
      currency || "XOF",
    ]
  );

  try {
    if (paymentMethod === "paypal") {
      const amountUSD = Math.max(0.5, total * XOF_TO_USD);
      const { paypalOrderId, approveUrl } = await paypalService.createOrder({
        orderId,
        amountUSD,
        description: "Commande Tramsird",
        returnUrl: `${process.env.PUBLIC_SITE_URL}/commande/${orderId}`,
        cancelUrl: `${process.env.PUBLIC_SITE_URL}/commande/${orderId}?cancelled=1`,
      });

      await db.query(
        "UPDATE orders SET payment_provider = 'paypal', paypal_order_id = $1 WHERE id = $2",
        [paypalOrderId, orderId]
      );

      return res.status(201).json({ orderId, paymentUrl: approveUrl, total, currency: currency || "XOF" });
    }

    const channels = paymentMethod === "orange" ? "MOBILE_MONEY" : paymentMethod === "card" ? "CREDIT_CARD" : "ALL";
    const { paymentUrl } = await initiatePayment({
      orderId,
      amount: total,
      currency: currency || "XOF",
      customerName,
      customerEmail,
      customerPhone,
      description: `Commande Tramsird`,
      channels,
    });

    await db.query("UPDATE orders SET payment_provider = 'cinetpay' WHERE id = $1", [orderId]);

    res.status(201).json({ orderId, paymentUrl, total, currency: currency || "XOF" });
  } catch (err) {
    console.error("Erreur initiation paiement:", err.response?.data || err.message);
    res.status(502).json({
      error: "Impossible de contacter le service de paiement pour le moment. Reessaie dans un instant.",
      orderId,
    });
  }
});

router.get("/:id", async (req, res) => {
  const row = await db.one("SELECT * FROM orders WHERE id = $1", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Commande introuvable." });
  res.json(parseOrder(row));
});

router.get("/", requireAuth, async (req, res) => {
  const { status, payment_status } = req.query;
  let query = "SELECT * FROM orders WHERE 1=1";
  const params = [];

  if (status) {
    params.push(status);
    query += ` AND status = $${params.length}`;
  }
  if (payment_status) {
    params.push(payment_status);
    query += ` AND payment_status = $${params.length}`;
  }
  query += " ORDER BY created_at DESC";

  const rows = await db.query(query, params);
  res.json(rows.map(parseOrder));
});

router.put("/:id/status", requireAuth, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["new", "processing", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Statut invalide." });
  }

  const existing = await db.one("SELECT * FROM orders WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Commande introuvable." });

  await db.query("UPDATE orders SET status = $1, updated_at = now() WHERE id = $2", [
    status,
    req.params.id,
  ]);

  res.json({ success: true });
});

module.exports = router;
