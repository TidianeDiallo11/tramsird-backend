require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

require("./db/init");
require("./db/seed");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const paymentRoutes = require("./routes/payments");
const statsRoutes = require("./routes/stats");
const contentRoutes = require("./routes/content");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/content", contentRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true, service: "tramsird-backend" }));

app.use("/admin", express.static(path.join(__dirname, "..", "public", "admin")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur inattendue." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Tramsird backend demarre sur le port ${PORT}`);
  console.log(`Admin disponible sur /admin`);
});
