import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes/index";
import { logger } from "./lib/logger";
import passport from "./lib/passport";
import {
  PUBLIC_URL,
  WEB_ORIGINS,
  COOKIE_SAME_SITE,
  SESSION_SECRET,
  IS_PRODUCTION,
} from "./lib/env";
import { pool } from "@golog/db";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = WEB_ORIGINS;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("غير مسموح لهذا الأصل (CORS)"));
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عدد محاولات كبير جداً، يرجى المحاولة لاحقاً" },
});
app.use("/api/auth", authLimiter);

const sameSite = COOKIE_SAME_SITE;

const PgSession = ConnectPgSimple(session);

app.use(
  session({
    store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: sameSite === "none" ? true : IS_PRODUCTION,
      httpOnly: true,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/api", router);

let staticDir: string;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  staticDir = path.join(__dirname, "..", "public");
} catch {
  staticDir = path.join(process.cwd(), "packages", "api-server", "public");
}

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info("serving frontend from " + staticDir);
}

export default app;
