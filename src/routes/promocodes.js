const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function computeDiscount(promo, subtotal) {
  const raw = promo.type === "percent" ? Math.round((subtotal * promo.value) / 100) : promo.value;
  return Math.max(0, Math.min(raw, subtotal));
}

async function findValidPromo(code) {
  const promo = await db.one("SELECT * FROM promo_codes WHERE code = $1", [code.trim().toUpperCase()]);
  if (!promo) return { error: "Code promo introuvable." };
  if (!promo.active) return { error: "Ce code promo n'est plus actif." };
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) return { error: "Ce code promo a expire." };
  if (promo.max_uses != null && promo.used_count >= promo.max_uses) {
    return { error: "Ce code promo a atteint sa limite d'utilisation." };
  }
  return { promo };
}

router.post("/validate", async (req, res) => {
  const { code, subtotal } = req.body;
  if (!code || typeof subtotal !== "number") {
    return res.status(400).json({ error: "Code et sous-total requis." });
  }
  const { promo, error } = await findValidPromo(code);
  if (error) return res.status(400).json({ error });

  const discountAmount = computeDiscount(promo, subtotal);
  res.json({
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    discountAmount,
  });
});

router.get("/", requireAuth, async (req, res) => {
  const rows = await db.query("SELECT * FROM promo_codes ORDER BY created_at DESC");
  res.json(rows);
});

router.post("/", requireAuth, async (req, res) => {
  const { code, type, value, maxUses, expiresAt } = req.body;
  if (!code || !value) {
    return res.status(400).json({ error: "Code et valeur requis." });
  }
  if (type !== "percent" && type !== "fixed") {
    return res.status(400).json({ error: "Type de reduction invalide." });
  }

  const id = uuidv4();
  try {
    await db.query(
      `INSERT INTO promo_codes (id, code, type, value, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, code.trim().toUpperCase(), type, Math.round(value), maxUses || null, expiresAt || null]
    );
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Ce code existe deja." });
    }
    throw err;
  }

  const promo = await db.one("SELECT * FROM promo_codes WHERE id = $1", [id]);
  res.status(201).json(promo);
});

router.put("/:id", requireAuth, async (req, res) => {
  const existing = await db.one("SELECT * FROM promo_codes WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Code promo introuvable." });

  const {
    type = existing.type,
    value = existing.value,
    maxUses = existing.max_uses,
    expiresAt = existing.expires_at,
    active = !!existing.active,
  } = req.body;

  await db.query(
    `UPDATE promo_codes SET type = $1, value = $2, max_uses = $3, expires_at = $4, active = $5, updated_at = now() WHERE id = $6`,
    [type, Math.round(value), maxUses || null, expiresAt || null, active ? 1 : 0, req.params.id]
  );

  const promo = await db.one("SELECT * FROM promo_codes WHERE id = $1", [req.params.id]);
  res.json(promo);
});

router.delete("/:id", requireAuth, async (req, res) => {
  await db.query("DELETE FROM promo_codes WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

module.exports = { router, findValidPromo, computeDiscount };
