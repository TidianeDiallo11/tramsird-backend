const express = require("express");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  const rows = await db.query("SELECT key, value FROM site_content");
  const content = {};
  for (const row of rows) content[row.key] = row.value;
  res.json(content);
});

router.put("/", requireAuth, async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return res.status(400).json({ error: "Format invalide : un objet cle/valeur est attendu." });
  }

  for (const [key, value] of Object.entries(updates)) {
    await db.query(
      `INSERT INTO site_content (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, String(value)]
    );
  }

  const rows = await db.query("SELECT key, value FROM site_content");
  const content = {};
  for (const row of rows) content[row.key] = row.value;
  res.json(content);
});

module.exports = router;
