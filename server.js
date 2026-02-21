// server.js
import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';

const app = express();

/**
 * ❗ ВАЖНО
 * - /webhook — ТОЛЬКО raw body
 * - остальные роуты — JSON
 */
app.use(cors());
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// =====================
// STRIPE
// =====================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// =====================
// ВРЕМЕННОЕ ХРАНИЛИЩЕ ЗАКАЗОВ
// =====================
const orders = new Map();

// =====================
// CREATE CHECKOUT SESSION
// =====================
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { cart, delivery = 0, promo, lang, orderData } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'Корзина пуста' });
    }

    if (!orderData) {
      return res.status(400).json({ error: 'Нет данных заказа' });
    }

    // 🔐 ID заказа
    const orderId = Date.now().toString();

    // 📦 Полный заказ (как для налички)
    const fullOrder = {
      ...orderData,
      cart,
      delivery,
      discount: orderData.discount || 0,
      lang,
      orderId
    };

    orders.set(orderId, fullOrder);

    // Stripe line items
    const line_items = cart
      .filter(i => i.unitPrice > 0 && i.qty > 0)
      .map(i => ({
        price_data: {
          currency: 'eur',
          product_data: { name: i.name },
          unit_amount: Math.round(i.unitPrice * 100)
        },
        quantity: i.qty
      }));

    if (delivery > 0) {
      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Доставка' },
          unit_amount: Math.round(delivery * 100)
        },
        quantity: 1
      });
    }

    // Промо
    const discounts = [];
    if (promo && promo.type && promo.value) {
      let coupon;

      if (promo.type === 'cart_discount') {
        coupon = await stripe.coupons.create({
          percent_off: promo.value,
          duration: 'once'
        });
      } else {
        coupon = await stripe.coupons.create({
          amount_off: Math.round(promo.value * 100),
          currency: 'eur',
          duration: 'once'
        });
      }

      if (coupon) discounts.push({ coupon: coupon.id });
    }

    const localeMap = { ru: 'ru', et: 'et', en: 'en' };

// 🔹 Добавляем перед stripe.checkout.sessions.create
const baseCancelUrl = 'https://SUSHIX0.github.io/test/cancel.html';
const cancel_url = `${baseCancelUrl}?lang=${lang || 'ru'}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      discounts,
      locale: localeMap[lang] || 'auto',

      // ❗ В metadata ТОЛЬКО ID
      metadata: {
        order_id: orderId
      },

      success_url: 'https://SUSHIX0.github.io/test/success.html',
        cancel_url // <-- теперь с lang
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('❌ Stripe error:', err);
    res.status(500).json({ error: 'Stripe error' });
  }
});

// =====================
// STRIPE WEBHOOK
// =====================
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('❌ Webhook signature error:', err.message);
    return res.status(400).send('Webhook Error');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    const order = orders.get(orderId);

    if (!order) {
      console.error('❌ Заказ не найден:', orderId);
      return res.json({ received: true });
    }

    try {
      await fetch('https://telegram-server-fcgc.onrender.com/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });

      console.log('✅ Заказ отправлен в Telegram:', orderId);
      orders.delete(orderId);
    } catch (err) {
      console.error('❌ Ошибка отправки в Telegram:', err);
    }
  }

  res.json({ received: true });
});

// =====================
// HEALTHCHECK
// =====================
app.get('/ping', (req, res) => {
  res.send('Alive!');
});

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`🚀 Stripe server running on port ${PORT}`);
});
