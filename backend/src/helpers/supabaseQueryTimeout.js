const DEFAULT_SUPABASE_QUERY_TIMEOUT_MS = Math.max(
  500,
  Number(process.env.SUPABASE_QUERY_TIMEOUT_MS) || 5000,
);

export const createSupabaseQueryTimeoutError = (
  timeoutMs = DEFAULT_SUPABASE_QUERY_TIMEOUT_MS,
  code = "SUPABASE_QUERY_TIMEOUT",
) => {
  const error = new Error(`Supabase query timed out after ${timeoutMs}ms`);
  error.code = code;
  error.details = null;
  error.hint = null;
  return error;
};

export const isSupabaseQueryTimeoutError = (error) => {
  if (!error) return false;
  const code = String(error.code || "").trim().toUpperCase();
  if (code.endsWith("_QUERY_TIMEOUT") || code === "SUPABASE_QUERY_TIMEOUT") {
    return true;
  }

  const message =
    `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return message.includes("supabase query timed out");
};

export const runSupabaseQueryWithTimeout = async (
  query,
  {
    timeoutMs = DEFAULT_SUPABASE_QUERY_TIMEOUT_MS,
    code = "SUPABASE_QUERY_TIMEOUT",
  } = {},
) => {
  if (!query || typeof query.then !== "function") {
    return await query;
  }

  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const executable =
    controller && typeof query.abortSignal === "function"
      ? query.abortSignal(controller.signal)
      : query;

  let timeoutId = null;
  let timedOut = false;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      if (controller) {
        controller.abort();
      }

      resolve({
        data: null,
        error: createSupabaseQueryTimeoutError(timeoutMs, code),
      });
    }, timeoutMs);
  });

  const queryPromise = Promise.resolve(executable).catch((error) => ({
    data: null,
    error: timedOut ? createSupabaseQueryTimeoutError(timeoutMs, code) : error,
  }));

  try {
    return await Promise.race([queryPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};
