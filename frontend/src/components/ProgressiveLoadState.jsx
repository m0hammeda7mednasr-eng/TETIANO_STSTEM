import { CheckCircle2, RefreshCw } from "lucide-react";

const formatTime = (value) => {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toLocaleTimeString("ar-EG");
  } catch {
    return "";
  }
};

export function ProgressiveLoadBanner({
  active,
  loadedCount = 0,
  batchSize = 200,
  itemLabel = "items",
  message = "",
  lastUpdatedAt = null,
}) {
  const visibleNow = Math.min(Math.max(loadedCount, 0), batchSize);

  let title = `Preparing ${batchSize.toLocaleString()} ${itemLabel}`;
  let description = "The first batch appears first, then the remaining data keeps loading in the background.";

  if (active && loadedCount > 0) {
    title = `Showing ${visibleNow.toLocaleString()} ${itemLabel} now`;
    description = `More ${itemLabel} are loading in the background. The page stays usable while the list keeps filling up.`;
  } else if (!active && loadedCount > 0) {
    title = `${loadedCount.toLocaleString()} ${itemLabel} ready`;
    description = lastUpdatedAt
      ? `Last refresh ${formatTime(lastUpdatedAt)}`
      : "Saved data is ready to use.";
  } else if (!active && message) {
    description = message;
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sky-800">
            {active ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            <p className="text-sm font-semibold">{title}</p>
          </div>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          {message ? <p className="mt-2 text-xs text-slate-500">{message}</p> : null}
        </div>

        <div className="rounded-xl border border-sky-100 bg-white/80 px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Visible now
          </p>
          <p className="text-lg font-bold text-slate-900">
            {loadedCount.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${
            active
              ? "w-2/3 animate-pulse bg-gradient-to-r from-sky-500 via-cyan-400 to-sky-500"
              : "w-full bg-emerald-500"
          }`}
        />
      </div>
    </div>
  );
}

export function ProgressiveTableSkeleton({ rows = 8, columns = 6 }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 p-4">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`table-skeleton-row-${rowIndex}`}
            className="grid gap-3 p-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <div
                key={`table-skeleton-cell-${rowIndex}-${columnIndex}`}
                className="h-4 animate-pulse rounded bg-slate-200"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgressiveCardsSkeleton({ cards = 8 }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={`card-skeleton-${index}`}
          className="overflow-hidden rounded-xl bg-white shadow"
        >
          <div className="h-44 animate-pulse bg-slate-200" />
          <div className="space-y-3 p-4">
            <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
