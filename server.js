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
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: "Тестовый платёж" },
          unit_amount: Math.round(amount * 100) // Stripe принимает сумму в центах
        },
        quantity: 1
      }],
      success_url: "https://SUSHIX0.github.io/test/success.html", // куда идти после успеха
      cancel_url: "https://SUSHIX0.github.io/test/cancel.html"   // куда идти после отмены
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
