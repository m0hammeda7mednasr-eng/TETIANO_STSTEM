import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Brain,
  KeyRound,
  LineChart,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Send,
  Settings,
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
  "Highlight wasted spend, scalable campaigns, creative testing opportunities, operational bottlenecks, and budget shifts.";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toArray = (value) => (Array.isArray(value) ? value : []);
const truncateText = (value, maxLength = 260) => {
  const normalized = String(value || "").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
};

function Card({ title, value, subtitle, icon: Icon, tone = "sky" }) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    violet: "border-violet-200 bg-violet-50 text-violet-900",
  };
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone] || tones.sky}`}>
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

function Section({ title, description = "", actions = null, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Recommendation({ item }) {
  const tones = {
    high: "border-rose-200 bg-rose-50 text-rose-900",
    medium: "border-amber-200 bg-amber-50 text-amber-900",
    low: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[item?.priority] || tones.medium}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-semibold">{item?.title || "Recommendation"}</p>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
          {item?.priority || "medium"}
        </span>
      </div>
      <p className="text-sm leading-6 opacity-90">{item?.action}</p>
      {item?.reason ? <p className="mt-2 text-xs opacity-75">{item.reason}</p> : null}
    </div>
  );
}

function ChatBubble({ role, content, timestamp = "" }) {
  const assistant = role === "assistant";
  return (
    <div className={`flex ${assistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-3xl rounded-2xl px-4 py-3 shadow-sm ${
          assistant ? "border border-slate-200 bg-white text-slate-800" : "bg-slate-900 text-white"
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-6">{content}</p>
        {timestamp ? (
          <p className={`mt-2 text-[11px] ${assistant ? "text-slate-400" : "text-slate-200"}`}>
            {timestamp}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SimpleTable({ columns, rows, renderRow, emptyText }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">{emptyText}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-semibold">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

export default function MetaCommandCenter() {
  const { select, formatCurrency, formatDateTime, formatNumber, formatPercent } =
    useLocale();
  const [status, setStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [assistantSending, setAssistantSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [analysisFocus, setAnalysisFocus] = useState(DEFAULT_ANALYSIS_FOCUS);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([{ role: "assistant", content: "جاهز. اسألني: أوقف إيه، أزود إيه، أعيد تموين إيه، أو فين المشكلة التشغيلية الأساسية في الستور.", timestamp: new Date().toISOString() }]);

  const loadPage = async ({ silent = false } = {}) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      const [statusResponse, overviewResponse] = await Promise.all([
        metaAnalyticsAPI.getStatus(),
        metaAnalyticsAPI.getOverview({ days: 30 }),
      ]);
      setStatus(statusResponse.data || null);
      setOverview(overviewResponse.data || null);
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => { loadPage(); }, []);

  const summary = overview?.overview?.summary || {};
  const storeSnapshot = overview?.store_snapshot || {};
  const formatCount = (value) =>
    formatNumber(value, { maximumFractionDigits: 0 });
  const formatRate = (value) =>
    formatPercent(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const formatMoney = (value, currency = "USD") =>
    formatCurrency(value, {
      currency: currency || "USD",
      currencyStyle: "intl",
    });
  const recommendations = useMemo(() => toArray(overview?.recommendations).slice(0, 6), [overview]);
  const campaigns = useMemo(() => toArray(overview?.overview?.campaigns).slice(0, 8), [overview]);
  const ads = useMemo(() => toArray(overview?.overview?.ads).slice(0, 8), [overview]);
  const analyses = toArray(overview?.analyses);
  const syncRuns = toArray(overview?.sync_runs);
  const primaryCurrency = overview?.overview?.accounts?.[0]?.currency || "USD";
  const quickPrompts = useMemo(() => [
    "قولّي أوقف إيه فورًا في الإعلانات والتشغيل.",
    "إيه اللي يستحق تزود له budget أو تركيز اليوم؟",
    "مين المنتجات اللي لازم تترد أولًا وليه؟",
    "فين عنق الزجاجة الأساسي في الستور دلوقتي؟",
  ], []);

  const handleSync = async () => {
    try {
      setSyncing(true); setError(""); setSuccess("");
      const response = await metaAnalyticsAPI.sync({ days: 30 });
      setSuccess(`Meta sync completed. ${formatCount(response?.data?.sync?.snapshots_count)} daily insight rows loaded.`);
      await loadPage({ silent: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally { setSyncing(false); }
  };
  const handleAnalyze = async () => {
    try {
      setAnalyzing(true); setError(""); setSuccess("");
      await metaAnalyticsAPI.analyze({ days: 30, focus: analysisFocus });
      setSuccess("AI brief generated successfully.");
      await loadPage({ silent: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally { setAnalyzing(false); }
  };
  const handleAssistantSend = async (message = assistantInput) => {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) return;
    const history = assistantMessages.slice(-6).map((entry) => ({ role: entry.role, content: entry.content }));
    const userMessage = { role: "user", content: normalizedMessage, timestamp: new Date().toISOString() };
    setAssistantMessages((current) => [...current, userMessage]);
    setAssistantInput(""); setAssistantSending(true); setError("");
    try {
      const response = await metaAnalyticsAPI.chat({ message: normalizedMessage, history, days: 30 });
      setAssistantMessages((current) => [...current, { role: "assistant", content: response?.data?.reply?.content || "No response was returned from the AI assistant.", timestamp: new Date().toISOString() }]);
      setSuccess("AI operator reply is ready.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setAssistantMessages((current) => current.slice(0, -1));
      setAssistantInput(normalizedMessage);
    } finally { setAssistantSending(false); }
  };

  if (loading) {
    return <div className="flex h-screen bg-slate-100"><Sidebar /><main className="flex-1 overflow-auto p-8"><LoadingSpinner label="Loading Meta & Analytics module..." /></main></div>;
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="space-y-6 p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900"><Megaphone className="text-sky-700" size={30} />{select("ميتا والتحليلات", "Meta & Analytics")}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">{select("غرفة تشغيل موحدة تجمع إشارات الستور مع Meta وتحوّلها إلى قرارات واضحة: إيه يوقف، إيه يزود، وإيه يحتاج إعادة تموين أو متابعة.", "A unified command center that combines store signals with Meta performance into direct decisions: what to pause, what to scale, and what to restock next.")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/settings" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"><Settings size={16} />Settings</Link>
              <button type="button" onClick={() => loadPage({ silent: true })} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />Refresh</button>
              <button type="button" onClick={handleSync} disabled={syncing} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-60"><RefreshCw size={16} className={syncing ? "animate-spin" : ""} />{syncing ? "Syncing Meta..." : "Sync Meta Data"}</button>
              <button type="button" onClick={handleAnalyze} disabled={analyzing} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:opacity-60"><Sparkles size={16} className={analyzing ? "animate-pulse" : ""} />{analyzing ? "Generating brief..." : "Generate AI Brief"}</button>
            </div>
          </div>
          {error ? <ErrorAlert message={error} onClose={() => setError("")} /> : null}
          {success ? <SuccessAlert message={success} onClose={() => setSuccess("")} /> : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <Card title="Meta connection" value={status?.integration?.meta?.configured ? (status?.integration?.meta?.connected ? "Connected" : "Configured") : "Not configured"} subtitle={status?.integration?.meta?.last_sync_at ? `Last sync ${formatDateTime(status.integration.meta.last_sync_at)}` : "Configure Meta in Settings to validate the token"} icon={Megaphone} tone="sky" />
            <Card title="OpenRouter" value={status?.integration?.openrouter?.configured ? (status?.integration?.openrouter?.connected ? "Ready" : "Configured") : "Not configured"} subtitle={status?.integration?.openrouter?.model || "AI brief and operator chat run from the saved model"} icon={Bot} tone="violet" />
            <Card title="Net revenue" value={formatMoney(storeSnapshot?.financial?.net_revenue, primaryCurrency)} subtitle={`${formatCount(storeSnapshot?.orders?.total)} orders in the store snapshot`} icon={Wallet} tone="emerald" />
            <Card title="Low stock pressure" value={formatCount(storeSnapshot?.catalog?.low_stock_count)} subtitle={`${formatCount(storeSnapshot?.catalog?.out_of_stock_count)} out of stock`} icon={KeyRound} tone="amber" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <Card title="Success rate" value={formatRate(storeSnapshot?.orders?.success_rate)} subtitle={`${formatCount(storeSnapshot?.orders?.paid)} paid orders`} icon={Target} tone="sky" />
            <Card title="Pending orders" value={formatCount(storeSnapshot?.orders?.pending)} subtitle={formatMoney(storeSnapshot?.financial?.pending_amount, primaryCurrency)} icon={Brain} tone="rose" />
            <Card title="Active customers" value={formatCount(storeSnapshot?.customers?.active_customers_lookback)} subtitle={`${formatCount(storeSnapshot?.customers?.total_customers)} total customers`} icon={Bot} tone="emerald" />
            <Card title="Schema" value={status?.schemaReady ? "Ready" : "Missing"} subtitle="Run ADD_META_ANALYTICS_MODULE.sql before first live sync" icon={Sparkles} tone="violet" />
          </div>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[0.95fr,1.05fr]">
            <Section title="Suggested Moves" description="Immediate operational recommendations based on the store snapshot and the latest Meta overview." actions={<Link to="/settings" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Tune integrations<ArrowRight size={16} /></Link>}>
              {recommendations.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">Save OpenRouter and Meta in Settings and sync some data to start getting action suggestions.</div> : <div className="space-y-3">{recommendations.map((item, index) => <Recommendation key={`${item.title || "recommendation"}-${index}`} item={item} />)}</div>}
            </Section>
            <Section title="AI Operator Chat" description="Ask directly: what to stop, what to scale, what to restock, and where the bottleneck is." actions={<button type="button" onClick={() => handleAssistantSend(quickPrompts[0])} disabled={assistantSending} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-60"><MessageSquare size={16} />Ask AI now</button>}>
              <div className="mb-4 flex flex-wrap gap-2">{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => handleAssistantSend(prompt)} disabled={assistantSending} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-white disabled:opacity-60">{prompt}</button>)}</div>
              <div className="space-y-3 rounded-2xl bg-slate-50 p-4">{assistantMessages.map((message, index) => <ChatBubble key={`${message.role}-${message.timestamp || index}-${index}`} role={message.role} content={message.content} timestamp={formatDateTime(message.timestamp)} />)}{assistantSending ? <ChatBubble role="assistant" content="Analyzing the store and ads context..." /> : null}</div>
              <div className="mt-4">
                <textarea rows={4} value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" placeholder="اكتب سؤالك هنا: أوقف إيه؟ أركز على إيه؟ فين المشكلة؟" />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">The reply is grounded in the latest store snapshot plus Meta data if available.</p>
                  <button type="button" onClick={() => handleAssistantSend()} disabled={assistantSending || !assistantInput.trim()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"><Send size={16} />{assistantSending ? "Sending..." : "Send to AI"}</button>
                </div>
              </div>
            </Section>
          </div>

          <Section title="AI Brief Focus" description="This instruction is sent with the latest Meta data whenever you generate a formal brief." actions={<button type="button" onClick={handleAnalyze} disabled={analyzing} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-60"><Brain size={16} />{analyzing ? "Analyzing..." : "Run AI Analysis"}</button>}>
            <textarea rows={4} value={analysisFocus} onChange={(event) => setAnalysisFocus(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
          </Section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card title="Spend" value={formatMoney(summary.spend, primaryCurrency)} subtitle={`${formatCount(summary.accounts_count)} accounts in scope`} icon={Wallet} tone="sky" />
            <Card title="Impressions" value={formatCount(summary.impressions)} subtitle={`${formatCount(summary.clicks)} clicks`} icon={LineChart} tone="emerald" />
            <Card title="CTR" value={formatRate(summary.ctr)} subtitle={`CPC ${formatMoney(summary.cpc, primaryCurrency)}`} icon={TrendingUp} tone="amber" />
            <Card title="Purchases" value={formatCount(summary.purchases)} subtitle={`ROAS ${toNumber(summary.roas).toFixed(2)}x`} icon={Target} tone="violet" />
            <Card title="Leads" value={formatCount(summary.leads)} subtitle={`${formatCount(summary.rows_count)} daily insight rows`} icon={Sparkles} tone="rose" />
          </div>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <Section title="Top Campaigns" description="Highest-spend campaigns ranked from the synced Meta data.">
              <SimpleTable columns={["Campaign", "Spend", "Clicks", "Purchases", "ROAS"]} rows={campaigns} emptyText="No campaign data available yet." renderRow={(row) => <tr key={row.id} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-medium text-slate-900">{row.name || row.id}</div><div className="text-xs text-slate-500">{row.objective || "-"}</div></td><td className="px-4 py-3 text-slate-700">{formatMoney(row.spend, primaryCurrency)}</td><td className="px-4 py-3 text-slate-700">{formatCount(row.clicks)}</td><td className="px-4 py-3 text-slate-700">{formatCount(row.purchases)}</td><td className="px-4 py-3 text-slate-700">{formatNumber(row.roas, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x</td></tr>} />
            </Section>
            <Section title="Top Ads" description="Best or biggest ads by spend based on synced daily ad-level rows.">
              <SimpleTable columns={["Ad", "Spend", "CTR", "Leads", "Purchases"]} rows={ads} emptyText="No ad data available yet." renderRow={(row) => <tr key={row.id} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-medium text-slate-900">{row.name || row.id}</div><div className="text-xs text-slate-500">Campaign {row.campaign_id || "-"}</div></td><td className="px-4 py-3 text-slate-700">{formatMoney(row.spend, primaryCurrency)}</td><td className="px-4 py-3 text-slate-700">{formatRate(row.ctr)}</td><td className="px-4 py-3 text-slate-700">{formatCount(row.leads)}</td><td className="px-4 py-3 text-slate-700">{formatCount(row.purchases)}</td></tr>} />
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <Section title="Recent AI Briefs" description="Saved OpenRouter analyses generated from the latest Meta performance data.">
              {analyses.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">Generate your first AI brief after syncing Meta data.</div> : <div className="space-y-4">{analyses.map((analysis) => { const summaryJson = analysis?.summary_json || {}; return <div key={analysis.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">{analysis.model || "OpenRouter analysis"}</p><p className="text-xs text-slate-500">{formatDateTime(analysis.created_at)}</p></div>{analysis.focus_area ? <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">{analysis.focus_area}</span> : null}</div><p className="text-sm leading-6 text-slate-700">{summaryJson?.executive_summary ? summaryJson.executive_summary : truncateText(analysis.recommendation_text, 320)}</p></div>; })}</div>}
            </Section>
            <Section title="Sync History" description="Latest Meta sync runs stored for this store.">
              {syncRuns.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">No sync runs recorded yet.</div> : <div className="space-y-3">{syncRuns.map((run) => <div key={run.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-slate-900">{run.status === "completed" ? "Completed" : run.status === "failed" ? "Failed" : "Running"}</p><p className="text-xs text-slate-500">{formatDateTime(run.started_at)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${run.status === "completed" ? "bg-emerald-100 text-emerald-700" : run.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{run.sync_type || "manual"}</span></div><div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2"><p>Range: {run.date_start || "-"} to {run.date_stop || "-"}</p><p>Finished: {run.completed_at ? formatDateTime(run.completed_at) : "-"}</p></div>{run.error_message ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{run.error_message}</div> : null}</div>)}</div>}
            </Section>
          </div>

          {!status?.schemaReady ? <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><div className="flex items-start gap-3"><Sparkles className="mt-0.5" size={18} /><div><p className="font-semibold">Database schema is still missing.</p><p className="mt-1">Run <code>ADD_META_ANALYTICS_MODULE.sql</code> on Supabase first, then save your Meta and OpenRouter credentials in Settings.</p></div></div></div> : null}
        </div>
      </main>
    </div>
  );
}
