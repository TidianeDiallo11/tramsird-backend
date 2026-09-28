const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/init");
const { requireCustomerAuth } = require("../middleware/customerAuth");

const router = express.Router();

function parseOrder(row) {
  return { ...row, items: JSON.parse(row.items || "[]") };
}

function publicCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
  };
}

router.post("/register", async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Nom, email et mot de passe requis." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caracteres." });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db.one("SELECT id FROM customers WHERE email = $1", [normalizedEmail]);
  if (existing) {
    return res.status(400).json({ error: "Un compte existe deja avec cet email." });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  await db.query(
    `INSERT INTO customers (id, name, email, password_hash, phone, address) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, name.trim(), normalizedEmail, passwordHash, phone || "", address || ""]
  );

  const token = jwt.sign({ id, email: normalizedEmail, type: "customer" }, process.env.JWT_SECRET, { expiresIn: "30d" });
  const customer = await db.one("SELECT * FROM customers WHERE id = $1", [id]);
  res.status(201).json({ token, customer: publicCustomer(customer) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis." });
  }

  const customer = await db.one("SELECT * FROM customers WHERE email = $1", [email.toLowerCase().trim()]);
  if (!customer || !bcrypt.compareSync(password, customer.password_hash)) {
    return res.status(401).json({ error: "Identifiants incorrects." });
  }

  const token = jwt.sign({ id: customer.id, email: customer.email, type: "customer" }, process.env.JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, customer: publicCustomer(customer) });
});

router.get("/me", requireCustomerAuth, async (req, res) => {
  const customer = await db.one("SELECT * FROM customers WHERE id = $1", [req.customer.id]);
  if (!customer) return res.status(404).json({ error: "Compte introuvable." });
  res.json(publicCustomer(customer));
});

router.put("/me", requireCustomerAuth, async (req, res) => {
  const { name, phone, address } = req.body;
  const existing = await db.one("SELECT * FROM customers WHERE id = $1", [req.customer.id]);
  if (!existing) return res.status(404).json({ error: "Compte introuvable." });

  await db.query(
    `UPDATE customers SET name = $1, phone = $2, address = $3, updated_at = now() WHERE id = $4`,
    [name || existing.name, phone ?? existing.phone, address ?? existing.address, req.customer.id]
  );

  const customer = await db.one("SELECT * FROM customers WHERE id = $1", [req.customer.id]);
  res.json(publicCustomer(customer));
});

router.get("/orders", requireCustomerAuth, async (req, res) => {
  const rows = await db.query("SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC", [req.customer.id]);
  res.json(rows.map(parseOrder));
});

module.exports = router;
