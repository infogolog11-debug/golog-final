import type { Request, Response } from "express";
import app from "../packages/api-server/src/app";

export default function handler(req: Request, res: Response) {
  app(req, res, (err?: unknown) => {
    if (err) {
      console.error("[api/index] Unhandled Express error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal server error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}

