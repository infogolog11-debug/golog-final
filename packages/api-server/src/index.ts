import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT || 8080);

app.listen(port, () => {
  logger.info({ port }, "Golog API server listening");
});
