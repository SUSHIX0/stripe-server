// Подключаем переменные окружения из .env
import 'dotenv/config';

import express from "express";
import Stripe from "stripe";
import cors from "cors";

const app = express();

// CORS нужен, чтобы фронтенд (HTML) мог делать fetch к серверу
app.use(cors());

// JSON body parser для POST-запросов
app.use(express.json());

// Stripe подключаем через ключ из .env
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST endpoint для создания сессии оплаты
app.post("/create-checkout-session", async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const line_items = items.map(item => ({
  price_data: {
    currency: "eur",
    product_data: { name: item.name },
    unit_amount: Math.round(item.unit_price * 100)
  },
  quantity: item.qty
}));

// Добавляем доставку отдельным пунктом
if (delivery && delivery > 0) {
  line_items.push({
    price_data: {
      currency: "eur",
      product_data: { name: "Доставка" },
      unit_amount: Math.round(delivery * 100)
    },
    quantity: 1
  });
}

const session = await stripe.checkout.sessions.create({
  mode: "payment",
  payment_method_types: ["card"],
  line_items,
  success_url: "https://SUSHIX0.github.io/test/success.html",
  cancel_url: "https://SUSHIX0.github.io/test/cancel.html"
});


    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка создания платежа" });
  }
});

// Запуск сервера на порту 4242
app.listen(4242, () => {
  console.log("🚀 Server running on http://localhost:4242");
});
