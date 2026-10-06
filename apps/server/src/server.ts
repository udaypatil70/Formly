import express from "express";
import { logger } from "@repo/logger";
import cors from "cors";

import * as trpcExpress from "@trpc/server/adapters/express";
import { generateOpenApiDocument, createOpenApiExpressMiddleware } from "trpc-to-openapi";
import { apiReference } from "@scalar/express-api-reference";

import { serverRouter, createContext } from "@repo/api/server";
import { authHandler } from "@repo/services/auth";

import { env } from "./env";
import { uploadsRouter } from "./uploads";
import { paymentsRouter } from "./payments";

export const app = express();
const openApiDocument = generateOpenApiDocument(serverRouter, {
  title: "Formly OpenAPI",
  version: "1.0.0",
  baseUrl: env.BASE_URL.concat("/api"),
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin === env.FRONTEND_URL) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);

// Mount before JSON parsing so Better Auth can read the original request stream.
app.use("/auth", authHandler);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      // Keep the raw request body for signed webhooks (Razorpay signatures
      // are computed over the exact bytes sent).
      if (buf?.length) {
        (req as Express.Request & { rawBody?: Buffer }).rawBody = buf;
      }
    },
  }),
);

app.get("/", (_req, res) => {
  return res.json({ message: "Formly is up and running..." });
});

app.get("/health", (_req, res) => {
  return res.json({ message: "Formly server is healthy", healthy: true });
});

logger.debug(`openapi.json: ${env.BASE_URL}/openapi.json`);
app.get("/openapi.json", (_req, res) => {
  return res.json(openApiDocument);
});

logger.debug(`docs: ${env.BASE_URL}/docs`);
app.use("/docs", apiReference({ url: "/openapi.json" }));

// File uploads + downloads (multipart endpoint + immutable file serving).
app.use(uploadsRouter(env.UPLOADS_DIR));

app.use(
  "/api/payments",
  paymentsRouter(),
);

app.use(
  "/api",
  createOpenApiExpressMiddleware({
    router: serverRouter,
    createContext,
  }),
);

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: serverRouter,
    createContext,
  }),
);

export default app;
