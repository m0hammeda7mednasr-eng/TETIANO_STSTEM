import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CircleDollarSign,
  HeartHandshake,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Warehouse,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import {
  EmptyState,
  ErrorAlert,
  LoadingSpinner,
  SkeletonBlock,
} from "../components/Common";
import { useLocale } from "../context/LocaleContext";
import { dashboardAPI, getErrorMessage } from "../utils/api";
import { HEAVY_VIEW_CACHE_FRESH_MS } from "../utils/refreshPolicy";
import {
  buildStoreScopedCacheKey,
  isCacheFresh,
  peekCachedView,
  readCachedView,
  writeCachedView,
} from "../utils/viewCache";

const GROWTH_CENTER_CACHE_FRESH_MS = HEAVY_VIEW_CACHE_FRESH_MS;
const DEFAULT_LOOKBACK_DAYS = 30;

const toArray = (value) => (Array.isArray(value) ? value : []);
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const STATUS_STYLES = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  watch: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
};

const PRIORITY_STYLES = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  growth: "border-sky-200 bg-sky-50 text-sky-700",
};

const STOCK_STYLES = {
  out_of_stock: "border-rose-200 bg-rose-50 text-rose-700",
  critical: "border-orange-200 bg-orange-50 text-orange-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  watch: "border-sky-200 bg-sky-50 text-sky-700",
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function GrowthCenter() {
  const {
    formatCurrency,
    formatDateTime,
    formatNumber,
    formatPercent,
  } = useLocale();
  const cacheKey = useMemo(
    () => buildStoreScopedCacheKey("dashboard:growth-center:v1"),
    [],
  );
  const initialCachedEntry = useMemo(() => peekCachedView(cacheKey), [cacheKey]);
  const [data, setData] = useState(() => initialCachedEntry?.value || null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(
    () => initialCachedEntry?.updatedAt || null,
  );
  const [loading, setLoading] = useState(!initialCachedEntry?.value);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const response = await dashboardAPI.getGrowthCenter({
          days: DEFAULT_LOOKBACK_DAYS,
        });
        const nextPayload = response?.data || null;
        setData(nextPayload);
        setError("");

        const cachedEntry = await writeCachedView(cacheKey, nextPayload);
        setLastUpdatedAt(cachedEntry?.updatedAt || new Date().toISOString());
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cacheKey],
  );

  useEffect(() => {
    let active = true;

    (async () => {
      const cachedEntry = await readCachedView(cacheKey);
      if (!active) {
        return;
      }

      if (cachedEntry?.value) {
        setData(cachedEntry.value);
        setLastUpdatedAt(cachedEntry.updatedAt || null);
        setLoading(false);
      }

      if (!cachedEntry?.value || !isCacheFresh(cachedEntry, GROWTH_CENTER_CACHE_FRESH_MS)) {
        await loadData({ silent: Boolean(cachedEntry?.value) });
      }
    })();

    return () => {
      active = false;
    };
  }, [cacheKey, loadData]);

  if (loading && !data) {
    return (
      <div className="flex h-screen bg-slate-100">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <LoadingSpinner label="Loading growth center..." />
        </main>
      </div>
    );
  }

  const summary = data?.summary || {};
  const healthChecks = toArray(data?.health_checks);
  const actions = toArray(data?.recommended_actions);
  const replenishment = data?.replenishment || {};
  const retention = data?.retention || {};
  const profitability = data?.profitability || {};
  const orderSummary = data?.order_summary || {};

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <section className="app-surface-strong overflow-hidden rounded-[32px] p-6 sm:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                  <TrendingUp size={14} />
                  Growth Center
                </div>
                <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  Run the store with one growth loop, not disconnected pages.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  Inventory pressure, customer retention, saved margins, and order quality are now
                  tied together in one operator view.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <HeroChip
                    icon={ShieldCheck}
                    label="Health Score"
                    value={`${formatNumber(summary.health_score || 0)} / 100`}
                  />
                  <HeroChip
                    icon={Warehouse}
                    label="Urgent Actions"
                    value={formatNumber(summary.urgent_actions_count || 0)}
                  />
                  <HeroChip
                    icon={HeartHandshake}
                    label="Win-Back Pool"
                    value={formatNumber(summary.win_back_count || 0)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Last refresh
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">
                    {formatDateTime(lastUpdatedAt || data?.generated_at)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadData({ silent: true })}
                  className="app-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white"
                >
                  <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
            </div>

            {error ? <div className="mt-5"><ErrorAlert message={error} /></div> : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                icon={TrendingUp}
                title="Recent Revenue"
                value={formatCurrency(summary.recent_revenue || 0)}
                subtitle={`Last ${DEFAULT_LOOKBACK_DAYS} days`}
              />
              <SummaryCard
                icon={Users}
                title="Repeat Rate"
                value={formatPercent(summary.repeat_customer_rate || 0)}
                subtitle="Active customers returning"
              />
              <SummaryCard
                icon={CircleDollarSign}
                title="Cost Coverage"
                value={formatPercent(summary.cost_coverage_rate || 0)}
                subtitle="Products with saved costs"
              />
              <SummaryCard
                icon={PackageSearch}
                title="Low Stock"
                value={formatNumber(summary.low_stock_count || 0)}
                subtitle="Products under pressure"
              />
              <SummaryCard
                icon={TrendingUp}
                title="Scale Now"
                value={formatNumber(summary.scale_now_count || 0)}
                subtitle="Healthy SKUs with room"
              />
            </div>
          </section>

          <div className="grid gap-6 2xl:grid-cols-[1.08fr,0.92fr]">
            <SectionShell
              title="Action Board"
              description="The next actions that unblock growth fastest."
            >
              {actions.length ? (
                <div className="space-y-4">
                  {actions.map((item) => (
                    <ActionCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No actions yet"
                  message="Refresh the page after store data is available."
                />
              )}
            </SectionShell>

            <SectionShell
              title="Health Checks"
              description="Five checks that tell you whether growth is safe to push."
            >
              <div className="grid gap-4">
                {healthChecks.length ? (
                  healthChecks.map((check) => (
                    <HealthCheckCard key={check.id} check={check} />
                  ))
                ) : (
                  <SkeletonBlock className="h-52 w-full rounded-[28px]" roundedClassName="" />
                )}
              </div>

              <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Order Snapshot
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniStat label="Orders" value={formatNumber(orderSummary.orders_count || 0)} />
                  <MiniStat
                    label="Avg Order"
                    value={formatCurrency(orderSummary.average_order_value || 0)}
                  />
                  <MiniStat
                    label="Cancelled"
                    value={formatPercent(orderSummary.cancellation_rate || 0)}
                  />
                  <MiniStat
                    label="Refunded"
                    value={formatPercent(orderSummary.refund_rate || 0)}
                  />
                </div>
              </div>
            </SectionShell>
          </div>

          <SectionShell
            title="Replenishment Priorities"
            description="Recent sell-through is translated into stock pressure and suggested reorder units."
          >
            {toArray(replenishment.priorities).length ? (
              <div className="space-y-3">
                {toArray(replenishment.priorities).map((item) => (
                  <ReplenishmentRow
                    key={item.id || item.title}
                    item={item}
                    formatCurrency={formatCurrency}
                    formatNumber={formatNumber}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No replenishment pressure"
                message="Products will appear here once recent demand or stock pressure exists."
              />
            )}
          </SectionShell>

          <div className="grid gap-6 2xl:grid-cols-[1fr,0.95fr]">
            <SectionShell
              title="Retention Engine"
              description="Customer growth segments built from buying behavior, not just raw totals."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {toArray(retention.segments).map((segment) => (
                  <SegmentCard
                    key={segment.id}
                    segment={segment}
                    formatCurrency={formatCurrency}
                    formatNumber={formatNumber}
                    formatPercent={formatPercent}
                  />
                ))}
              </div>
            </SectionShell>

            <SectionShell
              title="Win-Back Queue"
              description="The highest-value quiet customers to recover first."
            >
              {toArray(retention.win_back_candidates).length ? (
                <div className="space-y-3">
                  {toArray(retention.win_back_candidates).map((item) => (
                    <CustomerRecoveryCard
                      key={item.id}
                      item={item}
                      formatCurrency={formatCurrency}
                      formatNumber={formatNumber}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No win-back queue"
                  message="Once customers age out of the active window, they will appear here."
                />
              )}
            </SectionShell>
          </div>

          <SectionShell
            title="Profitability Engine"
            description="Products ready to scale, products leaking margin, and products missing saved cost data."
          >
            <div className="grid gap-6 xl:grid-cols-3">
              <ListPanel
                title="Scale Now"
                rows={toArray(profitability.scale_now)}
                emptyTitle="No scale candidates"
                renderRow={(item) => (
                  <ProductDecisionCard
                    item={item}
                    formatCurrency={formatCurrency}
                    formatNumber={formatNumber}
                    valueLabel="Recent Profit"
                    value={formatCurrency(item.recent_profit || 0)}
                    hint={`Margin ${formatPercent(item.recent_margin || 0)} | Stock ${formatNumber(item.inventory_quantity || 0)}`}
                  />
                )}
              />
              <ListPanel
                title="Margin Leaks"
                rows={toArray(profitability.margin_leaks)}
                emptyTitle="No margin leaks"
                renderRow={(item) => (
                  <ProductDecisionCard
                    item={item}
                    formatCurrency={formatCurrency}
                    formatNumber={formatNumber}
                    valueLabel="Recent Revenue"
                    value={formatCurrency(item.recent_revenue || 0)}
                    hint={`Margin ${formatPercent(item.recent_margin || 0)} | Units ${formatNumber(item.sold_units_lookback || 0)}`}
                  />
                )}
              />
              <ListPanel
                title="Missing Costs"
                rows={toArray(profitability.missing_cost_products)}
                emptyTitle="All tracked costs are filled"
                renderRow={(item) => (
                  <ProductDecisionCard
                    item={item}
                    formatCurrency={formatCurrency}
                    formatNumber={formatNumber}
                    valueLabel="Revenue Exposed"
                    value={formatCurrency(item.recent_revenue || 0)}
                    hint={`Stock ${formatNumber(item.inventory_quantity || 0)} | Units ${formatNumber(item.sold_units_lookback || 0)}`}
                  />
                )}
              />
            </div>
          </SectionShell>
        </div>
      </main>
    </div>
  );
}

function HeroChip({ icon: Icon, label, value }) {
  return (
    <div className="rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

function SummaryCard({ icon: Icon, title, value, subtitle }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</div>
          <div className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</div>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function SectionShell({ title, description, children }) {
  return (
    <section className="app-surface rounded-[30px] p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ActionCard({ item }) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium}`}>
          {String(item.priority || "medium").replace(/_/g, " ")}
        </span>
        <Link to={item.route || "/dashboard"} className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
          Open
          <ArrowRight size={14} />
        </Link>
      </div>
      <h3 className="mt-4 text-lg font-black tracking-tight text-slate-950">{item.title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-600">{item.reason}</p>
      <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700">
        {item.action}
      </p>
    </div>
  );
}

function HealthCheckCard({ check }) {
  return (
    <Link
      to={check.route || "/dashboard"}
      className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-500">{check.title}</div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${STATUS_STYLES[check.status] || STATUS_STYLES.watch}`}>
          {check.status}
        </span>
      </div>
      <div className="mt-4 text-3xl font-black tracking-tight text-slate-950">{check.score}</div>
      <div className="mt-2 text-sm font-semibold text-slate-700">{check.metric}</div>
      <div className="mt-3 text-sm leading-7 text-slate-500">{check.detail}</div>
    </Link>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

function ReplenishmentRow({ item, formatCurrency, formatNumber }) {
  return (
    <Link
      to={item.route || "/products"}
      className="grid gap-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:grid-cols-[1.15fr,0.85fr]"
    >
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-black tracking-tight text-slate-950">{item.title}</div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${STOCK_STYLES[item.stock_status] || STOCK_STYLES.watch}`}>
            {String(item.stock_status || "watch").replace(/_/g, " ")}
          </span>
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-500">{item.note}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Stock" value={formatNumber(item.inventory_quantity || 0)} />
        <MiniStat label="Sold" value={formatNumber(item.sold_units_lookback || 0)} />
        <MiniStat
          label="Cover"
          value={item.days_of_cover === null ? "No pace yet" : `${formatNumber(item.days_of_cover)} days`}
        />
        <MiniStat
          label="Reorder"
          value={`${formatNumber(item.suggested_reorder_units || 0)} units`}
        />
      </div>
      <div className="md:col-span-2 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span>Revenue at risk: {formatCurrency(item.recent_revenue || 0)}</span>
        <span className="font-semibold text-sky-700">Open product</span>
      </div>
    </Link>
  );
}

function SegmentCard({ segment, formatCurrency, formatNumber, formatPercent }) {
  return (
    <Link
      to={segment.route || "/customers"}
      className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="text-lg font-black tracking-tight text-slate-950">{segment.title}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniStat label="Customers" value={formatNumber(segment.count || 0)} />
        <MiniStat label="Revenue" value={formatCurrency(segment.revenue || 0)} />
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-500">{segment.note}</p>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <div className="font-semibold">{segment.action}</div>
        <div className="mt-2 text-slate-500">
          Share of customers: {formatPercent(segment.share_of_customers || 0)}
        </div>
      </div>
    </Link>
  );
}

function CustomerRecoveryCard({ item, formatCurrency, formatNumber }) {
  return (
    <Link
      to="/customers"
      className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-bold text-slate-950">{item.name}</div>
          <div className="mt-1 text-sm text-slate-500">{item.email || "No email captured"}</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium}`}>
          {String(item.segment || "win_back").replace(/_/g, " ")}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Spent" value={formatCurrency(item.total_spent || 0)} />
        <MiniStat label="Orders" value={formatNumber(item.orders_count || 0)} />
        <MiniStat label="Last Order" value={`${formatNumber(item.last_order_days_ago || 0)} days`} />
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-600">{item.suggested_action}</p>
    </Link>
  );
}

function ListPanel({ title, rows, renderRow, emptyTitle }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 text-lg font-black tracking-tight text-slate-950">{title}</div>
      <div className="space-y-3">
        {rows.length ? rows.map(renderRow) : <EmptyState title={emptyTitle} message="" />}
      </div>
    </div>
  );
}

function ProductDecisionCard({
  item,
  valueLabel,
  value,
  hint,
}) {
  return (
    <Link
      to={item.route || "/products"}
      className="block rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="text-base font-bold text-slate-950">{item.title}</div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {valueLabel}
      </div>
      <div className="mt-1 text-lg font-black tracking-tight text-slate-900">{value}</div>
      <div className="mt-3 text-sm leading-7 text-slate-500">{hint}</div>
    </Link>
  );
}
