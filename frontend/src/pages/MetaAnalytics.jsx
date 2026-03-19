import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  Brain,
  KeyRound,
  LineChart,
  Megaphone,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { ErrorAlert, LoadingSpinner, SuccessAlert } from "../components/Common";
import { useLocale } from "../context/LocaleContext";
import { getErrorMessage, metaAnalyticsAPI } from "../utils/api";

const DEFAULT_ANALYSIS_FOCUS =
  "Highlight wasted spend, scalable campaigns, creative testing opportunities, and budget shifts.";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCount = (value) => toNumber(value).toLocaleString("en-US");

const formatCurrency = (value, currency = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(toNumber(value));
  } catch {
    return `${toNumber(value).toFixed(2)} ${currency || "USD"}`;
  }
};

const formatPercent = (value) => `${toNumber(value).toFixed(2)}%`;

const truncateText = (value, maxLength = 260) => {
  const normalized = String(value || "").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
};

const parseCommaSeparated = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function MetricCard({ title, value, subtitle, icon: Icon, tone = "sky" }) {
  const toneClasses = {
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    violet: "border-violet-200 bg-violet-50 text-violet-900",
  };

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${toneClasses[tone] || toneClasses.sky}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
          {subtitle ? <p className="mt-2 text-xs opacity-80">{subtitle}</p> : null}
        </div>
        <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, description = "", actions = null, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function TableSection({ title, description, columns, rows, renderRow }) {
  return (
    <SectionCard title={title} description={description}>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
          No data available yet. Run a Meta sync first.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-4 py-3 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(renderRow)}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export default function MetaAnalytics() {
  const { select, formatDateTime } = useLocale();
  const [status, setStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingOpenRouter, setSavingOpenRouter] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [metaForm, setMetaForm] = useState({
    access_token: "",
    business_id: "",
    ad_account_ids: "",
    page_id: "",
    pixel_id: "",
  });
  const [openRouterForm, setOpenRouterForm] = useState({
    api_key: "",
    model: "",
    site_url: typeof window !== "undefined" ? window.location.origin : "",
    site_name: "Tetiano",
  });
  const [analysisFocus, setAnalysisFocus] = useState(DEFAULT_ANALYSIS_FOCUS);

  const loadPage = async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [statusResponse, overviewResponse] = await Promise.all([
        metaAnalyticsAPI.getStatus(),
        metaAnalyticsAPI.getOverview({ days: 30 }),
      ]);

      const nextStatus = statusResponse.data || null;
      const nextOverview = overviewResponse.data || null;

      setStatus(nextStatus);
      setOverview(nextOverview);
      setError("");

      const integration = nextStatus?.integration || {};
      setMetaForm({
        access_token: "",
        business_id: integration?.meta?.business_id || "",
        ad_account_ids: (integration?.meta?.ad_account_ids || []).join(", "),
        page_id: integration?.meta?.page_id || "",
        pixel_id: integration?.meta?.pixel_id || "",
      });
      setOpenRouterForm((current) => ({
        ...current,
        api_key: "",
        model: integration?.openrouter?.model || current.model || "",
        site_url: integration?.openrouter?.site_url || current.site_url,
        site_name: integration?.openrouter?.site_name || current.site_name,
      }));

      try {
        const modelsResponse = await metaAnalyticsAPI.getModels();
        const modelRows = Array.isArray(modelsResponse?.data?.data)
          ? modelsResponse.data.data
          : [];
        setModels(modelRows);
        if (modelRows.length > 0) {
          setOpenRouterForm((current) => ({
            ...current,
            model:
              current.model ||
              integration?.openrouter?.model ||
              modelRows[0]?.id ||
              "",
          }));
        }
      } catch {
        setModels([]);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, []);

  const summary = overview?.overview?.summary || {};
  const campaigns = useMemo(
    () => (overview?.overview?.campaigns || []).slice(0, 10),
    [overview],
  );
  const ads = useMemo(() => (overview?.overview?.ads || []).slice(0, 10), [overview]);
  const dailyRows = useMemo(
    () => (overview?.overview?.daily || []).slice(-14).reverse(),
    [overview],
  );
  const analyses = overview?.analyses || [];
  const syncRuns = overview?.sync_runs || [];
  const primaryCurrency = overview?.overview?.accounts?.[0]?.currency || "USD";

  const handleMetaFormChange = (key, value) => {
    setMetaForm((current) => ({ ...current, [key]: value }));
  };

  const handleOpenRouterFormChange = (key, value) => {
    setOpenRouterForm((current) => ({ ...current, [key]: value }));
  };

  const handleSaveMeta = async (event) => {
    event.preventDefault();
    setSavingMeta(true);
    setError("");
    setSuccess("");

    try {
      await metaAnalyticsAPI.saveMetaConfig({
        access_token: metaForm.access_token,
        business_id: metaForm.business_id,
        ad_account_ids: parseCommaSeparated(metaForm.ad_account_ids),
        page_id: metaForm.page_id,
        pixel_id: metaForm.pixel_id,
      });
      setSuccess("Meta Business configuration saved.");
      await loadPage({ silent: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSaveOpenRouter = async (event) => {
    event.preventDefault();
    setSavingOpenRouter(true);
    setError("");
    setSuccess("");

    try {
      await metaAnalyticsAPI.saveOpenRouterConfig({
        api_key: openRouterForm.api_key,
        model: openRouterForm.model,
        site_url: openRouterForm.site_url,
        site_name: openRouterForm.site_name,
      });
      setSuccess("OpenRouter configuration saved.");
      await loadPage({ silent: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSavingOpenRouter(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError("");
    setSuccess("");

    try {
      const response = await metaAnalyticsAPI.sync({ days: 30 });
      setSuccess(
        `Meta sync completed. ${formatCount(
          response?.data?.sync?.snapshots_count,
        )} daily insight rows loaded.`,
      );
      await loadPage({ silent: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError("");
    setSuccess("");

    try {
      await metaAnalyticsAPI.analyze({
        days: 30,
        model: openRouterForm.model,
        focus: analysisFocus,
        site_url: openRouterForm.site_url,
        site_name: openRouterForm.site_name,
      });
      setSuccess("AI brief generated successfully.");
      await loadPage({ silent: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <Sidebar />
        <main className="flex-1 overflow-auto p-8">
          <LoadingSpinner label="Loading Meta & Analytics module..." />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="space-y-6 p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
                <Megaphone className="text-sky-700" size={30} />
                {select("ميتا والتحليلات", "Meta & Analytics")}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                {select(
                  "ربط Meta Business Suite مع OpenRouter لسحب بيانات الإعلانات، تحليلها، وتوليد توصيات تشغيلية مباشرة مبنية على الأرقام.",
                  "Connect Meta Business Suite with OpenRouter to pull ads data, analyze performance, and generate action-ready recommendations.",
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => loadPage({ silent: true })}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-60"
              >
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing Meta..." : "Sync Meta Data"}
              </button>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:opacity-60"
              >
                <Sparkles size={16} className={analyzing ? "animate-pulse" : ""} />
                {analyzing ? "Generating brief..." : "Generate AI Brief"}
              </button>
            </div>
          </div>

          {error ? <ErrorAlert message={error} onClose={() => setError("")} /> : null}
          {success ? (
            <SuccessAlert message={success} onClose={() => setSuccess("")} />
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <MetricCard
              title="Meta connection"
              value={
                status?.integration?.meta?.configured
                  ? status?.integration?.meta?.connected
                    ? "Connected"
                    : "Configured"
                  : "Not configured"
              }
              subtitle={
                status?.integration?.meta?.last_sync_at
                  ? `Last sync ${formatDateTime(status.integration.meta.last_sync_at)}`
                  : "Save token and sync to validate access"
              }
              icon={Megaphone}
              tone="sky"
            />
            <MetricCard
              title="OpenRouter"
              value={
                status?.integration?.openrouter?.configured
                  ? status?.integration?.openrouter?.connected
                    ? "Ready"
                    : "Configured"
                  : "Not configured"
              }
              subtitle={
                status?.integration?.openrouter?.model || "Choose a model for AI briefs"
              }
              icon={Bot}
              tone="violet"
            />
            <MetricCard
              title="Store scope"
              value={status?.store_id || "-"}
              subtitle="All configs and snapshots are stored per selected store"
              icon={Target}
              tone="emerald"
            />
            <MetricCard
              title="Schema"
              value={status?.schemaReady ? "Ready" : "Missing"}
              subtitle="Run ADD_META_ANALYTICS_MODULE.sql before first live sync"
              icon={KeyRound}
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <SectionCard
              title="Meta Business Suite"
              description="Save your Meta access token and the ad-account scope to sync advertising metrics."
            >
              <form className="space-y-4" onSubmit={handleSaveMeta}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Business ID</span>
                    <input
                      type="text"
                      value={metaForm.business_id}
                      onChange={(event) =>
                        handleMetaFormChange("business_id", event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      placeholder="123456789012345"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Page ID</span>
                    <input
                      type="text"
                      value={metaForm.page_id}
                      onChange={(event) =>
                        handleMetaFormChange("page_id", event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      placeholder="Optional page reference"
                    />
                  </label>

                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Access Token</span>
                    <input
                      type="password"
                      value={metaForm.access_token}
                      onChange={(event) =>
                        handleMetaFormChange("access_token", event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      placeholder="Leave blank to keep the currently saved token"
                    />
                    <p className="text-xs text-slate-500">
                      Current token: {status?.integration?.meta?.masked_access_token || "not saved"}
                    </p>
                  </label>

                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">
                      Ad Account IDs
                    </span>
                    <textarea
                      rows={3}
                      value={metaForm.ad_account_ids}
                      onChange={(event) =>
                        handleMetaFormChange("ad_account_ids", event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      placeholder="act_1234567890, act_0987654321"
                    />
                    <p className="text-xs text-slate-500">
                      Leave empty to sync all ad accounts visible to the token.
                    </p>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Pixel ID</span>
                    <input
                      type="text"
                      value={metaForm.pixel_id}
                      onChange={(event) =>
                        handleMetaFormChange("pixel_id", event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      placeholder="Optional pixel reference"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingMeta}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  <Save size={16} />
                  {savingMeta ? "Saving..." : "Save Meta Config"}
                </button>
              </form>
            </SectionCard>

            <SectionCard
              title="OpenRouter AI Layer"
              description="Choose the model that will read Meta numbers and generate recommendations."
            >
              <form className="space-y-4" onSubmit={handleSaveOpenRouter}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">API Key</span>
                    <input
                      type="password"
                      value={openRouterForm.api_key}
                      onChange={(event) =>
                        handleOpenRouterFormChange("api_key", event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                      placeholder="Leave blank to keep the current key"
                    />
                    <p className="text-xs text-slate-500">
                      Current key: {status?.integration?.openrouter?.masked_api_key || "not saved"}
                    </p>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Model</span>
                    <select
                      value={openRouterForm.model}
                      onChange={(event) =>
                        handleOpenRouterFormChange("model", event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    >
                      {models.length === 0 ? (
                        <option value={openRouterForm.model || ""}>
                          {openRouterForm.model || "Save key to load models"}
                        </option>
                      ) : (
                        models.slice(0, 80).map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name || model.id}
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Site URL</span>
                    <input
                      type="url"
                      value={openRouterForm.site_url}
                      onChange={(event) =>
                        handleOpenRouterFormChange("site_url", event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                      placeholder="https://tetiano.me"
                    />
                  </label>

                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Site Name</span>
                    <input
                      type="text"
                      value={openRouterForm.site_name}
                      onChange={(event) =>
                        handleOpenRouterFormChange("site_name", event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                      placeholder="Tetiano"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingOpenRouter}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:opacity-60"
                >
                  <Save size={16} />
                  {savingOpenRouter ? "Saving..." : "Save OpenRouter Config"}
                </button>
              </form>
            </SectionCard>
          </div>

          <SectionCard
            title="AI Brief Focus"
            description="This instruction is sent with the latest Meta data whenever you generate a brief."
            actions={
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-60"
              >
                <Brain size={16} />
                {analyzing ? "Analyzing..." : "Run AI Analysis"}
              </button>
            }
          >
            <textarea
              rows={4}
              value={analysisFocus}
              onChange={(event) => setAnalysisFocus(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              title="Spend"
              value={formatCurrency(summary.spend, primaryCurrency)}
              subtitle={`${formatCount(summary.accounts_count)} accounts in scope`}
              icon={Wallet}
              tone="sky"
            />
            <MetricCard
              title="Impressions"
              value={formatCount(summary.impressions)}
              subtitle={`${formatCount(summary.clicks)} clicks`}
              icon={LineChart}
              tone="emerald"
            />
            <MetricCard
              title="CTR"
              value={formatPercent(summary.ctr)}
              subtitle={`CPC ${formatCurrency(summary.cpc, primaryCurrency)}`}
              icon={TrendingUp}
              tone="amber"
            />
            <MetricCard
              title="Purchases"
              value={formatCount(summary.purchases)}
              subtitle={`ROAS ${toNumber(summary.roas).toFixed(2)}x`}
              icon={Target}
              tone="violet"
            />
            <MetricCard
              title="Leads"
              value={formatCount(summary.leads)}
              subtitle={`${formatCount(summary.rows_count)} daily insight rows`}
              icon={Sparkles}
              tone="rose"
            />
          </div>

          <TableSection
            title="Daily Trend"
            description="Last 14 days from the stored Meta snapshots."
            columns={["Date", "Spend", "Impressions", "Clicks", "CTR", "Purchases"]}
            rows={dailyRows}
            renderRow={(row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{row.id}</td>
                <td className="px-4 py-3 text-slate-700">
                  {formatCurrency(row.spend, primaryCurrency)}
                </td>
                <td className="px-4 py-3 text-slate-700">{formatCount(row.impressions)}</td>
                <td className="px-4 py-3 text-slate-700">{formatCount(row.clicks)}</td>
                <td className="px-4 py-3 text-slate-700">{formatPercent(row.ctr)}</td>
                <td className="px-4 py-3 text-slate-700">{formatCount(row.purchases)}</td>
              </tr>
            )}
          />

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <TableSection
              title="Top Campaigns"
              description="Highest-spend campaigns ranked from the synced Meta data."
              columns={["Campaign", "Spend", "Clicks", "Purchases", "ROAS"]}
              rows={campaigns}
              renderRow={(row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.name || row.id}</div>
                    <div className="text-xs text-slate-500">{row.objective || "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatCurrency(row.spend, primaryCurrency)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatCount(row.clicks)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCount(row.purchases)}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {toNumber(row.roas).toFixed(2)}x
                  </td>
                </tr>
              )}
            />

            <TableSection
              title="Top Ads"
              description="Best or biggest ads by spend based on synced daily ad-level rows."
              columns={["Ad", "Spend", "CTR", "Leads", "Purchases"]}
              rows={ads}
              renderRow={(row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.name || row.id}</div>
                    <div className="text-xs text-slate-500">
                      Campaign {row.campaign_id || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatCurrency(row.spend, primaryCurrency)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatPercent(row.ctr)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCount(row.leads)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCount(row.purchases)}</td>
                </tr>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <SectionCard
              title="Recent AI Briefs"
              description="Saved OpenRouter analyses generated from the latest Meta performance data."
            >
              {analyses.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                  Generate your first AI brief after syncing Meta data.
                </div>
              ) : (
                <div className="space-y-4">
                  {analyses.map((analysis) => {
                    const summaryJson = analysis?.summary_json || {};
                    return (
                      <div
                        key={analysis.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {analysis.model || "OpenRouter analysis"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDateTime(analysis.created_at)}
                            </p>
                          </div>
                          {analysis.focus_area ? (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              {analysis.focus_area}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm leading-6 text-slate-700">
                          {summaryJson?.executive_summary
                            ? summaryJson.executive_summary
                            : truncateText(analysis.recommendation_text, 320)}
                        </p>
                        {Array.isArray(summaryJson?.actions) && summaryJson.actions.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {summaryJson.actions.slice(0, 4).map((action, index) => (
                              <span
                                key={`${analysis.id}-action-${index}`}
                                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700"
                              >
                                {action.title || `Action ${index + 1}`}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Sync History"
              description="Latest Meta sync runs stored for this store."
            >
              {syncRuns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                  No sync runs recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {syncRuns.map((run) => (
                    <div
                      key={run.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {run.status === "completed"
                              ? "Completed"
                              : run.status === "failed"
                                ? "Failed"
                                : "Running"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(run.started_at)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            run.status === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : run.status === "failed"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {run.sync_type || "manual"}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                        <p>
                          Range: {run.date_start || "-"} to {run.date_stop || "-"}
                        </p>
                        <p>
                          Finished: {run.completed_at ? formatDateTime(run.completed_at) : "-"}
                        </p>
                      </div>
                      {run.error_message ? (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          {run.error_message}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {!status?.schemaReady ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5" size={18} />
                <div>
                  <p className="font-semibold">Database schema is still missing.</p>
                  <p className="mt-1">
                    Run <code>ADD_META_ANALYTICS_MODULE.sql</code> on Supabase first, then save
                    your Meta and OpenRouter credentials.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
