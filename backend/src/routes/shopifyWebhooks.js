import express from "express";
import {
  getWebhookSecretForShop,
  handleShopifyWebhook,
  verifyWebhookHmac,
} from "../services/shopifyWebhookService.js";
import { emitRealtimeEvent } from "../services/realtimeEventService.js";

const router = express.Router();
const WEBHOOK_BACKGROUND_CONCURRENCY = Math.max(
  1,
  Number(process.env.WEBHOOK_BACKGROUND_CONCURRENCY) || 2,
);
const WEBHOOK_BACKGROUND_MAX_QUEUE = Math.max(
  100,
  Number(process.env.WEBHOOK_BACKGROUND_MAX_QUEUE) || 1000,
);
const webhookJobQueue = [];
const queuedWebhookJobsByKey = new Map();
let activeWebhookJobs = 0;

const buildWebhookJobKey = ({ topic, shopDomain, payload, webhookId }) =>
  [
    String(shopDomain || "").trim().toLowerCase(),
    String(topic || "").trim().toLowerCase(),
    String(payload?.id || payload?.admin_graphql_api_id || webhookId || "")
      .trim()
      .toLowerCase(),
  ].join("::");

const runWebhookJob = async ({ topic, shopDomain, payload, webhookId }) => {
  const result = await handleShopifyWebhook({
    topic,
    shopDomain,
    payload,
  });

  if (!result.handled) {
    return;
  }

  const topicText = String(result.topic || "").toLowerCase();
  const eventType = topicText.startsWith("orders/")
    ? "orders.updated"
    : topicText.startsWith("products/")
      ? "products.updated"
      : topicText.startsWith("inventory_levels/")
        ? "products.updated"
        : topicText.startsWith("customers/")
          ? "customers.updated"
          : "data.updated";
  emitRealtimeEvent({
    type: eventType,
    source: "shopify.webhook",
    userIds: result.affectedUserIds || [],
    storeIds: result.affectedStoreIds || [],
    payload: {
      topic: result.topic,
      webhookId: webhookId || null,
    },
  });
};

const drainWebhookQueue = () => {
  while (
    activeWebhookJobs < WEBHOOK_BACKGROUND_CONCURRENCY &&
    webhookJobQueue.length > 0
  ) {
    const queued = webhookJobQueue.shift();
    if (!queued) {
      continue;
    }

    queuedWebhookJobsByKey.delete(queued.key);
    activeWebhookJobs += 1;

    Promise.resolve(runWebhookJob(queued.job))
      .catch((backgroundError) => {
        console.error("Shopify webhook background processing error:", {
          topic: queued.job.topic,
          shopDomain: queued.job.shopDomain,
          webhookId: queued.job.webhookId || null,
          error: backgroundError?.message || backgroundError,
        });
      })
      .finally(() => {
        activeWebhookJobs -= 1;
        setImmediate(drainWebhookQueue);
      });
  }
};

const enqueueWebhookJob = (job) => {
  const key = buildWebhookJobKey(job);
  const existing = queuedWebhookJobsByKey.get(key);
  if (existing) {
    existing.job = job;
    return {
      queued: true,
      replaced: true,
      queueDepth: webhookJobQueue.length,
    };
  }

  if (webhookJobQueue.length >= WEBHOOK_BACKGROUND_MAX_QUEUE) {
    const dropped = webhookJobQueue.shift();
    if (dropped?.key) {
      queuedWebhookJobsByKey.delete(dropped.key);
    }
    console.warn("Shopify webhook queue dropped oldest job", {
      droppedTopic: dropped?.job?.topic,
      droppedShopDomain: dropped?.job?.shopDomain,
    });
  }

  const entry = { key, job };
  webhookJobQueue.push(entry);
  queuedWebhookJobsByKey.set(key, entry);
  setImmediate(drainWebhookQueue);

  return {
    queued: true,
    replaced: false,
    queueDepth: webhookJobQueue.length,
  };
};

router.post("/", async (req, res) => {
  const topic = req.get("x-shopify-topic");
  const shopDomain = req.get("x-shopify-shop-domain");
  const hmacHeader = req.get("x-shopify-hmac-sha256");
  const webhookId = req.get("x-shopify-webhook-id");

  if (!topic || !shopDomain || !hmacHeader) {
    return res.status(400).json({ error: "Missing Shopify webhook headers" });
  }

  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body || "", "utf8");

    const secret = await getWebhookSecretForShop(shopDomain);
    const validSignature = verifyWebhookHmac(rawBody, hmacHeader, secret);
    if (!validSignature) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    let payload = {};
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    const queueResult = enqueueWebhookJob({
      topic,
      shopDomain,
      payload,
      webhookId: webhookId || null,
    });

    return res.status(200).json({
      success: true,
      topic,
      webhookId: webhookId || null,
      queued: queueResult.queued,
      replaced: queueResult.replaced,
      queueDepth: queueResult.queueDepth,
    });
  } catch (error) {
    console.error("Shopify webhook processing error:", error);
    const status =
      error?.code === "WEBHOOK_SECRET_LOOKUP_TIMEOUT" ? 503 : 500;
    return res.status(status).json({ error: "Failed to process webhook" });
  }
});

export default router;
