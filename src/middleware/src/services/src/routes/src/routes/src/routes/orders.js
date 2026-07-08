const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");
const { initiatePayment } = require("../services/cinetpay");

const router = express.Router();

function parseOrder(row) {
  return { ...row, items: JSON.parse(row.items || "[]") };
}

// -----------------------------------------------------------------
// PUBLIC — créée par le site vitrine au moment du checkout
// -----------------------------------------------------------------

// POST /api/orders → crée la commande (statut "pending") + retourne le lien de paiement CinetPay
router.post("/", async (req, res) => {
  const {
    customerName, customerEmail, customerPhone, shippingAddress,
    items, currency,
  } = req.body;

  if (!customerName || !customerEmail || !items || !items.length) {
    return res.status(400).json({ error: "Informations client ou panier manquants." });
  }

  // Recalcule les prix côté serveur à partir de la base — ne jamais faire confiance
  // aux prix envoyés par le navigateur.
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
    const { paymentUrl } = await initiatePayment({
      orderId,
      amount: total,
      currency: currency || "XOF",
      customerName,
      customerEmail,
      customerPhone,
      description: `Commande Tramsird #${orderId.slice(0, 8)}`,
    });

    res.status(201).json({ orderId, paymentUrl, total, currency: currency || "XOF" });
  } catch (err) {
    console.error("Erreur initiation CinetPay:", err.message);
    res.status(502).json({
      error: "Impossible de contacter le service de paiement pour le moment. Réessaie dans un instant.",
      orderId,
    });
  }
});

// GET /api/orders/:id → suivi d'une commande (utilisé par la page de confirmation)
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Commande introuvable." });
  res.json(parseOrder(row));
});

// -----------------------------------------------------------------
// ADMIN — protégé
// -----------------------------------------------------------------

// GET /api/orders → liste toutes les commandes (avec filtres optionnels)
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

// PUT /api/orders/:id/status → mettre à jour le statut logistique (processing/shipped/delivered/cancelled)
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
