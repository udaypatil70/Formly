import express from "express";
import { logger } from "@repo/logger";
import cors from "cors";

import * as trpcExpress from "@trpc/server/adapters/express";
import { generateOpenApiDocument, createOpenApiExpressMiddleware } from "trpc-to-openapi";
import { apiReference } from "@scalar/express-api-reference";

import { serverRouter, createContext } from "@repo/api/server";
import { auth } from "@repo/services/auth";

import { env } from "./env";

export const app = express();
const openApiDocument = generateOpenApiDocument(serverRouter, {
  title: "Formforge OpenAPI",
  version: "1.0.0",
  baseUrl: env.BASE_URL.concat("/api"),
});

if (env.NODE_ENV !== "prod") {
  app.use(
    cors({
      origin: "*",
      credentials: true,
    }),
  );
}

app.use(express.json());

app.get("/", (_req, res) => {
  return res.json({ message: "Formforge is up and running..." });
});

app.get("/health", (_req, res) => {
  return res.json({ message: "Formforge server is healthy", healthy: true });
});

logger.debug(`openapi.json: ${env.BASE_URL}/openapi.json`);
app.get("/openapi.json", (_req, res) => {
  return res.json(openApiDocument);
});

logger.debug(`docs: ${env.BASE_URL}/docs`);
app.use("/docs", apiReference({ url: "/openapi.json" }));

// better-auth handler
app.all("/auth/*", async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", env.BASE_URL);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    }

    const response = await auth.handler(new Request(url, {
      method: req.method,
      headers,
      body: ["POST", "PUT", "PATCH"].includes(req.method ?? "")
        ? JSON.stringify(req.body)
        : undefined,
    }));

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const body = await response.text();
    res.send(body);
  } catch (error) {
    logger.error("Auth handler error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

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
