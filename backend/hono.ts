import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { StatusCode } from "hono/utils/http-status";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";

interface ImageEditPayload {
  prompt: string;
  images: { type: string; image: string }[];
  aspectRatio?: string;
}

const app = new Hono();

app.use("*", cors());

app.post("/api/images/edit", async (c) => {
  let payload: ImageEditPayload;

  try {
    payload = await c.req.json<ImageEditPayload>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON payload" });
  }

  const { prompt, images, aspectRatio } = payload ?? {};

  if (typeof prompt !== "string" || !Array.isArray(images) || images.length === 0) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const invalidImage = images.some((item) => item.type !== "image" || typeof item.image !== "string" || item.image.length === 0);

  if (invalidImage) {
    throw new HTTPException(400, { message: "Invalid image payload" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 60000);

  try {
    const upstream = await fetch("https://toolkit.rork.com/images/edit/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, images, aspectRatio }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      const rawError = await upstream.text();
      let message = "Image generation request failed.";

      if (rawError) {
        try {
          const parsed = JSON.parse(rawError) as { error?: unknown; text?: unknown };
          const candidate = typeof parsed.error === "string" ? parsed.error : typeof parsed.text === "string" ? parsed.text : null;

          if (candidate && candidate.length > 0) {
            const lower = candidate.toLowerCase();
            const containsSafety = lower.includes("safety") || lower.includes("blocked") || lower.includes("guard") || lower.includes("guided mode");
            message = containsSafety ? "Image request was declined. Try a different creative direction." : candidate;
          }
        } catch {
          const lowered = rawError.toLowerCase();
          const containsSafety = lowered.includes("safety") || lowered.includes("blocked") || lowered.includes("guard") || lowered.includes("guided mode");
          message = containsSafety ? "Image request was declined. Try a different creative direction." : rawError;
        }
      }

      const allowedStatuses: Partial<Record<number, StatusCode>> = {
        400: 400,
        401: 401,
        403: 403,
        404: 404,
        409: 409,
        412: 412,
        415: 415,
        422: 422,
        429: 429,
        500: 500,
        502: 502,
        503: 503,
        504: 504,
      };

      const mappedStatus = allowedStatuses[upstream.status] ?? 502;

      throw new HTTPException(mappedStatus, { message });
    }

    const data = await upstream.json();
    return c.json(data);
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof HTTPException) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new HTTPException(504, { message: "Image service timeout. Please try again." });
    }

    if (error instanceof TypeError) {
      throw new HTTPException(503, { message: "Unable to reach the image service. Check your connection and retry." });
    }

    const fallbackMessage = error instanceof Error ? error.message : "Unexpected error";
    throw new HTTPException(500, { message: fallbackMessage });
  }
});

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  })
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running" });
});

export default app;
