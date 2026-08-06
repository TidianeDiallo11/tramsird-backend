const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function parsePreorder(row) {
  return { ...row, items: JSON.parse(row.items || "[]") };
}

router.post("/", async (req, res) => {
  const { customerName, customerEmail, customerPhone, shippingAddress, items } = req.body;

  if (!customerName || !customerEmail || !items || !items.length) {
    return res.status(400).json({ error: "Informations client ou selection manquantes." });
  }

  const verifiedItems = [];
  for (const item of items) {
    const product = await db.one("SELECT * FROM products WHERE id = $1", [item.productId]);
    if (!product) {
      return res.status(400).json({ error: `Produit introuvable : ${item.productId}` });
    }
    verifiedItems.push({
      product_id: product.id,
      name: product.name,
      color: item.color,
      size: item.size,
      qty: item.qty,
      unit_price: product.price,
    });
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO preorders (id, customer_name, customer_email, customer_phone, shipping_address, items, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
    [id, customerName, customerEmail, customerPhone || "", shippingAddress || "", JSON.stringify(verifiedItems)]
  );

  res.status(201).json({ id });
});

router.get("/", requireAuth, async (req, res) => {
  const rows = await db.query("SELECT * FROM preorders ORDER BY created_at DESC");
  res.json(rows.map(parsePreorder));
});

router.put("/:id/status", requireAuth, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["pending", "paid", "cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Statut invalide." });
  }

  const existing = await db.one("SELECT * FROM preorders WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Precommande introuvable." });

  await db.query("UPDATE preorders SET status = $1, updated_at = now() WHERE id = $2", [status, req.params.id]);
  res.json({ success: true });
});

module.exports = router;
