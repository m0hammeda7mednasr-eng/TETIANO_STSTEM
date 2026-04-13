import express from "express";
import { supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import notificationService from "../services/notificationService.js";
import { runSupabaseQueryWithTimeout } from "../helpers/supabaseQueryTimeout.js";

const router = express.Router();
const UNREAD_COUNT_CACHE_TTL_MS = 15 * 1000;
const UNREAD_COUNT_QUERY_TIMEOUT_MS = Math.max(
  500,
  Number(process.env.NOTIFICATIONS_COUNT_QUERY_TIMEOUT_MS) || 1200,
);
const unreadCountCache = new Map();

const isNotificationsTableMissing = (error) => {
  if (!error) return false;

  const code = String(error.code || "");
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") {
    return true;
  }

  const text =
    `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return text.includes("notifications") && text.includes("does not exist");
};

const isNotificationsSchemaUnavailable = (error) => {
  if (isNotificationsTableMissing(error)) {
    return true;
  }

  const code = String(error?.code || "");
  if (code === "42703" || code === "PGRST204") {
    return true;
  }

  const text =
    `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return (
    text.includes("column") ||
    text.includes("schema cache") ||
    text.includes("could not find")
  );
};

const getUnreadCountCacheKey = (userId) => String(userId || "").trim();

const getCachedUnreadCount = (userId) => {
  const cacheKey = getUnreadCountCacheKey(userId);
  const entry = unreadCountCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt > UNREAD_COUNT_CACHE_TTL_MS) {
    unreadCountCache.delete(cacheKey);
    return null;
  }

  return entry.value;
};

const rememberUnreadCount = (userId, value) => {
  const cacheKey = getUnreadCountCacheKey(userId);
  if (!cacheKey) {
    return;
  }

  unreadCountCache.set(cacheKey, {
    cachedAt: Date.now(),
    value: Math.max(0, Number(value) || 0),
  });
};

const invalidateUnreadCount = (userId) => {
  unreadCountCache.delete(getUnreadCountCacheKey(userId));
};

router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const unreadOnly =
      req.query.unread_only === "true" || req.query.unread_only === "1";

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;

    if (error) {
      if (isNotificationsSchemaUnavailable(error)) {
        return res.json([]);
      }
      throw error;
    }

    res.json(data || []);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.get("/unread-count", async (req, res) => {
  try {
    const cachedCount = getCachedUnreadCount(req.user.id);
    if (cachedCount !== null) {
      return res.json({ unread_count: cachedCount });
    }

    const { count, error } = await runSupabaseQueryWithTimeout(
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", req.user.id)
        .eq("is_read", false),
      {
        timeoutMs: UNREAD_COUNT_QUERY_TIMEOUT_MS,
        code: "NOTIFICATIONS_COUNT_QUERY_TIMEOUT",
      },
    );

    if (error) {
      if (isNotificationsSchemaUnavailable(error)) {
        rememberUnreadCount(req.user.id, 0);
        return res.json({ unread_count: 0 });
      }

      const staleCount = getCachedUnreadCount(req.user.id);
      return res.json({ unread_count: staleCount ?? 0 });
    }

    const unreadCount = Math.max(0, Number(count) || 0);
    rememberUnreadCount(req.user.id, unreadCount);
    res.json({ unread_count: unreadCount });
  } catch (error) {
    console.error("Error fetching unread notification count:", error);
    const staleCount = getCachedUnreadCount(req.user.id);
    res.json({ unread_count: staleCount ?? 0 });
  }
});

router.put("/:id/read", async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(
      req.params.id,
      req.user.id,
    );
    invalidateUnreadCount(req.user.id);

    res.json({ success: true, notification });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    if (isNotificationsSchemaUnavailable(error)) {
      return res.json({ success: true, notification: null });
    }
    res.status(500).json({ error: "Failed to update notification" });
  }
});

router.put("/read-all", async (req, res) => {
  try {
    await notificationService.markAllAsRead(req.user.id);
    invalidateUnreadCount(req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    if (isNotificationsSchemaUnavailable(error)) {
      return res.json({ success: true });
    }
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

export default router;
