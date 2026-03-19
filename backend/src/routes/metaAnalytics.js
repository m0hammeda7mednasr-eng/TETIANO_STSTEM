import express from "express";
import { supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { getAccessibleStoreIds } from "../models/index.js";
import { emitRealtimeEvent } from "../services/realtimeEventService.js";
import {
  DEFAULT_META_LOOKBACK_DAYS,
  DEFAULT_OPENROUTER_MODEL,
  buildMetaInsightSnapshots,
  buildMetaOverview,
  fetchMetaAdAccounts,
  fetchMetaAdSets,
  fetchMetaAds,
  fetchMetaCampaigns,
  fetchMetaInsightsForAccount,
  fetchOpenRouterModels,
  generateOpenRouterMetaAnalysis,
} from "../services/metaAnalyticsService.js";

const router = express.Router();
const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const META_SCHEMA_ERROR = {
  code: "META_ANALYTICS_SCHEMA_MISSING",
  error:
    "Meta Analytics tables are missing. Run ADD_META_ANALYTICS_MODULE.sql first.",
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value) => String(value || "").trim();

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const isSchemaCompatibilityError = (error) => {
  if (!error) {
    return false;
  }

  const code = normalizeText(error.code).toUpperCase();
  if (SCHEMA_ERROR_CODES.has(code)) {
    return true;
  }

  const text =
    `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();

  return (
    text.includes("does not exist") ||
    text.includes("relation") ||
    text.includes("column")
  );
};

const getRequestedStoreId = (req) => {
  const headerStoreId =
    typeof req.headers["x-store-id"] === "string"
      ? req.headers["x-store-id"].trim()
      : "";
  const queryStoreId =
    typeof req.query?.store_id === "string" ? req.query.store_id.trim() : "";

  return queryStoreId || headerStoreId || "";
};

const resolveStoreScope = async (req) => {
  const requestedStoreId = getRequestedStoreId(req);
  if (requestedStoreId) {
    if (req.user?.role === "admin") {
      return requestedStoreId;
    }

    const accessibleStoreIds = await getAccessibleStoreIds(req.user.id);
    if (accessibleStoreIds.includes(requestedStoreId)) {
      return requestedStoreId;
    }

    return "";
  }

  const accessibleStoreIds = await getAccessibleStoreIds(req.user.id);
  return accessibleStoreIds.length === 1 ? accessibleStoreIds[0] : "";
};

const parseCommaList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const maskSecret = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 8) {
    return "********";
  }
  return normalized.slice(0, 4) + "****" + normalized.slice(-4);
};

const normalizeIntegrationPayload = (row = null) => ({
  connected: Boolean(row),
  meta: {
    configured: Boolean(normalizeText(row?.meta_access_token)),
    connected: Boolean(row?.is_meta_connected),
    business_id: normalizeText(row?.meta_business_id),
    ad_account_ids: normalizeArray(row?.meta_ad_account_ids),
    page_id: normalizeText(row?.meta_page_id),
    pixel_id: normalizeText(row?.meta_pixel_id),
    masked_access_token: maskSecret(row?.meta_access_token),
    last_sync_at: row?.last_meta_sync_at || null,
    last_sync_status: normalizeText(row?.last_meta_sync_status) || "idle",
    last_sync_error: normalizeText(row?.last_meta_sync_error),
  },
  openrouter: {
    configured: Boolean(normalizeText(row?.openrouter_api_key)),
    connected: Boolean(row?.is_openrouter_connected),
    model: normalizeText(row?.openrouter_model) || DEFAULT_OPENROUTER_MODEL,
    site_url: normalizeText(row?.openrouter_site_url),
    site_name: normalizeText(row?.openrouter_site_name),
    masked_api_key: maskSecret(row?.openrouter_api_key),
    last_analysis_at: row?.last_ai_analysis_at || null,
  },
});

const loadIntegration = async (storeId) => {
  const { data, error } = await supabase
    .from("meta_integrations")
    .select("*")
    .eq("store_id", storeId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const saveIntegration = async ({ storeId, userId, updates }) => {
  const { data, error } = await supabase
    .from("meta_integrations")
    .upsert(
      {
        store_id: storeId,
        updated_by: userId,
        created_by: userId,
        ...updates,
      },
      {
        onConflict: "store_id",
      },
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const loadOverviewData = async ({ storeId, days }) => {
  const normalizedDays = Math.max(1, toNumber(days) || DEFAULT_META_LOOKBACK_DAYS);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - normalizedDays + 1);
  const since = startDate.toISOString().slice(0, 10);

  const [integrationResult, snapshotsResult, syncRunsResult, analysesResult] =
    await Promise.all([
      supabase
        .from("meta_integrations")
        .select("*")
        .eq("store_id", storeId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("meta_insight_snapshots")
        .select("*")
        .eq("store_id", storeId)
        .gte("date_start", since)
        .order("date_start", { ascending: true }),
      supabase
        .from("meta_sync_runs")
        .select("*")
        .eq("store_id", storeId)
        .order("started_at", { ascending: false })
        .limit(8),
      supabase
        .from("meta_ai_analyses")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  for (const result of [
    integrationResult,
    snapshotsResult,
    syncRunsResult,
    analysesResult,
  ]) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    integration: integrationResult.data || null,
    snapshots: normalizeArray(snapshotsResult.data),
    syncRuns: normalizeArray(syncRunsResult.data),
    analyses: normalizeArray(analysesResult.data),
    days: normalizedDays,
  };
};

const handleSchemaAwareError = (res, error, fallbackMessage) => {
  if (isSchemaCompatibilityError(error)) {
    return res.status(503).json(META_SCHEMA_ERROR);
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({
    error: fallbackMessage,
  });
};

router.use(authenticateToken, requirePermission("can_manage_settings"));

router.get("/status", async (req, res) => {
  try {
    const storeId = await resolveStoreScope(req);
    if (!storeId) {
      return res.status(400).json({
        error:
          "Select a store first before configuring Meta & Analytics integrations.",
      });
    }

    const integration = await loadIntegration(storeId);

    return res.json({
      schemaReady: true,
      store_id: storeId,
      integration: normalizeIntegrationPayload(integration),
    });
  } catch (error) {
    return handleSchemaAwareError(
      res,
      error,
      "Failed to load Meta & Analytics status",
    );
  }
});

router.put("/config/meta", async (req, res) => {
  try {
    const storeId = await resolveStoreScope(req);
    if (!storeId) {
      return res.status(400).json({
        error: "Select a store first before saving Meta configuration.",
      });
    }

    const existingIntegration = await loadIntegration(storeId);
    const nextAccessToken = normalizeText(req.body?.access_token)
      ? normalizeText(req.body?.access_token)
      : normalizeText(existingIntegration?.meta_access_token);

    const nextIntegration = await saveIntegration({
      storeId,
      userId: req.user.id,
      updates: {
        meta_access_token: nextAccessToken,
        meta_business_id: normalizeText(req.body?.business_id),
        meta_ad_account_ids: normalizeArray(
          Array.isArray(req.body?.ad_account_ids)
            ? req.body.ad_account_ids
            : parseCommaList(req.body?.ad_account_ids),
        ),
        meta_page_id: normalizeText(req.body?.page_id),
        meta_pixel_id: normalizeText(req.body?.pixel_id),
        is_meta_connected:
          existingIntegration?.is_meta_connected &&
          Boolean(nextAccessToken),
        last_meta_sync_error: "",
      },
    });

    emitRealtimeEvent({
      userIds: [req.user.id],
      storeIds: [storeId],
      payload: {
        resource: "meta_analytics",
        context: "meta_config_saved",
      },
    });

    return res.json({
      success: true,
      integration: normalizeIntegrationPayload(nextIntegration),
    });
  } catch (error) {
    return handleSchemaAwareError(
      res,
      error,
      "Failed to save Meta configuration",
    );
  }
});

router.put("/config/openrouter", async (req, res) => {
  try {
    const storeId = await resolveStoreScope(req);
    if (!storeId) {
      return res.status(400).json({
        error: "Select a store first before saving OpenRouter configuration.",
      });
    }

    const existingIntegration = await loadIntegration(storeId);
    const nextApiKey = normalizeText(req.body?.api_key)
      ? normalizeText(req.body?.api_key)
      : normalizeText(existingIntegration?.openrouter_api_key);

    const nextIntegration = await saveIntegration({
      storeId,
      userId: req.user.id,
      updates: {
        openrouter_api_key: nextApiKey,
        openrouter_model:
          normalizeText(req.body?.model) || DEFAULT_OPENROUTER_MODEL,
        openrouter_site_url: normalizeText(req.body?.site_url),
        openrouter_site_name: normalizeText(req.body?.site_name),
        is_openrouter_connected:
          existingIntegration?.is_openrouter_connected &&
          Boolean(nextApiKey),
      },
    });

    emitRealtimeEvent({
      userIds: [req.user.id],
      storeIds: [storeId],
      payload: {
        resource: "meta_analytics",
        context: "openrouter_config_saved",
      },
    });

    return res.json({
      success: true,
      integration: normalizeIntegrationPayload(nextIntegration),
    });
  } catch (error) {
    return handleSchemaAwareError(
      res,
      error,
      "Failed to save OpenRouter configuration",
    );
  }
});

router.get("/models", async (req, res) => {
  try {
    const storeId = await resolveStoreScope(req);
    if (!storeId) {
      return res.json({ data: [] });
    }

    const integration = await loadIntegration(storeId);
    const apiKey =
      normalizeText(req.query?.api_key) ||
      normalizeText(integration?.openrouter_api_key) ||
      normalizeText(process.env.OPENROUTER_API_KEY);

    if (!apiKey) {
      return res.json({ data: [] });
    }

    const models = await fetchOpenRouterModels({ apiKey });

    if (integration?.id) {
      await saveIntegration({
        storeId,
        userId: req.user.id,
        updates: {
          is_openrouter_connected: true,
        },
      });
    }

    return res.json({ data: models });
  } catch (error) {
    return handleSchemaAwareError(
      res,
      error,
      "Failed to load OpenRouter models",
    );
  }
});

router.post("/sync", async (req, res) => {
  const startedAt = new Date().toISOString();
  let syncRunId = null;
  let storeId = "";

  try {
    storeId = await resolveStoreScope(req);
    if (!storeId) {
      return res.status(400).json({
        error: "Select a store first before syncing Meta data.",
      });
    }

    const integration = await loadIntegration(storeId);
    if (!integration) {
      return res.status(400).json({
        error: "Save Meta configuration first before syncing data.",
      });
    }

    const accessToken = normalizeText(integration.meta_access_token);
    if (!accessToken) {
      return res.status(400).json({
        error: "Meta access token is required before syncing data.",
      });
    }

    const { since, until } = req.body?.since && req.body?.until
      ? { since: normalizeText(req.body.since), until: normalizeText(req.body.until) }
      : (() => {
          const days = Math.max(
            1,
            toNumber(req.body?.days) || DEFAULT_META_LOOKBACK_DAYS,
          );
          const endDate = new Date();
          const startDate = new Date(endDate);
          startDate.setDate(endDate.getDate() - days + 1);
          return {
            since: startDate.toISOString().slice(0, 10),
            until: endDate.toISOString().slice(0, 10),
          };
        })();

    const syncRunResult = await supabase
      .from("meta_sync_runs")
      .insert({
        integration_id: integration.id,
        store_id: storeId,
        triggered_by: req.user.id,
        sync_type: "manual",
        status: "running",
        started_at: startedAt,
        date_start: since,
        date_stop: until,
      })
      .select()
      .single();

    if (syncRunResult.error) {
      throw syncRunResult.error;
    }

    syncRunId = syncRunResult.data?.id || null;

    const adAccounts = await fetchMetaAdAccounts({
      accessToken,
      businessId: integration.meta_business_id,
      adAccountIds: integration.meta_ad_account_ids,
    });

    const syncPayloads = await Promise.all(
      adAccounts.map(async (account) => {
        const [campaigns, adsets, ads, insights] = await Promise.all([
          fetchMetaCampaigns({ accessToken, adAccountId: account.id }),
          fetchMetaAdSets({ accessToken, adAccountId: account.id }),
          fetchMetaAds({ accessToken, adAccountId: account.id }),
          fetchMetaInsightsForAccount({
            accessToken,
            adAccountId: account.id,
            since,
            until,
          }),
        ]);

        return {
          account,
          campaigns,
          adsets,
          ads,
          snapshots: buildMetaInsightSnapshots({
            integrationId: integration.id,
            storeId,
            account,
            insightRows: insights,
          }),
        };
      }),
    );

    const snapshots = syncPayloads.flatMap((item) => item.snapshots);
    const campaigns = syncPayloads.flatMap((item) => item.campaigns);
    const adsets = syncPayloads.flatMap((item) => item.adsets);
    const ads = syncPayloads.flatMap((item) => item.ads);

    if (snapshots.length > 0) {
      const { error: snapshotError } = await supabase
        .from("meta_insight_snapshots")
        .upsert(snapshots, {
          onConflict:
            "integration_id,object_type,object_id,date_start,date_stop",
        });

      if (snapshotError) {
        throw snapshotError;
      }
    }

    const overview = buildMetaOverview({
      snapshots,
      accounts: adAccounts,
      campaigns,
      adsets,
      ads,
    });

    const completedAt = new Date().toISOString();
    const updateIntegrationResult = await supabase
      .from("meta_integrations")
      .update({
        is_meta_connected: true,
        last_meta_sync_at: completedAt,
        last_meta_sync_status: "completed",
        last_meta_sync_error: "",
        updated_by: req.user.id,
      })
      .eq("id", integration.id);

    if (updateIntegrationResult.error) {
      throw updateIntegrationResult.error;
    }

    if (syncRunId) {
      const syncRunUpdateResult = await supabase
        .from("meta_sync_runs")
        .update({
          status: "completed",
          completed_at: completedAt,
          payload_summary: {
            accounts_count: adAccounts.length,
            campaigns_count: campaigns.length,
            adsets_count: adsets.length,
            ads_count: ads.length,
            snapshots_count: snapshots.length,
            summary: overview.summary,
          },
        })
        .eq("id", syncRunId);

      if (syncRunUpdateResult.error) {
        throw syncRunUpdateResult.error;
      }
    }

    emitRealtimeEvent({
      userIds: [req.user.id],
      storeIds: [storeId],
      payload: {
        resource: "meta_analytics",
        context: "sync_completed",
      },
    });

    return res.json({
      success: true,
      sync: {
        started_at: startedAt,
        completed_at: completedAt,
        since,
        until,
        accounts_count: adAccounts.length,
        snapshots_count: snapshots.length,
      },
      overview,
    });
  } catch (error) {
    if (syncRunId) {
      await supabase
        .from("meta_sync_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: normalizeText(error.message || error),
        })
        .eq("id", syncRunId);
    }

    if (storeId) {
      await supabase
        .from("meta_integrations")
        .update({
          is_meta_connected: false,
          last_meta_sync_status: "failed",
          last_meta_sync_error: normalizeText(error.message || error),
          updated_by: req.user.id,
        })
        .eq("store_id", storeId);
    }

    return handleSchemaAwareError(
      res,
      error,
      "Failed to sync Meta Business data",
    );
  }
});

router.get("/overview", async (req, res) => {
  try {
    const storeId = await resolveStoreScope(req);
    if (!storeId) {
      return res.status(400).json({
        error: "Select a store first before opening Meta analytics.",
      });
    }

    const data = await loadOverviewData({
      storeId,
      days: req.query?.days,
    });

    return res.json({
      store_id: storeId,
      days: data.days,
      integration: normalizeIntegrationPayload(data.integration),
      overview: buildMetaOverview({
        snapshots: data.snapshots,
      }),
      sync_runs: data.syncRuns,
      analyses: data.analyses,
    });
  } catch (error) {
    return handleSchemaAwareError(
      res,
      error,
      "Failed to load Meta analytics overview",
    );
  }
});

router.post("/analyze", async (req, res) => {
  try {
    const storeId = await resolveStoreScope(req);
    if (!storeId) {
      return res.status(400).json({
        error: "Select a store first before generating AI analysis.",
      });
    }

    const integration = await loadIntegration(storeId);
    if (!integration) {
      return res.status(400).json({
        error: "Save Meta & OpenRouter configuration first.",
      });
    }

    const openRouterApiKey =
      normalizeText(integration.openrouter_api_key) ||
      normalizeText(process.env.OPENROUTER_API_KEY);
    if (!openRouterApiKey) {
      return res.status(400).json({
        error: "OpenRouter API key is required before generating analysis.",
      });
    }

    const data = await loadOverviewData({
      storeId,
      days: req.body?.days || req.query?.days,
    });

    const overview = buildMetaOverview({
      snapshots: data.snapshots,
    });

    if (overview.summary.rows_count === 0) {
      return res.status(400).json({
        error: "Sync Meta data first. No advertising data is available yet.",
      });
    }

    const analysis = await generateOpenRouterMetaAnalysis({
      apiKey: openRouterApiKey,
      model:
        normalizeText(req.body?.model) ||
        normalizeText(integration.openrouter_model) ||
        DEFAULT_OPENROUTER_MODEL,
      siteUrl:
        normalizeText(req.body?.site_url) ||
        normalizeText(integration.openrouter_site_url),
      siteName:
        normalizeText(req.body?.site_name) ||
        normalizeText(integration.openrouter_site_name),
      overview,
      focus: normalizeText(req.body?.focus),
    });

    const insertResult = await supabase
      .from("meta_ai_analyses")
      .insert({
        integration_id: integration.id,
        store_id: storeId,
        user_id: req.user.id,
        model: analysis.model,
        focus_area: normalizeText(req.body?.focus),
        prompt_payload: analysis.prompt,
        response_payload: analysis.raw,
        summary_json: analysis.parsed || {},
        recommendation_text: analysis.content,
      })
      .select()
      .single();

    if (insertResult.error) {
      throw insertResult.error;
    }

    const updateResult = await supabase
      .from("meta_integrations")
      .update({
        is_openrouter_connected: true,
        last_ai_analysis_at: new Date().toISOString(),
        updated_by: req.user.id,
      })
      .eq("id", integration.id);

    if (updateResult.error) {
      throw updateResult.error;
    }

    emitRealtimeEvent({
      userIds: [req.user.id],
      storeIds: [storeId],
      payload: {
        resource: "meta_analytics",
        context: "analysis_created",
      },
    });

    return res.json({
      success: true,
      analysis: insertResult.data,
    });
  } catch (error) {
    return handleSchemaAwareError(
      res,
      error,
      "Failed to generate Meta AI analysis",
    );
  }
});

export default router;
