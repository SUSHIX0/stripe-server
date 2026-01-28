// server.js
import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';

const app = express();

// Хранилище заказов в памяти (можно заменить на БД)
const ordersCache = new Map();

// CORS и JSON парсер
app.use(cors());
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next(); // raw middleware сработает для вебхука
  } else {
    express.json()(req, res, next);
  }
});

// Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ===== Создание Checkout-сессии =====
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { cart, delivery = 0, promo, lang, orderData } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) return res.status(400).json({ error: 'Корзина пуста' });
    if (!orderData) return res.status(400).json({ error: 'Нет данных заказа' });

    // Создаем уникальный ID заказа
    const orderId = Date.now().toString();
    ordersCache.set(orderId, orderData); // сохраняем заказ в кэше

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

    const discounts = [];
    if (promo && promo.type && promo.value) {
      let coupon;
      if (promo.type === 'cart_discount') {
        coupon = await stripe.coupons.create({ percent_off: promo.value, duration: 'once' });
      } else if (promo.type === 'flat_discount' || promo.type === 'min_total_discount') {
        coupon = await stripe.coupons.create({ amount_off: Math.round(promo.value * 100), currency: 'eur', duration: 'once' });
      }
      if (coupon) discounts.push({ coupon: coupon.id });
    }

    const localeMap = { ru: 'ru', et: 'et', en: 'en' };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      discounts,
      metadata: { orderId }, // передаем только ID заказа
      success_url: 'https://SUSHIX0.github.io/test/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://SUSHIX0.github.io/test/cancel.html',
      locale: localeMap[lang] || 'auto'
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stripe error' });
  }
});

// ===== Вебхук Stripe =====
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;

    if (orderId && ordersCache.has(orderId)) {
      const order = ordersCache.get(orderId);
      try {
        const token = process.env.TELEGRAM_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        // Формируем текст заказа
        let orderText = `✅ Новый заказ из Stripe (ID: ${orderId})\n\n`;
        orderText += `Имя: ${order.checkout.name}\nТелефон: ${order.checkout.phone}\nEmail: ${order.checkout.email}\n`;
        orderText += `Оплата: ${order.checkout.payment}\nМетод: ${order.checkout.method}\nДата: ${order.checkout.date || '-'}\n`;
        orderText += `Время: ${order.checkout.time || '-'}\nАдрес: ${order.checkout.address || '-'}\n`;
        orderText += `Комментарий: ${order.checkout.comment || '-'}\n\nТовары:\n`;

        let subtotal = 0;
        order.cart.forEach(item => {
          const lineTotal = item.unitPrice * item.qty;
          subtotal += lineTotal;
          orderText += `- ${item.name} x${item.qty} = ${lineTotal.toFixed(2)} €\n`;
        });

        orderText += `\nПодытог: ${subtotal.toFixed(2)} €\nДоставка: ${order.delivery.toFixed(2)} €\nСкидка: ${Math.abs(order.discount || 0).toFixed(2)} €\n`;
        orderText += `Итог: ${(subtotal - Math.abs(order.discount || 0) + order.delivery).toFixed(2)} €`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: orderText })
        });

        ordersCache.delete(orderId); // удаляем из кэша
      } catch (err) {
        console.error('Ошибка отправки на Telegram:', err);
      }
    }
  }

  res.json({ received: true });
});

// ===== Проверка сервера =====
app.get('/ping', (req, res) => res.send('Alive!'));

// ===== Запуск =====
app.listen(4242, () => console.log('🚀 Stripe server running on port 4242'));
