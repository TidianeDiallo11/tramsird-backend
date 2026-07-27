const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function parseProduct(row) {
  return {
    ...row,
    colors: JSON.parse(row.colors || "[]"),
    sizes: JSON.parse(row.sizes || "[]"),
    active: !!row.active,
  };
}

router.get("/", async (req, res) => {
  const rows = await db.query("SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC");
  res.json(rows.map(parseProduct));
});

router.get("/admin/all", requireAuth, async (req, res) => {
  const rows = await db.query("SELECT * FROM products ORDER BY created_at DESC");
  res.json(rows.map(parseProduct));
});

router.get("/:id", async (req, res) => {
  const row = await db.one("SELECT * FROM products WHERE id = $1", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Produit introuvable." });
  res.json(parseProduct(row));
});

router.post("/", requireAuth, async (req, res) => {
  const { name, tagline, description, price, colors, sizes, stock, image_url, active } = req.body;

  if (!name || price == null) {
    return res.status(400).json({ error: "Le nom et le prix sont obligatoires." });
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO products (id, name, tagline, description, price, colors, sizes, stock, image_url, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      name,
      tagline || "",
      description || "",
      Math.round(price),
      JSON.stringify(colors || []),
      JSON.stringify(sizes || []),
      stock ?? 0,
      image_url || null,
      active === false ? 0 : 1,
    ]
  );

  const created = await db.one("SELECT * FROM products WHERE id = $1", [id]);
  res.status(201).json(parseProduct(created));
});

router.put("/:id", requireAuth, async (req, res) => {
  const existing = await db.one("SELECT * FROM products WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Produit introuvable." });

  const {
    name, tagline, description, price, colors, sizes, stock, image_url, active,
  } = req.body;

  await db.query(
    `UPDATE products SET
      name = $1,
      tagline = $2,
      description = $3,
      price = $4,
      colors = $5,
      sizes = $6,
      stock = $7,
      image_url = $8,
      active = $9,
      updated_at = now()
    WHERE id = $10`,
    [
      name ?? existing.name,
      tagline ?? existing.tagline,
      description ?? existing.description,
      price != null ? Math.round(price) : existing.price,
      colors ? JSON.stringify(colors) : existing.colors,
      sizes ? JSON.stringify(sizes) : existing.sizes,
      stock ?? existing.stock,
      image_url !== undefined ? image_url : existing.image_url,
      active === undefined ? existing.active : (active ? 1 : 0),
      req.params.id,
    ]
  );

  const updated = await db.one("SELECT * FROM products WHERE id = $1", [req.params.id]);
  res.json(parseProduct(updated));
});

router.delete("/:id", requireAuth, async (req, res) => {
  const existing = await db.one("SELECT * FROM products WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Produit introuvable." });

  await db.query("DELETE FROM products WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
