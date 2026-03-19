import axios from "axios";

const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v25.0";
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-4o-mini";
const DEFAULT_META_LOOKBACK_DAYS = 30;
const META_API_TIMEOUT_MS = 60 * 1000;
const OPENROUTER_TIMEOUT_MS = 90 * 1000;
const MAX_META_PAGES = 25;
const ACTION_TYPE_GROUPS = {
  purchases: [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_web_purchase",
  ],
  leads: [
    "lead",
    "omni_lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
  ],
  linkClicks: [
    "link_click",
    "inline_link_click",
    "landing_page_view",
  ],
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeText = (value) => String(value || "").trim();

const normalizeAdAccountId = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("act_")) {
    return normalized;
  }

  const digits = normalized.replace(/[^\d]/g, "");
  return digits ? `act_${digits}` : normalized;
};

const parseJsonObject = (value, fallback = {}) => {
  if (!value) {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

const getDateRange = ({ since, until, days = DEFAULT_META_LOOKBACK_DAYS } = {}) => {
  const normalizedSince = normalizeText(since);
  const normalizedUntil = normalizeText(until);

  if (normalizedSince && normalizedUntil) {
    return {
      since: normalizedSince,
      until: normalizedUntil,
    };
  }

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - Math.max(1, toNumber(days) || DEFAULT_META_LOOKBACK_DAYS) + 1);

  return {
    since: startDate.toISOString().slice(0, 10),
    until: endDate.toISOString().slice(0, 10),
  };
};

const buildMetaHeaders = (accessToken) => ({
  Authorization: `Bearer ${accessToken}`,
});

const requestMetaPage = async ({ url, params = {}, accessToken }) => {
  const response = await axios.get(url, {
    params,
    headers: buildMetaHeaders(accessToken),
    timeout: META_API_TIMEOUT_MS,
  });
  return response.data || {};
};

const fetchMetaPaged = async ({ path, params = {}, accessToken }) => {
  let nextUrl = path.startsWith("http") ? path : `${META_GRAPH_BASE_URL}${path}`;
  let nextParams = { ...params };
  const rows = [];
  let pageCount = 0;

  while (nextUrl && pageCount < MAX_META_PAGES) {
    const payload = await requestMetaPage({
      url: nextUrl,
      params: nextParams,
      accessToken,
    });

    rows.push(...normalizeArray(payload?.data));
    nextUrl = normalizeText(payload?.paging?.next);
    nextParams = {};
    pageCount += 1;

    if (!nextUrl) {
      break;
    }
  }

  return rows;
};

const extractActionMetric = (items, actionTypes = []) => {
  const normalizedActionTypes = new Set(
    normalizeArray(actionTypes).map((value) => normalizeText(value).toLowerCase()),
  );

  return normalizeArray(items).reduce((sum, item) => {
    const actionType = normalizeText(item?.action_type).toLowerCase();
    if (!normalizedActionTypes.has(actionType)) {
      return sum;
    }

    return sum + toNumber(item?.value);
  }, 0);
};

const deriveMetricsFromInsight = (row) => {
  const spend = toNumber(row?.spend);
  const impressions = toNumber(row?.impressions);
  const reach = toNumber(row?.reach);
  const clicks = toNumber(row?.clicks);
  const inlineLinkClicks =
    toNumber(row?.inline_link_clicks) ||
    extractActionMetric(row?.actions, ACTION_TYPE_GROUPS.linkClicks);
  const purchases = extractActionMetric(row?.actions, ACTION_TYPE_GROUPS.purchases);
  const purchaseValue = extractActionMetric(
    row?.action_values,
    ACTION_TYPE_GROUPS.purchases,
  );
  const leads = extractActionMetric(row?.actions, ACTION_TYPE_GROUPS.leads);

  const ctr =
    toNumber(row?.ctr) || (impressions > 0 ? (clicks / impressions) * 100 : 0);
  const cpc = toNumber(row?.cpc) || (clicks > 0 ? spend / clicks : 0);
  const cpm = toNumber(row?.cpm) || (impressions > 0 ? (spend / impressions) * 1000 : 0);
  const frequency =
    toNumber(row?.frequency) || (reach > 0 ? impressions / reach : 0);
  const roas = spend > 0 ? purchaseValue / spend : 0;

  return {
    spend,
    impressions,
    reach,
    clicks,
    inline_link_clicks: inlineLinkClicks,
    purchases,
    purchase_value: purchaseValue,
    leads,
    ctr,
    cpc,
    cpm,
    frequency,
    roas,
  };
};

const accumulateMetricSet = (target, metrics) => {
  target.spend += toNumber(metrics?.spend);
  target.impressions += toNumber(metrics?.impressions);
  target.reach += toNumber(metrics?.reach);
  target.clicks += toNumber(metrics?.clicks);
  target.inline_link_clicks += toNumber(metrics?.inline_link_clicks);
  target.purchases += toNumber(metrics?.purchases);
  target.purchase_value += toNumber(metrics?.purchase_value);
  target.leads += toNumber(metrics?.leads);
};

const finalizeMetricSet = (metrics) => {
  const spend = toNumber(metrics?.spend);
  const impressions = toNumber(metrics?.impressions);
  const clicks = toNumber(metrics?.clicks);
  const reach = toNumber(metrics?.reach);
  const purchaseValue = toNumber(metrics?.purchase_value);

  return {
    ...metrics,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    frequency: reach > 0 ? impressions / reach : 0,
    roas: spend > 0 ? purchaseValue / spend : 0,
  };
};

const buildAggregateBucket = (id, name, extra = {}) => ({
  id,
  name,
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  inline_link_clicks: 0,
  purchases: 0,
  purchase_value: 0,
  leads: 0,
  ...extra,
});

export const aggregateMetaSnapshotRows = (rows = []) => {
  const totals = buildAggregateBucket("summary", "Summary");
  const accounts = new Map();
  const campaigns = new Map();
  const adsets = new Map();
  const ads = new Map();
  const daily = new Map();

  for (const row of normalizeArray(rows)) {
    const metrics = finalizeMetricSet(parseJsonObject(row?.metrics, {}));
    const accountId = normalizeText(row?.account_id);
    const campaignId = normalizeText(row?.campaign_id);
    const adsetId = normalizeText(row?.adset_id);
    const adId = normalizeText(row?.ad_id);
    const dateStart = normalizeText(row?.date_start);

    accumulateMetricSet(totals, metrics);

    if (accountId) {
      if (!accounts.has(accountId)) {
        accounts.set(
          accountId,
          buildAggregateBucket(accountId, row?.account_name || accountId, {
            currency: row?.currency || null,
          }),
        );
      }
      accumulateMetricSet(accounts.get(accountId), metrics);
    }

    if (campaignId) {
      if (!campaigns.has(campaignId)) {
        campaigns.set(
          campaignId,
          buildAggregateBucket(campaignId, row?.campaign_name || campaignId, {
            account_id: accountId || null,
            objective: row?.objective || null,
          }),
        );
      }
      accumulateMetricSet(campaigns.get(campaignId), metrics);
    }

    if (adsetId) {
      if (!adsets.has(adsetId)) {
        adsets.set(
          adsetId,
          buildAggregateBucket(adsetId, row?.adset_name || adsetId, {
            account_id: accountId || null,
            campaign_id: campaignId || null,
          }),
        );
      }
      accumulateMetricSet(adsets.get(adsetId), metrics);
    }

    if (adId) {
      if (!ads.has(adId)) {
        ads.set(
          adId,
          buildAggregateBucket(adId, row?.ad_name || adId, {
            account_id: accountId || null,
            campaign_id: campaignId || null,
            adset_id: adsetId || null,
          }),
        );
      }
      accumulateMetricSet(ads.get(adId), metrics);
    }

    if (dateStart) {
      if (!daily.has(dateStart)) {
        daily.set(dateStart, buildAggregateBucket(dateStart, dateStart));
      }
      accumulateMetricSet(daily.get(dateStart), metrics);
    }
  }

  const sortBySpendDesc = (left, right) => right.spend - left.spend;

  return {
    summary: finalizeMetricSet({
      spend: totals.spend,
      impressions: totals.impressions,
      reach: totals.reach,
      clicks: totals.clicks,
      inline_link_clicks: totals.inline_link_clicks,
      purchases: totals.purchases,
      purchase_value: totals.purchase_value,
      leads: totals.leads,
      accounts_count: accounts.size,
      campaigns_count: campaigns.size,
      adsets_count: adsets.size,
      ads_count: ads.size,
      rows_count: normalizeArray(rows).length,
    }),
    accounts: Array.from(accounts.values())
      .map((item) => finalizeMetricSet(item))
      .sort(sortBySpendDesc),
    campaigns: Array.from(campaigns.values())
      .map((item) => finalizeMetricSet(item))
      .sort(sortBySpendDesc),
    adsets: Array.from(adsets.values())
      .map((item) => finalizeMetricSet(item))
      .sort(sortBySpendDesc),
    ads: Array.from(ads.values())
      .map((item) => finalizeMetricSet(item))
      .sort(sortBySpendDesc),
    daily: Array.from(daily.values())
      .map((item) => finalizeMetricSet(item))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
};

const normalizeAccountRow = (row) => ({
  id: normalizeAdAccountId(row?.id || row?.account_id),
  account_id: normalizeText(row?.account_id || row?.id),
  name: normalizeText(row?.name) || normalizeAdAccountId(row?.id || row?.account_id),
  currency: normalizeText(row?.currency) || null,
  timezone_name: normalizeText(row?.timezone_name) || null,
  account_status: normalizeText(row?.account_status) || null,
});

export const fetchMetaAdAccounts = async ({
  accessToken,
  businessId = "",
  adAccountIds = [],
}) => {
  const normalizedBusinessId = normalizeText(businessId);
  const fields = [
    "id",
    "account_id",
    "name",
    "currency",
    "timezone_name",
    "account_status",
  ].join(",");

  let accounts = [];
  if (normalizedBusinessId) {
    accounts = await fetchMetaPaged({
      path: `/${normalizedBusinessId}/owned_ad_accounts`,
      params: { fields, limit: 100 },
      accessToken,
    });
  }

  if (accounts.length === 0) {
    accounts = await fetchMetaPaged({
      path: "/me/adaccounts",
      params: { fields, limit: 100 },
      accessToken,
    });
  }

  const normalizedAccounts = accounts.map(normalizeAccountRow);
  const selectedIds = new Set(
    normalizeArray(adAccountIds).map((value) => normalizeAdAccountId(value)),
  );

  if (selectedIds.size === 0) {
    return normalizedAccounts;
  }

  const selectedAccounts = normalizedAccounts.filter((account) =>
    selectedIds.has(account.id),
  );

  if (selectedAccounts.length > 0) {
    return selectedAccounts;
  }

  return Array.from(selectedIds).map((accountId) => ({
    id: accountId,
    account_id: accountId.replace(/^act_/, ""),
    name: accountId,
    currency: null,
    timezone_name: null,
    account_status: null,
  }));
};

const fetchAccountCollection = async ({
  accessToken,
  adAccountId,
  edge,
  fields,
}) =>
  fetchMetaPaged({
    path: `/${normalizeAdAccountId(adAccountId)}/${edge}`,
    params: {
      fields: normalizeArray(fields).join(","),
      limit: 200,
    },
    accessToken,
  });

export const fetchMetaCampaigns = async ({ accessToken, adAccountId }) =>
  fetchAccountCollection({
    accessToken,
    adAccountId,
    edge: "campaigns",
    fields: [
      "id",
      "name",
      "status",
      "effective_status",
      "objective",
      "daily_budget",
      "lifetime_budget",
      "start_time",
      "stop_time",
      "updated_time",
    ],
  });

export const fetchMetaAdSets = async ({ accessToken, adAccountId }) =>
  fetchAccountCollection({
    accessToken,
    adAccountId,
    edge: "adsets",
    fields: [
      "id",
      "name",
      "status",
      "effective_status",
      "campaign_id",
      "optimization_goal",
      "billing_event",
      "daily_budget",
      "lifetime_budget",
      "start_time",
      "end_time",
      "updated_time",
    ],
  });

export const fetchMetaAds = async ({ accessToken, adAccountId }) =>
  fetchAccountCollection({
    accessToken,
    adAccountId,
    edge: "ads",
    fields: [
      "id",
      "name",
      "status",
      "effective_status",
      "campaign_id",
      "adset_id",
      "updated_time",
    ],
  });

export const fetchMetaInsightsForAccount = async ({
  accessToken,
  adAccountId,
  since,
  until,
}) => {
  const fields = [
    "account_id",
    "account_name",
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "objective",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "frequency",
    "inline_link_clicks",
    "actions",
    "action_values",
    "cost_per_action_type",
    "purchase_roas",
    "date_start",
    "date_stop",
  ].join(",");

  return fetchMetaPaged({
    path: `/${normalizeAdAccountId(adAccountId)}/insights`,
    params: {
      fields,
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify({
        since,
        until,
      }),
      limit: 250,
    },
    accessToken,
  });
};

export const buildMetaInsightSnapshots = ({
  integrationId,
  storeId,
  account,
  insightRows,
}) =>
  normalizeArray(insightRows).map((row) => ({
    integration_id: integrationId,
    store_id: storeId,
    object_type: "ad",
    object_id: normalizeText(row?.ad_id) || normalizeText(row?.campaign_id) || account?.id,
    object_name:
      normalizeText(row?.ad_name) ||
      normalizeText(row?.campaign_name) ||
      account?.name ||
      "Unnamed",
    level: "ad",
    account_id: normalizeText(row?.account_id) || account?.id || null,
    account_name: normalizeText(row?.account_name) || account?.name || null,
    campaign_id: normalizeText(row?.campaign_id) || null,
    campaign_name: normalizeText(row?.campaign_name) || null,
    adset_id: normalizeText(row?.adset_id) || null,
    adset_name: normalizeText(row?.adset_name) || null,
    ad_id: normalizeText(row?.ad_id) || null,
    ad_name: normalizeText(row?.ad_name) || null,
    objective: normalizeText(row?.objective) || null,
    currency: normalizeText(account?.currency) || null,
    date_start: normalizeText(row?.date_start) || null,
    date_stop: normalizeText(row?.date_stop) || null,
    metrics: deriveMetricsFromInsight(row),
    raw_payload: row,
    synced_at: new Date().toISOString(),
  }));

export const buildMetaOverview = ({
  snapshots = [],
  accounts = [],
  campaigns = [],
  adsets = [],
  ads = [],
}) => {
  const aggregate = aggregateMetaSnapshotRows(snapshots);

  return {
    summary: aggregate.summary,
    daily: aggregate.daily,
    accounts:
      aggregate.accounts.length > 0
        ? aggregate.accounts
        : normalizeArray(accounts).map((account) => ({
            ...normalizeAccountRow(account),
            spend: 0,
            impressions: 0,
            reach: 0,
            clicks: 0,
            inline_link_clicks: 0,
            purchases: 0,
            purchase_value: 0,
            leads: 0,
            ctr: 0,
            cpc: 0,
            cpm: 0,
            frequency: 0,
            roas: 0,
          })),
    campaigns:
      aggregate.campaigns.length > 0
        ? aggregate.campaigns
        : normalizeArray(campaigns),
    adsets: aggregate.adsets.length > 0 ? aggregate.adsets : normalizeArray(adsets),
    ads: aggregate.ads.length > 0 ? aggregate.ads : normalizeArray(ads),
  };
};

const extractFirstJsonObject = (content) => {
  const text = String(content || "").trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
};

export const fetchOpenRouterModels = async ({
  apiKey = "",
} = {}) => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (normalizeText(apiKey)) {
    headers.Authorization = `Bearer ${normalizeText(apiKey)}`;
  }

  const response = await axios.get(`${OPENROUTER_BASE_URL}/models`, {
    headers,
    timeout: OPENROUTER_TIMEOUT_MS,
  });

  return normalizeArray(response?.data?.data).map((model) => ({
    id: normalizeText(model?.id),
    name: normalizeText(model?.name) || normalizeText(model?.id),
    context_length: toNumber(model?.context_length),
    pricing: parseJsonObject(model?.pricing, {}),
    architecture: parseJsonObject(model?.architecture, {}),
  }));
};

const buildAiPrompt = ({ overview, focus = "" }) => ({
  system: [
    "You are a senior performance marketing analyst.",
    "Analyze Meta ads performance data and produce direct, commercial recommendations.",
    "Respond in valid JSON only.",
    "Required shape:",
    "{",
    '  "executive_summary": "short paragraph",',
    '  "key_findings": ["..."],',
    '  "opportunities": ["..."],',
    '  "risks": ["..."],',
    '  "actions": [{"title":"...","priority":"high|medium|low","reason":"...","expected_impact":"..."}],',
    '  "tests": [{"title":"...","hypothesis":"...","metric":"..."}]',
    "}",
  ].join(" "),
  user: JSON.stringify(
    {
      focus: normalizeText(focus) || "Improve performance, budget allocation, and creative testing decisions.",
      summary: overview?.summary || {},
      daily: normalizeArray(overview?.daily).slice(-14),
      top_campaigns: normalizeArray(overview?.campaigns).slice(0, 10),
      top_ads: normalizeArray(overview?.ads).slice(0, 10),
      top_accounts: normalizeArray(overview?.accounts).slice(0, 5),
    },
    null,
    2,
  ),
});

export const generateOpenRouterMetaAnalysis = async ({
  apiKey,
  model = DEFAULT_OPENROUTER_MODEL,
  siteUrl = "",
  siteName = "",
  overview,
  focus = "",
}) => {
  const prompt = buildAiPrompt({ overview, focus });
  const headers = {
    Authorization: `Bearer ${normalizeText(apiKey)}`,
    "Content-Type": "application/json",
  };

  if (normalizeText(siteUrl)) {
    headers["HTTP-Referer"] = normalizeText(siteUrl);
  }

  if (normalizeText(siteName)) {
    headers["X-Title"] = normalizeText(siteName);
  }

  const response = await axios.post(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
      model: normalizeText(model) || DEFAULT_OPENROUTER_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: prompt.system,
        },
        {
          role: "user",
          content: prompt.user,
        },
      ],
    },
    {
      headers,
      timeout: OPENROUTER_TIMEOUT_MS,
    },
  );

  const choice = response?.data?.choices?.[0];
  const content = normalizeText(choice?.message?.content);

  return {
    model: response?.data?.model || model,
    prompt,
    content,
    parsed: extractFirstJsonObject(content),
    raw: response?.data || {},
  };
};

export { DEFAULT_META_LOOKBACK_DAYS, DEFAULT_OPENROUTER_MODEL, normalizeAdAccountId, extractActionMetric };
