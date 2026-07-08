const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db/init");

const router = express.Router();

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis." });
  }

  const admin = db.prepare("SELECT * FROM admins WHERE email = ?").get(email.toLowerCase().trim());

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

// GET /api/auth/me  (vérifie que le token en cours est toujours valide)
router.get("/me", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Non authentifié." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ email: payload.email });
  } catch {
    res.status(401).json({ error: "Session invalide." });
  }
});

module.exports = router;
