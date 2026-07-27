const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis." });
  }

  const admin = await db.one("SELECT * FROM admins WHERE email = $1", [email.toLowerCase().trim()]);

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Identifiants incorrects." });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, email: admin.email });
});

router.get("/me", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Non authentifie." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ email: payload.email });
  } catch {
    res.status(401).json({ error: "Session invalide." });
  }
});

router.put("/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Mot de passe actuel et nouveau mot de passe requis." });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 8 caracteres." });
  }

  const admin = await db.one("SELECT * FROM admins WHERE id = $1", [req.admin.id]);
  if (!admin) {
    return res.status(404).json({ error: "Compte introuvable." });
  }

  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: "Mot de passe actuel incorrect." });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  await db.query("UPDATE admins SET password_hash = $1 WHERE id = $2", [newHash, admin.id]);

  res.json({ success: true });
});

module.exports = router;
