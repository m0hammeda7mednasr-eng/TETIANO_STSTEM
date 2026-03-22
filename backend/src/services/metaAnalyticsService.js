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
export const META_PLAYBOOK_NOTES = [
  "Meta recommends using six or more placements to give delivery more room to find efficient inventory.",
  "Meta recommends Reels-native creative: 9:16 vertical video, audio-friendly assets, safe-zone layouts, and A/B testing Reels-specific creative.",
  "Meta notes that ad sets enter a learning phase early in delivery, so combine ad sets when possible and avoid frequent changes before judging performance.",
  "Meta states that Conversions API can improve measurement and attribution across the customer journey.",
];
const ACTIVE_META_STATUSES = new Set(["ACTIVE"]);
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

const extractMetricValue = (value) => {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => {
      if (item && typeof item === "object") {
        return sum + toNumber(item?.value);
      }

      return sum + toNumber(item);
    }, 0);
  }

  if (value && typeof value === "object") {
    return toNumber(value?.value);
  }

  return toNumber(value);
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
  const videoPlays = extractMetricValue(row?.video_play_actions);
  const thruplays = extractMetricValue(row?.thruplays);
  const videoP25Watched = extractMetricValue(row?.video_p25_watched_actions);
  const videoP50Watched = extractMetricValue(row?.video_p50_watched_actions);
  const videoP75Watched = extractMetricValue(row?.video_p75_watched_actions);
  const videoP95Watched = extractMetricValue(row?.video_p95_watched_actions);
  const videoP100Watched = extractMetricValue(row?.video_p100_watched_actions);
  const reportedPurchaseRoas = extractActionMetric(
    row?.purchase_roas,
    ACTION_TYPE_GROUPS.purchases,
  );

  const ctr =
    toNumber(row?.ctr) || (impressions > 0 ? (clicks / impressions) * 100 : 0);
  const cpc = toNumber(row?.cpc) || (clicks > 0 ? spend / clicks : 0);
  const cpm = toNumber(row?.cpm) || (impressions > 0 ? (spend / impressions) * 1000 : 0);
  const frequency =
    toNumber(row?.frequency) || (reach > 0 ? impressions / reach : 0);
  const linkCtr = impressions > 0 ? (inlineLinkClicks / impressions) * 100 : 0;
  const conversionRate =
    inlineLinkClicks > 0 ? (purchases / inlineLinkClicks) * 100 : 0;
  const leadRate = inlineLinkClicks > 0 ? (leads / inlineLinkClicks) * 100 : 0;
  const costPerPurchase = purchases > 0 ? spend / purchases : 0;
  const costPerLead = leads > 0 ? spend / leads : 0;
  const videoPlayRate = impressions > 0 ? (videoPlays / impressions) * 100 : 0;
  const thruplayRate = impressions > 0 ? (thruplays / impressions) * 100 : 0;
  const videoHoldRate = videoPlays > 0 ? (thruplays / videoPlays) * 100 : 0;
  const videoCompletionRate =
    videoPlays > 0 ? (videoP100Watched / videoPlays) * 100 : 0;
  const roas =
    reportedPurchaseRoas > 0
      ? reportedPurchaseRoas
      : spend > 0
        ? purchaseValue / spend
        : 0;

  return {
    spend,
    impressions,
    reach,
    clicks,
    inline_link_clicks: inlineLinkClicks,
    purchases,
    purchase_value: purchaseValue,
    leads,
    video_plays: videoPlays,
    thruplays,
    video_p25_watched: videoP25Watched,
    video_p50_watched: videoP50Watched,
    video_p75_watched: videoP75Watched,
    video_p95_watched: videoP95Watched,
    video_p100_watched: videoP100Watched,
    ctr,
    link_ctr: linkCtr,
    cpc,
    cpm,
    frequency,
    conversion_rate: conversionRate,
    lead_rate: leadRate,
    cost_per_purchase: costPerPurchase,
    cost_per_lead: costPerLead,
    video_play_rate: videoPlayRate,
    thruplay_rate: thruplayRate,
    video_hold_rate: videoHoldRate,
    video_completion_rate: videoCompletionRate,
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
  target.video_plays += toNumber(metrics?.video_plays);
  target.thruplays += toNumber(metrics?.thruplays);
  target.video_p25_watched += toNumber(metrics?.video_p25_watched);
  target.video_p50_watched += toNumber(metrics?.video_p50_watched);
  target.video_p75_watched += toNumber(metrics?.video_p75_watched);
  target.video_p95_watched += toNumber(metrics?.video_p95_watched);
  target.video_p100_watched += toNumber(metrics?.video_p100_watched);
};

const finalizeMetricSet = (metrics) => {
  const spend = toNumber(metrics?.spend);
  const impressions = toNumber(metrics?.impressions);
  const clicks = toNumber(metrics?.clicks);
  const reach = toNumber(metrics?.reach);
  const inlineLinkClicks = toNumber(metrics?.inline_link_clicks);
  const purchases = toNumber(metrics?.purchases);
  const leads = toNumber(metrics?.leads);
  const purchaseValue = toNumber(metrics?.purchase_value);
  const videoPlays = toNumber(metrics?.video_plays);
  const thruplays = toNumber(metrics?.thruplays);
  const videoP100Watched = toNumber(metrics?.video_p100_watched);

  return {
    ...metrics,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    link_ctr: impressions > 0 ? (inlineLinkClicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    frequency: reach > 0 ? impressions / reach : 0,
    conversion_rate:
      inlineLinkClicks > 0 ? (purchases / inlineLinkClicks) * 100 : 0,
    lead_rate: inlineLinkClicks > 0 ? (leads / inlineLinkClicks) * 100 : 0,
    cost_per_purchase: purchases > 0 ? spend / purchases : 0,
    cost_per_lead: leads > 0 ? spend / leads : 0,
    video_play_rate: impressions > 0 ? (videoPlays / impressions) * 100 : 0,
    thruplay_rate: impressions > 0 ? (thruplays / impressions) * 100 : 0,
    video_hold_rate: videoPlays > 0 ? (thruplays / videoPlays) * 100 : 0,
    video_completion_rate:
      videoPlays > 0 ? (videoP100Watched / videoPlays) * 100 : 0,
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
  video_plays: 0,
  thruplays: 0,
  video_p25_watched: 0,
  video_p50_watched: 0,
  video_p75_watched: 0,
  video_p95_watched: 0,
  video_p100_watched: 0,
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
    const rawPayload = parseJsonObject(row?.raw_payload, {});
    const campaignMeta = parseJsonObject(rawPayload?.campaign, {});
    const adsetMeta = parseJsonObject(rawPayload?.adset, {});
    const adMeta = parseJsonObject(rawPayload?.ad, {});
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
            account_status: normalizeText(rawPayload?.account_status) || null,
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
            objective: row?.objective || campaignMeta?.objective || null,
            status: normalizeText(campaignMeta?.status) || null,
            effective_status:
              normalizeText(campaignMeta?.effective_status) || null,
            daily_budget: toNumber(campaignMeta?.daily_budget),
            lifetime_budget: toNumber(campaignMeta?.lifetime_budget),
            start_time: normalizeText(campaignMeta?.start_time) || null,
            stop_time: normalizeText(campaignMeta?.stop_time) || null,
            updated_time: normalizeText(campaignMeta?.updated_time) || null,
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
            status: normalizeText(adsetMeta?.status) || null,
            effective_status:
              normalizeText(adsetMeta?.effective_status) || null,
            optimization_goal:
              normalizeText(adsetMeta?.optimization_goal) || null,
            billing_event: normalizeText(adsetMeta?.billing_event) || null,
            daily_budget: toNumber(adsetMeta?.daily_budget),
            lifetime_budget: toNumber(adsetMeta?.lifetime_budget),
            start_time: normalizeText(adsetMeta?.start_time) || null,
            end_time: normalizeText(adsetMeta?.end_time) || null,
            updated_time: normalizeText(adsetMeta?.updated_time) || null,
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
            status: normalizeText(adMeta?.status) || null,
            effective_status: normalizeText(adMeta?.effective_status) || null,
            updated_time: normalizeText(adMeta?.updated_time) || null,
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
      video_plays: totals.video_plays,
      thruplays: totals.thruplays,
      video_p25_watched: totals.video_p25_watched,
      video_p50_watched: totals.video_p50_watched,
      video_p75_watched: totals.video_p75_watched,
      video_p95_watched: totals.video_p95_watched,
      video_p100_watched: totals.video_p100_watched,
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
  id: normalizeAdAccountId(row?.object_id || row?.id || row?.account_id),
  account_id: normalizeText(row?.account_id || row?.object_id || row?.id),
  name:
    normalizeText(row?.name || row?.account_name || row?.object_name) ||
    normalizeAdAccountId(row?.object_id || row?.id || row?.account_id),
  currency: normalizeText(row?.currency) || null,
  timezone_name: normalizeText(row?.timezone_name) || null,
  account_status: normalizeText(row?.account_status) || null,
});

const normalizeMetaStatus = (value) => normalizeText(value).toUpperCase();

const isMetaEntityActive = (effectiveStatus, status) => {
  const normalizedEffectiveStatus = normalizeMetaStatus(effectiveStatus);
  const normalizedStatus = normalizeMetaStatus(status);

  if (normalizedEffectiveStatus) {
    return ACTIVE_META_STATUSES.has(normalizedEffectiveStatus);
  }

  return ACTIVE_META_STATUSES.has(normalizedStatus);
};

const buildZeroMetricRow = (extra = {}) =>
  finalizeMetricSet({
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    inline_link_clicks: 0,
    purchases: 0,
    purchase_value: 0,
    leads: 0,
    video_plays: 0,
    thruplays: 0,
    video_p25_watched: 0,
    video_p50_watched: 0,
    video_p75_watched: 0,
    video_p95_watched: 0,
    video_p100_watched: 0,
    ...extra,
  });

const normalizeCampaignRow = (row) => {
  const campaignId =
    normalizeText(row?.campaign_id || row?.id || row?.object_id) || null;

  return {
    id: campaignId,
    campaign_id: campaignId,
    account_id: normalizeText(row?.account_id) || null,
    name:
      normalizeText(row?.name || row?.campaign_name || row?.object_name) ||
      campaignId,
    objective: normalizeText(row?.objective) || null,
    status: normalizeText(row?.status) || null,
    effective_status: normalizeText(row?.effective_status) || null,
    is_active: isMetaEntityActive(row?.effective_status, row?.status),
    daily_budget: toNumber(row?.daily_budget),
    lifetime_budget: toNumber(row?.lifetime_budget),
    start_time: normalizeText(row?.start_time) || null,
    stop_time: normalizeText(row?.stop_time) || null,
    updated_time: normalizeText(row?.updated_time) || null,
  };
};

const normalizeAdSetRow = (row) => {
  const adsetId = normalizeText(row?.adset_id || row?.id || row?.object_id) || null;

  return {
    id: adsetId,
    adset_id: adsetId,
    account_id: normalizeText(row?.account_id) || null,
    campaign_id: normalizeText(row?.campaign_id) || null,
    name: normalizeText(row?.name || row?.adset_name || row?.object_name) || adsetId,
    status: normalizeText(row?.status) || null,
    effective_status: normalizeText(row?.effective_status) || null,
    is_active: isMetaEntityActive(row?.effective_status, row?.status),
    optimization_goal: normalizeText(row?.optimization_goal) || null,
    billing_event: normalizeText(row?.billing_event) || null,
    daily_budget: toNumber(row?.daily_budget),
    lifetime_budget: toNumber(row?.lifetime_budget),
    start_time: normalizeText(row?.start_time) || null,
    end_time: normalizeText(row?.end_time) || null,
    updated_time: normalizeText(row?.updated_time) || null,
  };
};

const normalizeAdRow = (row) => {
  const adId = normalizeText(row?.ad_id || row?.id || row?.object_id) || null;

  return {
    id: adId,
    ad_id: adId,
    account_id: normalizeText(row?.account_id) || null,
    campaign_id: normalizeText(row?.campaign_id) || null,
    adset_id: normalizeText(row?.adset_id) || null,
    name: normalizeText(row?.name || row?.ad_name || row?.object_name) || adId,
    status: normalizeText(row?.status) || null,
    effective_status: normalizeText(row?.effective_status) || null,
    is_active: isMetaEntityActive(row?.effective_status, row?.status),
    updated_time: normalizeText(row?.updated_time) || null,
  };
};

const mergeEntityCollections = ({
  catalogRows = [],
  metricRows = [],
  normalizeRow,
}) => {
  const merged = [];
  const seen = new Set();
  const metricsById = new Map(
    normalizeArray(metricRows).map((row) => [normalizeText(row?.id), row]),
  );

  for (const catalogRow of normalizeArray(catalogRows)) {
    const normalizedCatalogRow = normalizeRow(catalogRow);
    const id = normalizeText(normalizedCatalogRow?.id);
    if (!id) {
      continue;
    }

    const metricRow = metricsById.get(id);
    merged.push({
      ...buildZeroMetricRow(normalizedCatalogRow),
      ...(metricRow || {}),
      ...normalizedCatalogRow,
      ...(metricRow || {}),
      is_active:
        typeof metricRow?.is_active === "boolean"
          ? metricRow.is_active
          : normalizedCatalogRow.is_active,
      status:
        normalizeText(metricRow?.status) || normalizedCatalogRow.status || null,
      effective_status:
        normalizeText(metricRow?.effective_status) ||
        normalizedCatalogRow.effective_status ||
        null,
    });
    seen.add(id);
  }

  for (const metricRow of normalizeArray(metricRows)) {
    const id = normalizeText(metricRow?.id);
    if (!id || seen.has(id)) {
      continue;
    }

    const normalizedMetricRow = normalizeRow(metricRow);
    merged.push({
      ...buildZeroMetricRow(normalizedMetricRow),
      ...normalizedMetricRow,
      ...metricRow,
      is_active:
        typeof metricRow?.is_active === "boolean"
          ? metricRow.is_active
          : normalizedMetricRow.is_active,
    });
  }

  return merged.sort((left, right) => {
    if (Boolean(left?.is_active) !== Boolean(right?.is_active)) {
      return left?.is_active ? -1 : 1;
    }

    const spendDiff = toNumber(right?.spend) - toNumber(left?.spend);
    if (spendDiff !== 0) {
      return spendDiff;
    }

    return normalizeText(left?.name).localeCompare(normalizeText(right?.name));
  });
};

export const buildMetaEntityCatalogRows = ({
  integrationId,
  storeId,
  account,
  campaigns = [],
  adsets = [],
  ads = [],
}) => {
  const normalizedAccount = normalizeAccountRow(account);
  const syncedAt = new Date().toISOString();

  return [
    {
      integration_id: integrationId,
      store_id: storeId,
      object_type: "account",
      object_id: normalizedAccount.id,
      name: normalizedAccount.name,
      account_id: normalizedAccount.account_id,
      account_name: normalizedAccount.name,
      status: normalizeText(account?.account_status),
      effective_status: normalizeText(account?.account_status),
      is_active: isMetaEntityActive(account?.account_status, account?.account_status),
      currency: normalizeText(account?.currency),
      timezone_name: normalizeText(account?.timezone_name),
      raw_payload: account || {},
      synced_at: syncedAt,
      updated_time: normalizeText(account?.updated_time) || null,
    },
    ...normalizeArray(campaigns).map((campaign) => ({
      integration_id: integrationId,
      store_id: storeId,
      object_type: "campaign",
      object_id: normalizeText(campaign?.id),
      name: normalizeText(campaign?.name) || normalizeText(campaign?.id),
      account_id: normalizedAccount.id,
      account_name: normalizedAccount.name,
      campaign_id: normalizeText(campaign?.id),
      campaign_name: normalizeText(campaign?.name),
      objective: normalizeText(campaign?.objective),
      status: normalizeText(campaign?.status),
      effective_status: normalizeText(campaign?.effective_status),
      is_active: isMetaEntityActive(
        campaign?.effective_status,
        campaign?.status,
      ),
      currency: normalizeText(account?.currency),
      daily_budget: toNumber(campaign?.daily_budget),
      lifetime_budget: toNumber(campaign?.lifetime_budget),
      start_time: normalizeText(campaign?.start_time) || null,
      stop_time: normalizeText(campaign?.stop_time) || null,
      updated_time: normalizeText(campaign?.updated_time) || null,
      raw_payload: campaign || {},
      synced_at: syncedAt,
    })),
    ...normalizeArray(adsets).map((adset) => ({
      integration_id: integrationId,
      store_id: storeId,
      object_type: "adset",
      object_id: normalizeText(adset?.id),
      name: normalizeText(adset?.name) || normalizeText(adset?.id),
      account_id: normalizedAccount.id,
      account_name: normalizedAccount.name,
      campaign_id: normalizeText(adset?.campaign_id),
      adset_id: normalizeText(adset?.id),
      adset_name: normalizeText(adset?.name),
      status: normalizeText(adset?.status),
      effective_status: normalizeText(adset?.effective_status),
      is_active: isMetaEntityActive(adset?.effective_status, adset?.status),
      currency: normalizeText(account?.currency),
      optimization_goal: normalizeText(adset?.optimization_goal),
      billing_event: normalizeText(adset?.billing_event),
      daily_budget: toNumber(adset?.daily_budget),
      lifetime_budget: toNumber(adset?.lifetime_budget),
      start_time: normalizeText(adset?.start_time) || null,
      end_time: normalizeText(adset?.end_time) || null,
      updated_time: normalizeText(adset?.updated_time) || null,
      raw_payload: adset || {},
      synced_at: syncedAt,
    })),
    ...normalizeArray(ads).map((ad) => ({
      integration_id: integrationId,
      store_id: storeId,
      object_type: "ad",
      object_id: normalizeText(ad?.id),
      name: normalizeText(ad?.name) || normalizeText(ad?.id),
      account_id: normalizedAccount.id,
      account_name: normalizedAccount.name,
      campaign_id: normalizeText(ad?.campaign_id),
      adset_id: normalizeText(ad?.adset_id),
      ad_id: normalizeText(ad?.id),
      ad_name: normalizeText(ad?.name),
      status: normalizeText(ad?.status),
      effective_status: normalizeText(ad?.effective_status),
      is_active: isMetaEntityActive(ad?.effective_status, ad?.status),
      currency: normalizeText(account?.currency),
      updated_time: normalizeText(ad?.updated_time) || null,
      raw_payload: ad || {},
      synced_at: syncedAt,
    })),
  ].filter((row) => normalizeText(row?.object_id));
};

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
    "video_play_actions",
    "video_p25_watched_actions",
    "video_p50_watched_actions",
    "video_p75_watched_actions",
    "video_p95_watched_actions",
    "video_p100_watched_actions",
    "thruplays",
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
  campaigns = [],
  adsets = [],
  ads = [],
}) => {
  const campaignsById = new Map(
    normalizeArray(campaigns).map((item) => [normalizeText(item?.id), item]),
  );
  const adsetsById = new Map(
    normalizeArray(adsets).map((item) => [normalizeText(item?.id), item]),
  );
  const adsById = new Map(
    normalizeArray(ads).map((item) => [normalizeText(item?.id), item]),
  );

  return normalizeArray(insightRows).map((row) => {
    const campaignId = normalizeText(row?.campaign_id);
    const adsetId = normalizeText(row?.adset_id);
    const adId = normalizeText(row?.ad_id);

    return {
      integration_id: integrationId,
      store_id: storeId,
      object_type: "ad",
      object_id: adId || campaignId || account?.id,
      object_name:
        normalizeText(row?.ad_name) ||
        normalizeText(row?.campaign_name) ||
        account?.name ||
        "Unnamed",
      level: "ad",
      account_id: normalizeText(row?.account_id) || account?.id || null,
      account_name: normalizeText(row?.account_name) || account?.name || null,
      campaign_id: campaignId || null,
      campaign_name: normalizeText(row?.campaign_name) || null,
      adset_id: adsetId || null,
      adset_name: normalizeText(row?.adset_name) || null,
      ad_id: adId || null,
      ad_name: normalizeText(row?.ad_name) || null,
      objective: normalizeText(row?.objective) || null,
      currency: normalizeText(account?.currency) || null,
      date_start: normalizeText(row?.date_start) || null,
      date_stop: normalizeText(row?.date_stop) || null,
      metrics: deriveMetricsFromInsight(row),
      raw_payload: {
        insight: row,
        account_status: account?.account_status || null,
        campaign: campaignsById.get(campaignId) || null,
        adset: adsetsById.get(adsetId) || null,
        ad: adsById.get(adId) || null,
      },
      synced_at: new Date().toISOString(),
    };
  });
};

export const buildMetaOverview = ({
  snapshots = [],
  accounts = [],
  campaigns = [],
  adsets = [],
  ads = [],
}) => {
  const aggregate = aggregateMetaSnapshotRows(snapshots);
  const mergedAccounts = mergeEntityCollections({
    catalogRows: accounts,
    metricRows: aggregate.accounts,
    normalizeRow: normalizeAccountRow,
  });
  const mergedCampaigns = mergeEntityCollections({
    catalogRows: campaigns,
    metricRows: aggregate.campaigns,
    normalizeRow: normalizeCampaignRow,
  });
  const mergedAdsets = mergeEntityCollections({
    catalogRows: adsets,
    metricRows: aggregate.adsets,
    normalizeRow: normalizeAdSetRow,
  });
  const mergedAds = mergeEntityCollections({
    catalogRows: ads,
    metricRows: aggregate.ads,
    normalizeRow: normalizeAdRow,
  });
  const summary = {
    ...aggregate.summary,
    accounts_count: mergedAccounts.length,
    campaigns_count: mergedCampaigns.length,
    adsets_count: mergedAdsets.length,
    ads_count: mergedAds.length,
    active_accounts_count: mergedAccounts.filter((item) => item?.is_active).length,
    active_campaigns_count: mergedCampaigns.filter((item) => item?.is_active).length,
    active_adsets_count: mergedAdsets.filter((item) => item?.is_active).length,
    active_ads_count: mergedAds.filter((item) => item?.is_active).length,
  };

  return {
    summary,
    daily: aggregate.daily,
    accounts: mergedAccounts,
    campaigns: mergedCampaigns,
    adsets: mergedAdsets,
    ads: mergedAds,
  };
};

const median = (values = []) => {
  const sorted = normalizeArray(values)
    .map((value) => toNumber(value))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  if (sorted.length === 0) {
    return 0;
  }

  const middleIndex = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middleIndex];
  }

  return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
};

const toFixedMetric = (value, digits = 2) =>
  Number(toNumber(value).toFixed(digits));

const buildMetaBenchmarks = ({ overview = {}, storeSnapshot = {} }) => {
  const summary = overview?.summary || {};
  const financial = storeSnapshot?.financial || {};
  const campaigns = normalizeArray(overview?.campaigns);
  const spendValues = campaigns.map((campaign) => campaign?.spend);
  const medianCampaignSpend = median(spendValues);
  const averageOrderValue = toNumber(financial?.average_order_value);
  const accountCostPerPurchase = toNumber(summary?.cost_per_purchase);
  const spendGateCandidates = [
    averageOrderValue > 0 ? averageOrderValue * 0.5 : 0,
    accountCostPerPurchase > 0 ? accountCostPerPurchase * 0.75 : 0,
    medianCampaignSpend > 0 ? medianCampaignSpend * 0.7 : 0,
    30,
  ].filter((value) => value > 0);

  return {
    roas: Math.max(0, toNumber(summary?.roas)),
    ctr: Math.max(0, toNumber(summary?.ctr)),
    link_ctr: Math.max(0, toNumber(summary?.link_ctr)),
    conversion_rate: Math.max(0, toNumber(summary?.conversion_rate)),
    cpm: Math.max(0, toNumber(summary?.cpm)),
    frequency: Math.max(0, toNumber(summary?.frequency)),
    cost_per_purchase: Math.max(0, accountCostPerPurchase),
    average_order_value: Math.max(0, averageOrderValue),
    spend_gate: Math.max(20, Math.min(...spendGateCandidates)),
    high_frequency: 3.5,
    min_link_ctr: Math.max(0.9, toNumber(summary?.link_ctr) * 0.8),
    strong_link_ctr: Math.max(1.2, toNumber(summary?.link_ctr) * 1.1),
    min_conversion_rate: Math.max(
      1,
      toNumber(summary?.conversion_rate) * 0.8,
    ),
    strong_conversion_rate: Math.max(
      2,
      toNumber(summary?.conversion_rate) * 1.1,
    ),
    scale_roas: Math.max(1.8, toNumber(summary?.roas) * 1.15),
    keep_roas: Math.max(1.2, toNumber(summary?.roas) * 0.85),
    pause_roas: Math.max(0.8, toNumber(summary?.roas) * 0.65),
    low_video_hold_rate: 20,
    low_video_completion_rate: 8,
  };
};

const buildDriverText = (key, actual, benchmark) => {
  const actualMetric = toFixedMetric(actual);
  const benchmarkMetric = toFixedMetric(benchmark);

  switch (key) {
    case "strong_roas":
      return `ROAS ${actualMetric}x beats the account baseline ${benchmarkMetric}x.`;
    case "strong_link_ctr":
      return `Link CTR ${actualMetric}% is stronger than the account baseline ${benchmarkMetric}%.`;
    case "strong_conversion_rate":
      return `Post-click conversion rate ${actualMetric}% is stronger than the baseline ${benchmarkMetric}%.`;
    case "controlled_frequency":
      return `Frequency ${actualMetric} is still controlled.`;
    case "low_link_ctr":
      return `Link CTR ${actualMetric}% is weak versus the baseline ${benchmarkMetric}%.`;
    case "low_conversion_rate":
      return `Conversion rate ${actualMetric}% is below the baseline ${benchmarkMetric}%.`;
    case "high_frequency":
      return `Frequency ${actualMetric} suggests fatigue or audience saturation.`;
    case "expensive_traffic":
      return `CPM ${actualMetric} is elevated versus the baseline ${benchmarkMetric}.`;
    case "weak_video_hold":
      return `Video hold rate ${actualMetric}% is weak after the initial play.`;
    case "low_video_completion":
      return `Video completion rate ${actualMetric}% is low, so the core message may land too late.`;
    case "no_conversion":
      return `Spend ${actualMetric} reached the decision threshold ${benchmarkMetric} with no purchases.`;
    default:
      return "";
  }
};

const buildPerformanceDrivers = (row, benchmarks) => {
  const drivers = [];
  const spend = toNumber(row?.spend);
  const roas = toNumber(row?.roas);
  const linkCtr = toNumber(row?.link_ctr);
  const conversionRate = toNumber(row?.conversion_rate);
  const frequency = toNumber(row?.frequency);
  const cpm = toNumber(row?.cpm);
  const videoHoldRate = toNumber(row?.video_hold_rate);
  const videoCompletionRate = toNumber(row?.video_completion_rate);
  const purchases = toNumber(row?.purchases);

  if (roas >= benchmarks.scale_roas) {
    drivers.push({
      key: "strong_roas",
      actual: roas,
      benchmark: benchmarks.scale_roas,
    });
  }
  if (linkCtr >= benchmarks.strong_link_ctr) {
    drivers.push({
      key: "strong_link_ctr",
      actual: linkCtr,
      benchmark: benchmarks.strong_link_ctr,
    });
  }
  if (conversionRate >= benchmarks.strong_conversion_rate) {
    drivers.push({
      key: "strong_conversion_rate",
      actual: conversionRate,
      benchmark: benchmarks.strong_conversion_rate,
    });
  }
  if (frequency > 0 && frequency < benchmarks.high_frequency) {
    drivers.push({
      key: "controlled_frequency",
      actual: frequency,
      benchmark: benchmarks.high_frequency,
    });
  }
  if (linkCtr > 0 && linkCtr < benchmarks.min_link_ctr) {
    drivers.push({
      key: "low_link_ctr",
      actual: linkCtr,
      benchmark: benchmarks.min_link_ctr,
    });
  }
  if (conversionRate > 0 && conversionRate < benchmarks.min_conversion_rate) {
    drivers.push({
      key: "low_conversion_rate",
      actual: conversionRate,
      benchmark: benchmarks.min_conversion_rate,
    });
  }
  if (frequency >= benchmarks.high_frequency) {
    drivers.push({
      key: "high_frequency",
      actual: frequency,
      benchmark: benchmarks.high_frequency,
    });
  }
  if (cpm > benchmarks.cpm * 1.25 && linkCtr < benchmarks.strong_link_ctr) {
    drivers.push({
      key: "expensive_traffic",
      actual: cpm,
      benchmark: benchmarks.cpm,
    });
  }
  if (videoHoldRate > 0 && videoHoldRate < benchmarks.low_video_hold_rate) {
    drivers.push({
      key: "weak_video_hold",
      actual: videoHoldRate,
      benchmark: benchmarks.low_video_hold_rate,
    });
  }
  if (
    videoCompletionRate > 0 &&
    videoCompletionRate < benchmarks.low_video_completion_rate
  ) {
    drivers.push({
      key: "low_video_completion",
      actual: videoCompletionRate,
      benchmark: benchmarks.low_video_completion_rate,
    });
  }
  if (purchases === 0 && spend >= benchmarks.spend_gate) {
    drivers.push({
      key: "no_conversion",
      actual: spend,
      benchmark: benchmarks.spend_gate,
    });
  }

  return drivers;
};

const buildDecisionActionText = (decision, primaryIssue = "") => {
  if (decision === "scale") {
    return "Increase budget 10-15% and keep the current winner stable for one more learning cycle.";
  }

  if (decision === "pause") {
    if (primaryIssue === "creative") {
      return "Pause this asset and replace the creative before spending more.";
    }
    if (primaryIssue === "conversion") {
      return "Pause or sharply cut spend until the offer, landing page, or product-page match improves.";
    }
    return "Pause this item now and redirect budget to stronger winners.";
  }

  if (decision === "test") {
    if (primaryIssue === "fatigue") {
      return "Keep delivery controlled, but launch fresh creative and audience angles before scaling.";
    }
    if (primaryIssue === "creative") {
      return "Test a new hook, shorter opening, and clearer product proof before increasing spend.";
    }
    if (primaryIssue === "conversion") {
      return "Keep spend constrained and test the offer, CTA, price framing, or landing page match.";
    }
    return "Run one focused test before making a bigger budget decision.";
  }

  return "Keep running and monitor efficiency before making larger changes.";
};

const buildDecisionRow = ({ row, level, benchmarks }) => {
  const spend = toNumber(row?.spend);
  const purchases = toNumber(row?.purchases);
  const roas = toNumber(row?.roas);
  const linkCtr = toNumber(row?.link_ctr);
  const conversionRate = toNumber(row?.conversion_rate);
  const frequency = toNumber(row?.frequency);
  const drivers = buildPerformanceDrivers(row, benchmarks);
  const negativeKeys = new Set(
    drivers
      .map((driver) => driver.key)
      .filter((key) => key.startsWith("low_") || key.startsWith("high_") || key === "no_conversion" || key === "weak_video_hold" || key === "expensive_traffic"),
  );
  const scalePurchaseFloor =
    level === "campaign" ? 3 : level === "adset" ? 2 : 1;
  const enoughSpend = spend >= benchmarks.spend_gate;
  const enoughData =
    enoughSpend ||
    purchases >= 1 ||
    toNumber(row?.inline_link_clicks) >= 20 ||
    toNumber(row?.clicks) >= 30;

  let decision = "keep";
  let confidence = "medium";

  if (
    purchases >= scalePurchaseFloor &&
    roas >= benchmarks.scale_roas &&
    conversionRate >= benchmarks.min_conversion_rate &&
    frequency > 0 &&
    frequency < benchmarks.high_frequency
  ) {
    decision = "scale";
    confidence = "high";
  } else if (
    enoughSpend &&
    ((purchases === 0 &&
      (linkCtr < benchmarks.min_link_ctr ||
        conversionRate < benchmarks.min_conversion_rate ||
        negativeKeys.has("weak_video_hold"))) ||
      (purchases > 0 && roas < benchmarks.pause_roas))
  ) {
    decision = "pause";
    confidence = purchases > 0 ? "high" : "medium";
  } else if (!enoughData) {
    decision = "keep";
    confidence = "low";
  } else if (
    negativeKeys.has("high_frequency") ||
    negativeKeys.has("low_link_ctr") ||
    negativeKeys.has("low_conversion_rate") ||
    negativeKeys.has("weak_video_hold") ||
    negativeKeys.has("low_video_completion") ||
    negativeKeys.has("expensive_traffic")
  ) {
    decision = "test";
    confidence = "medium";
  } else if (roas >= benchmarks.keep_roas) {
    decision = "keep";
    confidence = purchases >= 1 ? "medium" : "low";
  }

  const primaryIssue = negativeKeys.has("high_frequency")
    ? "fatigue"
    : negativeKeys.has("weak_video_hold") || negativeKeys.has("low_link_ctr")
      ? "creative"
      : negativeKeys.has("low_conversion_rate") || negativeKeys.has("no_conversion")
        ? "conversion"
        : negativeKeys.has("expensive_traffic")
          ? "cost"
          : decision === "scale"
            ? "winner"
            : "mixed";

  const why = drivers
    .slice(0, 3)
    .map((driver) =>
      buildDriverText(driver.key, driver.actual, driver.benchmark),
    )
    .filter(Boolean);

  return {
    ...row,
    level,
    decision,
    confidence,
    primary_issue: primaryIssue,
    why,
    drivers,
    action: buildDecisionActionText(decision, primaryIssue),
  };
};

const rankDecisionRows = (rows = [], level, benchmarks) =>
  normalizeArray(rows)
    .map((row) => buildDecisionRow({ row, level, benchmarks }))
    .sort((left, right) => {
      const decisionPriority = {
        scale: 0,
        pause: 1,
        test: 2,
        keep: 3,
      };

      if (decisionPriority[left.decision] !== decisionPriority[right.decision]) {
        return decisionPriority[left.decision] - decisionPriority[right.decision];
      }

      return toNumber(right.spend) - toNumber(left.spend);
    });

const buildCreativeDiagnostics = (ads = [], benchmarks) =>
  normalizeArray(ads)
    .filter(
      (ad) =>
        toNumber(ad?.video_plays) > 0 ||
        toNumber(ad?.thruplays) > 0 ||
        toNumber(ad?.spend) > 0,
    )
    .map((ad) => {
      const videoPlayRate = toNumber(ad?.video_play_rate);
      const videoHoldRate = toNumber(ad?.video_hold_rate);
      const videoCompletionRate = toNumber(ad?.video_completion_rate);
      const linkCtr = toNumber(ad?.link_ctr);
      const conversionRate = toNumber(ad?.conversion_rate);
      const roas = toNumber(ad?.roas);

      let diagnosis = "stable";
      let headline = "Keep monitoring";
      let action = "Monitor this ad and compare it against stronger creatives.";

      if (roas >= benchmarks.scale_roas && toNumber(ad?.purchases) >= 1) {
        diagnosis = "winner";
        headline = "Creative winner";
        action =
          "Protect this winner, use it as the control, and build two adjacent variants around the same message.";
      } else if (videoPlayRate > 0 && videoPlayRate < 10) {
        diagnosis = "weak_thumb_stop";
        headline = "Weak first impression";
        action =
          "Test a sharper opening frame, faster branding, and clearer product demonstration in the first seconds.";
      } else if (videoHoldRate > 0 && videoHoldRate < benchmarks.low_video_hold_rate) {
        diagnosis = "weak_hold";
        headline = "Viewers drop early";
        action =
          "Shorten the intro, bring proof or offer earlier, and remove slow setup before the main value point.";
      } else if (
        videoCompletionRate > 0 &&
        videoCompletionRate < benchmarks.low_video_completion_rate
      ) {
        diagnosis = "late_offer";
        headline = "Message lands too late";
        action =
          "Move the product proof, CTA, or price framing earlier in the script.";
      } else if (
        linkCtr >= benchmarks.strong_link_ctr &&
        conversionRate > 0 &&
        conversionRate < benchmarks.min_conversion_rate
      ) {
        diagnosis = "post_click_drop";
        headline = "Clicks are there, conversion is weak";
        action =
          "Keep the core hook, but fix the landing page, offer clarity, or product-page trust signals.";
      }

      return {
        ...ad,
        diagnosis,
        headline,
        action,
      };
    })
    .sort((left, right) => toNumber(right.spend) - toNumber(left.spend))
    .slice(0, 8);

export const buildMetaDecisionBoard = ({
  overview = {},
  storeSnapshot = {},
}) => {
  const benchmarks = buildMetaBenchmarks({ overview, storeSnapshot });
  const campaigns = rankDecisionRows(
    overview?.campaigns,
    "campaign",
    benchmarks,
  ).slice(0, 12);
  const adsets = rankDecisionRows(
    overview?.adsets,
    "adset",
    benchmarks,
  ).slice(0, 12);
  const ads = rankDecisionRows(overview?.ads, "ad", benchmarks).slice(0, 16);
  const creativeDiagnostics = buildCreativeDiagnostics(overview?.ads, benchmarks);

  const decisionSummary = campaigns.reduce(
    (summary, row) => {
      summary[`${row.decision}_count`] += 1;
      return summary;
    },
    {
      scale_count: 0,
      keep_count: 0,
      test_count: 0,
      pause_count: 0,
    },
  );

  return {
    benchmarks,
    roas_framework: {
      account_blended_roas: benchmarks.roas,
      scale_threshold: benchmarks.scale_roas,
      keep_threshold: benchmarks.keep_roas,
      pause_threshold: benchmarks.pause_roas,
      spend_gate: benchmarks.spend_gate,
      explanation: [
        `Scale after the item clears ROAS ${toFixedMetric(
          benchmarks.scale_roas,
        )}x with controlled frequency and enough purchases.`,
        `Keep stable items above ROAS ${toFixedMetric(
          benchmarks.keep_roas,
        )}x while testing only one major variable at a time.`,
        `Pause or cut hard once spend passes ${toFixedMetric(
          benchmarks.spend_gate,
        )} and ROAS stays below ${toFixedMetric(benchmarks.pause_roas)}x or conversions stay at zero.`,
      ],
    },
    summary: decisionSummary,
    campaigns,
    adsets,
    ads,
    scale_now: campaigns.filter((row) => row.decision === "scale").slice(0, 4),
    keep_running: campaigns.filter((row) => row.decision === "keep").slice(0, 4),
    test_next: campaigns.filter((row) => row.decision === "test").slice(0, 4),
    pause_now: campaigns.filter((row) => row.decision === "pause").slice(0, 4),
    creative_diagnostics: creativeDiagnostics,
    playbook_notes: META_PLAYBOOK_NOTES,
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

const buildOpenRouterHeaders = ({
  apiKey,
  siteUrl = "",
  siteName = "",
}) => {
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

  return headers;
};

const requestOpenRouterChatCompletion = async ({
  apiKey,
  model = DEFAULT_OPENROUTER_MODEL,
  siteUrl = "",
  siteName = "",
  temperature = 0.2,
  messages = [],
}) => {
  const response = await axios.post(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
      model: normalizeText(model) || DEFAULT_OPENROUTER_MODEL,
      temperature,
      messages: normalizeArray(messages).filter(
        (message) =>
          normalizeText(message?.role) &&
          normalizeText(message?.content),
      ),
    },
    {
      headers: buildOpenRouterHeaders({
        apiKey,
        siteUrl,
        siteName,
      }),
      timeout: OPENROUTER_TIMEOUT_MS,
    },
  );

  const choice = response?.data?.choices?.[0];
  return {
    model: response?.data?.model || model,
    content: normalizeText(choice?.message?.content),
    raw: response?.data || {},
  };
};

const buildAiPrompt = ({
  overview,
  decisionBoard = {},
  storeSnapshot = {},
  focus = "",
}) => ({
  system: [
    "You are a senior performance marketing analyst.",
    "Analyze Meta ads performance data and produce direct, commercial recommendations.",
    "Use the decision board and Meta playbook notes to explain what to pause, keep, test, and scale.",
    "Explain why ROAS is strong or weak using CTR, conversion rate, CPM, frequency, and video engagement when available.",
    "Respond in valid JSON only.",
    "Required shape:",
    "{",
    '  "executive_summary": "short paragraph",',
    '  "roas_explanation": ["..."],',
    '  "scale_now": ["..."],',
    '  "keep_running": ["..."],',
    '  "pause_now": ["..."],',
    '  "test_next": ["..."],',
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
      store_snapshot: {
        financial: storeSnapshot?.financial || {},
        orders: storeSnapshot?.orders || {},
        catalog: storeSnapshot?.catalog || {},
        top_products: normalizeArray(storeSnapshot?.top_products).slice(0, 5),
      },
      summary: overview?.summary || {},
      daily: normalizeArray(overview?.daily).slice(-14),
      top_campaigns: normalizeArray(overview?.campaigns).slice(0, 10),
      top_ads: normalizeArray(overview?.ads).slice(0, 10),
      top_accounts: normalizeArray(overview?.accounts).slice(0, 5),
      decision_board: decisionBoard || {},
      meta_playbook_notes: META_PLAYBOOK_NOTES,
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
  decisionBoard = {},
  storeSnapshot = {},
  focus = "",
}) => {
  const prompt = buildAiPrompt({
    overview,
    decisionBoard,
    storeSnapshot,
    focus,
  });
  const completion = await requestOpenRouterChatCompletion({
    apiKey,
    model,
    siteUrl,
    siteName,
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
  });
  const content = completion.content;

  return {
    model: completion.model,
    prompt,
    content,
    parsed: extractFirstJsonObject(content),
    raw: completion.raw,
  };
};

const sanitizeChatHistory = (history = []) =>
  normalizeArray(history)
    .slice(-8)
    .map((entry) => ({
      role:
        normalizeText(entry?.role).toLowerCase() === "assistant"
          ? "assistant"
          : "user",
      content: normalizeText(entry?.content),
    }))
    .filter((entry) => entry.content);

export const generateOpenRouterStoreAssistantReply = async ({
  apiKey,
  model = DEFAULT_OPENROUTER_MODEL,
  siteUrl = "",
  siteName = "",
  message = "",
  history = [],
  storeSnapshot = {},
  metaOverview = {},
  decisionBoard = {},
  recommendations = [],
}) => {
  const normalizedMessage = normalizeText(message);
  const prompt = {
    system: [
      "You are Tetiano AI, an internal commerce operations strategist.",
      "You help store operators decide what to pause, scale, restock, follow up on, and fix next.",
      "Use the provided store snapshot, Meta data, decision board, and recommendations only.",
      "Reply in the same language as the user. Prefer Arabic when the user writes Arabic.",
      "Be specific, operational, and concise.",
      "When relevant, answer in four buckets: pause, keep running, test next, and scale now.",
      "Explain ROAS in plain language using CTR, conversion rate, CPM, frequency, and video diagnostics when available.",
      "When data is missing, say that clearly instead of inventing numbers.",
    ].join(" "),
    context: JSON.stringify(
      {
        store_snapshot: storeSnapshot || {},
        meta_overview: metaOverview || {},
        decision_board: decisionBoard || {},
        recommendations: normalizeArray(recommendations).slice(0, 8),
        meta_playbook_notes: META_PLAYBOOK_NOTES,
      },
      null,
      2,
    ),
  };

  const completion = await requestOpenRouterChatCompletion({
    apiKey,
    model,
    siteUrl,
    siteName,
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content: prompt.system,
      },
      {
        role: "user",
        content: `Context:\n${prompt.context}`,
      },
      ...sanitizeChatHistory(history),
      {
        role: "user",
        content: normalizedMessage,
      },
    ],
  });

  return {
    model: completion.model,
    prompt,
    content: completion.content,
    raw: completion.raw,
  };
};

export {
  DEFAULT_META_LOOKBACK_DAYS,
  DEFAULT_OPENROUTER_MODEL,
  normalizeAdAccountId,
  extractActionMetric,
};
