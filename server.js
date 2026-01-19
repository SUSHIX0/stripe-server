// server.js
import 'dotenv/config';
import express from "express";
import Stripe from "stripe";
import cors from "cors";

const app = express();

// CORS для фронта
app.use(cors());
app.use(express.json());

// Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /create-checkout-session
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { cart, delivery = 0, promo } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Корзина пуста" });
    }

    const line_items = cart
      .filter(item => item.unitPrice > 0 && item.qty > 0)
      .map(item => ({
        price_data: {
          currency: "eur",
          product_data: { name: item.name },
          unit_amount: Math.round(item.unitPrice * 100)
        },
        quantity: item.qty
      }));

    if (delivery > 0) {
      line_items.push({
        price_data: {
          currency: "eur",
          product_data: { name: "Доставка" },
          unit_amount: Math.round(delivery * 100)
        },
        quantity: 1
      });
    }

    let discounts = [];

    // ===== ПРОМО =====
    if (promo && promo.type && promo.value) {
      let coupon = null;

      if (promo.type === 'cart_discount') {
        // процентная скидка
        coupon = await stripe.coupons.create({
          percent_off: promo.value,
          duration: "once"
        });
      } else if (promo.type === 'flat_discount' || promo.type === 'min_total_discount') {
        // фиксированная скидка
        coupon = await stripe.coupons.create({
          amount_off: Math.round(promo.value * 100),
          currency: "eur",
          duration: "once"
        });
      }

      if (coupon) {
        discounts.push({ coupon: coupon.id });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      discounts,
      success_url: "https://SUSHIX0.github.io/test/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://SUSHIX0.github.io/test/cancel.html"
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
});

import fetch from 'node-fetch'; // npm install node-fetch

let lastOrderNumber = 0; // для генерации номеров заказов

// ===== POST /create-order =====
app.post("/create-order", async (req, res) => {
  try {
    const order = req.body;

    if (!order || !order.cart || order.cart.length === 0) {
      return res.status(400).json({ success: false, error: "Пустой заказ" });
    }

    lastOrderNumber++;
    const orderNumber = String(lastOrderNumber).padStart(3, '0');

    // ===== Формируем сообщение для Telegram =====
    let message = `📦 Новый заказ №${orderNumber}\n\n`;
    message += `👤 Клиент: ${order.customer.name}\n`;
    message += `📞 Телефон: ${order.customer.phone}\n`;
    message += `📧 Email: ${order.customer.email}\n`;
    message += `🏠 Адрес: ${order.customer.address || "-"}\n`;
    message += `💬 Комментарий: ${order.customer.comment || "-"}\n\n`;
    message += `🚚 Метод: ${order.delivery.method}\n`;
    message += `📅 Дата: ${order.delivery.date || "-"}\n`;
    message += `⏰ Время: ${order.delivery.time || "-"}\n\n`;
    message += `🛒 Товары:\n`;
    order.cart.forEach(i => {
      message += `- ${i.name} x${i.qty} (${i.unitPrice.toFixed(2)} €)\n`;
    });
    message += `\n💰 Сумма: ${order.totals.total.toFixed(2)} €`;

    // ===== Отправляем в Telegram =====
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    const telegramRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
    });

    const telegramData = await telegramRes.json();
    if (!telegramData.ok) {
      console.error("Ошибка Telegram:", telegramData);
      return res.status(500).json({ success: false, error: "Ошибка отправки в Telegram" });
    }

    res.json({ success: true, orderNumber });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Ошибка сервера" });
  }
});


// Запуск сервера
app.listen(4242, () => {
  console.log("🚀 Server running on http://localhost:4242");
});
