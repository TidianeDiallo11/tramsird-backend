const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/init");
const { requireCustomerAuth } = require("../middleware/customerAuth");
const { sendEmail } = require("../services/email");

const router = express.Router();

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

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

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email requis." });

  const customer = await db.one("SELECT * FROM customers WHERE email = $1", [email.toLowerCase().trim()]);

  if (customer) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await db.query(
      "UPDATE customers SET reset_token_hash = $1, reset_token_expires = $2 WHERE id = $3",
      [hashToken(rawToken), expires, customer.id]
    );

    const resetUrl = `${process.env.PUBLIC_SITE_URL || ""}/reinitialiser/${customer.id}/${rawToken}`;
    sendEmail({
      to: customer.email,
      subject: "Reinitialise ton mot de passe Tramsird",
      html: `<p>Bonjour ${customer.name},</p><p>Clique sur ce lien pour reinitialiser ton mot de passe (valable 1 heure) :</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si tu n'es pas a l'origine de cette demande, ignore cet e-mail.</p>`,
    }).catch((err) => console.error("Erreur envoi email de reinitialisation:", err.message));
  }

  // Reponse identique que le compte existe ou non, pour ne pas reveler les emails inscrits.
  res.json({ success: true, message: "Si un compte existe avec cet email, un lien de reinitialisation a ete envoye." });
});

router.post("/reset-password", async (req, res) => {
  const { customerId, token, newPassword } = req.body;
  if (!customerId || !token || !newPassword) {
    return res.status(400).json({ error: "Informations manquantes." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caracteres." });
  }

  const customer = await db.one("SELECT * FROM customers WHERE id = $1", [customerId]);
  const valid =
    customer &&
    customer.reset_token_hash &&
    customer.reset_token_expires &&
    new Date(customer.reset_token_expires) > new Date() &&
    customer.reset_token_hash === hashToken(token);

  if (!valid) {
    return res.status(400).json({ error: "Lien invalide ou expire. Refais une demande de reinitialisation." });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  await db.query(
    "UPDATE customers SET password_hash = $1, reset_token_hash = NULL, reset_token_expires = NULL, updated_at = now() WHERE id = $2",
    [passwordHash, customerId]
  );

  res.json({ success: true });
});

router.get("/orders", requireCustomerAuth, async (req, res) => {
  const rows = await db.query("SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC", [req.customer.id]);
  res.json(rows.map(parseOrder));
});

module.exports = router;
