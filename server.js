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

    const { lang } = req.body;

const localeMap = {
  ru: 'ru',
  et: 'et',
  en: 'en'
};

const session = await stripe.checkout.sessions.create({
  mode: "payment",
  payment_method_types: ["card"],
  line_items,
  discounts,
  success_url: "https://SUSHIX0.github.io/test/success.html?session_id={CHECKOUT_SESSION_ID}",
  cancel_url: "https://SUSHIX0.github.io/test/cancel.html",
  locale: localeMap[lang] || 'auto'  // ← установка языка
});


    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
});

// Роут для проверки, что сервер жив
app.get("/ping", (req, res) => {
  res.send("Alive!");
});


// Запуск сервера
app.listen(4242, () => {
  console.log("🚀 Server running on http://localhost:4242");
});
