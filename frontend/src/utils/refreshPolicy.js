export const MANUAL_REFRESH_ONLY = true;
export const HEAVY_VIEW_CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export const shouldAutoRefreshView = () => !MANUAL_REFRESH_ONLY;
