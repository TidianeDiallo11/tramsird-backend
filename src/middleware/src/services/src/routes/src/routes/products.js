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

// -----------------------------------------------------------------
// PUBLIC — utilisé par le site vitrine
// -----------------------------------------------------------------

// GET /api/products  → liste des produits actifs uniquement
router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC").all();
  res.json(rows.map(parseProduct));
});

// GET /api/products/:id
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Produit introuvable." });
  res.json(parseProduct(row));
});

// -----------------------------------------------------------------
// ADMIN — protégé par authentification
// -----------------------------------------------------------------

// GET /api/products/admin/all → liste complète, y compris produits masqués
router.get("/admin/all", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY created_at DESC").all();
  res.json(rows.map(parseProduct));
});

// POST /api/products → créer un produit
router.post("/", requireAuth, (req, res) => {
  const { name, tagline, description, price, colors, sizes, stock, image_url, active } = req.body;

  if (!name || price == null) {
    return res.status(400).json({ error: "Le nom et le prix sont obligatoires." });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO products (id, name, tagline, description, price, colors, sizes, stock, image_url, active)
    VALUES (@id, @name, @tagline, @description, @price, @colors, @sizes, @stock, @image_url, @active)
  `).run({
    id,
    name,
    tagline: tagline || "",
    description: description || "",
    price: Math.round(price),
    colors: JSON.stringify(colors || []),
    sizes: JSON.stringify(sizes || []),
    stock: stock ?? 0,
    image_url: image_url || null,
    active: active === false ? 0 : 1,
  });

  const created = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  res.status(201).json(parseProduct(created));
});

// PUT /api/products/:id → modifier un produit
router.put("/:id", requireAuth, (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Produit introuvable." });

  const {
    name, tagline, description, price, colors, sizes, stock, image_url, active,
  } = req.body;

  db.prepare(`
    UPDATE products SET
      name = @name,
      tagline = @tagline,
      description = @description,
      price = @price,
      colors = @colors,
      sizes = @sizes,
      stock = @stock,
      image_url = @image_url,
      active = @active,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: name ?? existing.name,
    tagline: tagline ?? existing.tagline,
    description: description ?? existing.description,
    price: price != null ? Math.round(price) : existing.price,
    colors: colors ? JSON.stringify(colors) : existing.colors,
    sizes: sizes ? JSON.stringify(sizes) : existing.sizes,
    stock: stock ?? existing.stock,
    image_url: image_url !== undefined ? image_url : existing.image_url,
    active: active === undefined ? existing.active : (active ? 1 : 0),
  });

  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  res.json(parseProduct(updated));
});

// DELETE /api/products/:id
router.delete("/:id", requireAuth, (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Produit introuvable." });

  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
