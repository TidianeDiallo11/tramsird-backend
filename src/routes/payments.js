const express = require("express");
const db = require("../db/init");
const { checkPaymentStatus } = require("../services/cinetpay");

const router = express.Router();

router.post("/webhook", async (req, res) => {
  const transactionId = req.body.cpm_trans_id || req.body.transaction_id;

  if (!transactionId) {
    return res.status(400).json({ error: "transaction_id manquant." });
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(transactionId);
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
      const items = JSON.parse(order.items);
      const decrementStock = db.prepare(
        "UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?"
      );
      const tx = db.transaction(() => {
        for (const item of items) {
          decrementStock.run(item.qty, item.product_id);
        }
        db.prepare(`
          UPDATE orders SET
            payment_status = 'paid',
            payment_method = @method,
            cinetpay_transaction_id = @transactionId,
            status = 'processing',
            updated_at = datetime('now')
          WHERE id = @orderId
        `).run({
          method: (result.paymentMethod || "").toLowerCase().includes("orange") ? "orange_money" : "card",
          transactionId,
          orderId: order.id,
        });
      });
      tx();

      console.log(`Paiement confirme pour commande ${order.id}`);
    } else {
      db.prepare(`
        UPDATE orders SET payment_status = 'failed', updated_at = datetime('now') WHERE id = ?
      `).run(order.id);
      console.log(`Paiement refuse/echoue pour commande ${order.id}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Erreur verification paiement:", err.message);
    res.status(200).json({ ok: false, error: "Verification echouee, a controler manuellement." });
  }
});

router.get("/status/:orderId", async (req, res) => {
  const order = db.prepare("SELECT payment_status, status FROM orders WHERE id = ?").get(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Commande introuvable." });
  res.json(order);
});

module.exports = router;
