const express = require("express");
const db = require("../db/init");
const { checkPaymentStatus } = require("../services/cinetpay");
const paypalService = require("../services/paypal");

const router = express.Router();

async function confirmPaidOrder(order, method) {
  const items = JSON.parse(order.items);
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      await client.query(
        "UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2",
        [item.qty, item.product_id]
      );
    }
    await client.query(
      `UPDATE orders SET
        payment_status = 'paid',
        payment_method = $1,
        status = 'processing',
        updated_at = now()
      WHERE id = $2`,
      [method, order.id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

router.post("/paypal/capture/:orderId", async (req, res) => {
  const order = await db.one("SELECT * FROM orders WHERE id = $1", [req.params.orderId]);
  if (!order) return res.status(404).json({ error: "Commande introuvable." });
  if (!order.paypal_order_id) {
    return res.status(400).json({ error: "Aucune commande PayPal associee a cette commande." });
  }

  if (order.payment_status === "paid") {
    return res.status(200).json({ ok: true, status: "paid", alreadyProcessed: true });
  }

  try {
    const result = await paypalService.captureOrder(order.paypal_order_id);

    if (result.status === "COMPLETED") {
      await confirmPaidOrder(order, "paypal");
      console.log(`Paiement PayPal confirme pour commande ${order.id}`);
      return res.json({ ok: true, status: "paid" });
    }

    await db.query(
      "UPDATE orders SET payment_status = 'failed', updated_at = now() WHERE id = $1",
      [order.id]
    );
    res.json({ ok: true, status: "failed" });
  } catch (err) {
    const details = err.response?.data?.details || [];
    const alreadyCaptured = details.some((d) => d.issue === "ORDER_ALREADY_CAPTURED");
    if (alreadyCaptured) {
      if (order.payment_status !== "paid") await confirmPaidOrder(order, "paypal");
      return res.json({ ok: true, status: "paid" });
    }
    console.error("Erreur capture PayPal:", err.response?.data || err.message);
    res.status(502).json({ error: "Impossible de confirmer le paiement PayPal.", status: "error" });
  }
});

router.post("/webhook", async (req, res) => {
  const transactionId = req.body.cpm_trans_id || req.body.transaction_id;

  if (!transactionId) {
    return res.status(400).json({ error: "transaction_id manquant." });
  }

  const order = await db.one("SELECT * FROM orders WHERE id = $1", [transactionId]);
  if (!order) {
    console.warn(`Webhook recu pour une commande inconnue : ${transactionId}`);
    return res.status(404).json({ error: "Commande introuvable." });
  }

  if (order.payment_status === "paid") {
    return res.status(200).json({ ok: true, alreadyProcessed: true });
  }

  try {
    const result = await checkPaymentStatus(transactionId);

    if (result.status === "ACCEPTED") {
      const method = (result.paymentMethod || "").toLowerCase().includes("orange") ? "orange_money" : "card";
      await confirmPaidOrder(order, method);
      await db.query(
        "UPDATE orders SET cinetpay_transaction_id = $1 WHERE id = $2",
        [transactionId, order.id]
      );

      console.log(`Paiement confirme pour commande ${order.id}`);
    } else {
      await db.query(
        "UPDATE orders SET payment_status = 'failed', updated_at = now() WHERE id = $1",
        [order.id]
      );
      console.log(`Paiement refuse/echoue pour commande ${order.id}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Erreur verification paiement:", err.message);
    res.status(200).json({ ok: false, error: "Verification echouee, a controler manuellement." });
  }
});

router.get("/status/:orderId", async (req, res) => {
  const order = await db.one("SELECT payment_status, status FROM orders WHERE id = $1", [req.params.orderId]);
  if (!order) return res.status(404).json({ error: "Commande introuvable." });
  res.json(order);
});

module.exports = router;
