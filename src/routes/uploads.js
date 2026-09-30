const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const { uploadBuffer } = require("../services/cloudinary");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Seules les images sont acceptees."));
    }
    cb(null, true);
  },
});

router.post("/", requireAuth, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Echec de l'upload." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier recu." });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ error: "Hebergement d'images non configure sur le serveur." });
    }

    try {
      const result = await uploadBuffer(req.file.buffer);
      res.json({ url: result.secure_url });
    } catch (uploadErr) {
      console.error("Erreur upload Cloudinary:", uploadErr.message);
      res.status(502).json({ error: "Impossible d'uploader l'image pour le moment." });
    }
  });
});

module.exports = router;
