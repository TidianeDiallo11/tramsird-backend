const express = require("express");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT key, value FROM site_content").all();
  const content = {};
  for (const row of rows) content[row.key] = row.value;
  res.json(content);
});

router.put("/", requireAuth, (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return res.status(400).json({ error: "Format invalide : un objet cle/valeur est attendu." });
  }

  const upsert = db.prepare(`
    INSERT INTO site_content (key, value, updated_at)
    VALUES (@key, @value, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = datetime('now')
  `);

  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) {
      upsert.run({ key, value: String(value) });
    }
  });
  tx(Object.entries(updates));

  const rows = db.prepare("SELECT key, value FROM site_content").all();
  const content = {};
  for (const row of rows) content[row.key] = row.value;
  res.json(content);
});

module.exports = router;
