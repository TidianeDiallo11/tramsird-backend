const express = require("express");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/dashboard", requireAuth, (req, res) => {
  const totalRevenue = db.prepare(
    "SELECT COALESCE(SUM(total), 0) as sum FROM orders WHERE payment_status = 'paid'"
  ).get().sum;

  const paidOrdersCount = db.prepare(
    "SELECT COUNT(*) as count FROM orders WHERE payment_status = 'paid'"
  ).get().count;

  const pendingOrdersCount = db.prepare(
    "SELECT COUNT(*) as count FROM orders WHERE payment_status = 'pending'"
  ).get().count;

  const last7DaysRevenue = db.prepare(`
    SELECT date(created_at) as day, COALESCE(SUM(total), 0) as revenue
    FROM orders
    WHERE payment_status = 'paid' AND created_at >= datetime('now', '-7 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  const lowStockProducts = db.prepare(
    "SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 3 ORDER BY stock ASC"
  ).all();

  const paymentMethodBreakdown = db.prepare(`
    SELECT payment_method, COUNT(*) as count
    FROM orders
    WHERE payment_status = 'paid' AND payment_method IS NOT NULL
    GROUP BY payment_method
  `).all();

  const recentOrders = db.prepare(
    "SELECT id, customer_name, total, currency, payment_status, status, created_at FROM orders ORDER BY created_at DESC LIMIT 8"
  ).all();

  res.json({
    totalRevenue,
    paidOrdersCount,
    pendingOrdersCount,
    last7DaysRevenue,
    lowStockProducts,
    paymentMethodBreakdown,
    recentOrders,
  });
});

module.exports = router;
