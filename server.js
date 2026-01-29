// server.js
import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';

const app = express();

/**
 * ВАЖНО:
 * - для /webhook НЕЛЬЗЯ использовать express.json()
 * - для остальных роутов МОЖНО
 */
app.use(cors());
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next(); // raw body для Stripe
  } else {
    express.json()(req, res, next);
  }
});

// Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

//
// =======================
// CREATE CHECKOUT SESSION
// =======================
//
app.post('/create-checkout-session', async (req, res) => {
  try {
    const {
      cart,
      delivery = 0,
      promo,
      lang,
      orderData
    } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'Корзина пуста' });
    }

    if (!orderData) {
      return res.status(400).json({ error: 'Нет данных заказа' });
    }

    // ⬇️ ФОРМИРУЕМ ПОЛНЫЙ ЗАКАЗ (как для налички)
    const fullOrder = {
      ...orderData,
      cart,
      delivery,
      discount: orderData.discount || 0,
      lang
    };

    // Stripe line items
    const line_items = cart
      .filter(item => item.unitPrice > 0 && item.qty > 0)
      .map(item => ({
        price_data: {
          currency: 'eur',
          product_data: { name: item.name },
          unit_amount: Math.round(item.unitPrice * 100)
        },
        quantity: item.qty
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

    // Промокоды
    const discounts = [];
    if (promo && promo.type && promo.value) {
      let coupon;

      if (promo.type === 'cart_discount') {
        coupon = await stripe.coupons.create({
          percent_off: promo.value,
          duration: 'once'
        });
      } else if (promo.type === 'flat_discount' || promo.type === 'min_total_discount') {
        coupon = await stripe.coupons.create({
          amount_off: Math.round(promo.value * 100),
          currency: 'eur',
          duration: 'once'
        });
      }

      if (coupon) discounts.push({ coupon: coupon.id });
    }

    const localeMap = { ru: 'ru', et: 'et', en: 'en' };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      discounts,
      locale: localeMap[lang] || 'auto',

      // ⬇️ ГЛАВНОЕ МЕСТО
      metadata: {
        order: JSON.stringify(fullOrder)
      },

      success_url: 'https://SUSHIX0.github.io/test/success.html',
      cancel_url: 'https://SUSHIX0.github.io/test/cancel.html'
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Stripe error' });
  }
});

//
// ==========
// STRIPE WEBHOOK
// ==========
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('❌ Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    let order = null;
    try {
      order = session.metadata?.order
        ? JSON.parse(session.metadata.order)
        : null;
    } catch (e) {
      console.error('❌ Ошибка парсинга metadata.order');
    }

    if (!order || !Array.isArray(order.cart)) {
      console.error('❌ Некорректный заказ из Stripe:', order);
      return res.json({ received: true });
    }

    try {
      // ⬇️ ОТПРАВЛЯЕМ НА TELEGRAM-СЕРВЕР
      await fetch('https://telegram-server-fcgc.onrender.com/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });

      console.log('✅ Заказ успешно отправлен в Telegram');
    } catch (err) {
      console.error('❌ Ошибка отправки в Telegram:', err);
    }
  }

  res.json({ received: true });
});

//
// =====
// HEALTHCHECK
// =====
app.get('/ping', (req, res) => {
  res.send('Alive!');
});

//
// =====
// START
// =====
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`🚀 Stripe server running on port ${PORT}`);
});
