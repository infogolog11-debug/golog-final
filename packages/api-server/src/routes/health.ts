import { Router } from "express";
import {
  PUBLIC_URL,
  GOOGLE_CLIENT_ID,
  TELEGRAM_BOT_TOKEN,
  DATABASE_URL,
  SUPABASE_PROJECT_REF,
  TWILIO_ACCOUNT_SID,
} from "../lib/env";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "golog-api",
    publicUrl: PUBLIC_URL,
    features: {
      googleOAuth: !!GOOGLE_CLIENT_ID,
      telegramBot: !!TELEGRAM_BOT_TOKEN,
      database: !!DATABASE_URL,
      objectStorage: !!SUPABASE_PROJECT_REF,
      sms: !!TWILIO_ACCOUNT_SID,
    },
  });
});

router.get("/health/env", (_req, res) => {
  res.json({
    PUBLIC_URL,
    features: {
      googleOAuth: { configured: !!GOOGLE_CLIENT_ID, callback: PUBLIC_URL + "/api/auth/google/callback" },
      telegramBot: !!TELEGRAM_BOT_TOKEN,
      database: !!DATABASE_URL,
      objectStorage: !!SUPABASE_PROJECT_REF,
      sms: !!TWILIO_ACCOUNT_SID,
    },
  });
});

export default router;
