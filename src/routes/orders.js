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
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(item.productId);
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

  db.prepare(`
    INSERT INTO orders (
      id, customer_name, customer_email, customer_phone, shipping_address,
      items, subtotal, shipping_fee, total, currency, payment_status, status
    ) VALUES (
      @id, @customerName, @customerEmail, @customerPhone, @shippingAddress,
      @items, @subtotal, @shippingFee, @total, @currency, 'pending', 'new'
    )
  `).run({
    id: orderId,
    customerName,
    customerEmail,
    customerPhone: customerPhone || "",
    shippingAddress: shippingAddress || "",
    items: JSON.stringify(verifiedItems),
    subtotal,
    shippingFee,
    total,
    currency: currency || "XOF",
  });

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

      db.prepare(
        "UPDATE orders SET payment_provider = 'paypal', paypal_order_id = ? WHERE id = ?"
      ).run(paypalOrderId, orderId);

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

    db.prepare("UPDATE orders SET payment_provider = 'cinetpay' WHERE id = ?").run(orderId);

    res.status(201).json({ orderId, paymentUrl, total, currency: currency || "XOF" });
  } catch (err) {
    console.error("Erreur initiation paiement:", err.response?.data || err.message);
    res.status(502).json({
      error: "Impossible de contacter le service de paiement pour le moment. Reessaie dans un instant.",
      orderId,
    });
  }
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Commande introuvable." });
  res.json(parseOrder(row));
});

router.get("/", requireAuth, (req, res) => {
  const { status, payment_status } = req.query;
  let query = "SELECT * FROM orders WHERE 1=1";
  const params = {};

  if (status) {
    query += " AND status = @status";
    params.status = status;
  }
  if (payment_status) {
    query += " AND payment_status = @payment_status";
    params.payment_status = payment_status;
  }
  query += " ORDER BY created_at DESC";

  const rows = db.prepare(query).all(params);
  res.json(rows.map(parseOrder));
});

router.put("/:id/status", requireAuth, (req, res) => {
  const { status } = req.body;
  const validStatuses = ["new", "processing", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Statut invalide." });
  }

  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Commande introuvable." });

  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    req.params.id
  );

  res.json({ success: true });
});

module.exports = router;
