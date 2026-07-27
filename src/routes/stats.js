const express = require("express");
const db = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/dashboard", requireAuth, async (req, res) => {
  const totalRevenue = (await db.one(
    "SELECT COALESCE(SUM(total), 0)::int as sum FROM orders WHERE payment_status = 'paid'"
  )).sum;

  const paidOrdersCount = (await db.one(
    "SELECT COUNT(*)::int as count FROM orders WHERE payment_status = 'paid'"
  )).count;

  const pendingOrdersCount = (await db.one(
    "SELECT COUNT(*)::int as count FROM orders WHERE payment_status = 'pending'"
  )).count;

  const last7DaysRevenue = await db.query(`
    SELECT date_trunc('day', created_at) as day, COALESCE(SUM(total), 0)::int as revenue
    FROM orders
    WHERE payment_status = 'paid' AND created_at >= now() - interval '7 days'
    GROUP BY day
    ORDER BY day ASC
  `);

  const lowStockProducts = await db.query(
    "SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 3 ORDER BY stock ASC"
  );

  const paymentMethodBreakdown = await db.query(`
    SELECT payment_method, COUNT(*)::int as count
    FROM orders
    WHERE payment_status = 'paid' AND payment_method IS NOT NULL
    GROUP BY payment_method
  `);

  const recentOrders = await db.query(
    "SELECT id, customer_name, total, currency, payment_status, status, created_at FROM orders ORDER BY created_at DESC LIMIT 8"
  );

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
