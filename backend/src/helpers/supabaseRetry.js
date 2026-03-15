const TRANSIENT_SUPABASE_ERROR_CODES = new Set([
  "PGRST000",
  "PGRST001",
  "PGRST002",
  "PGRST003",
  "ETIMEDOUT",
  "ECONNRESET",
]);

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const isTransientSupabaseError = (error) => {
  if (!error) {
    return false;
  }

  const code = String(error.code || "").trim().toUpperCase();
  if (TRANSIENT_SUPABASE_ERROR_CODES.has(code)) {
    return true;
  }

  const text =
    `${error.message || ""} ${error.details || ""} ${error.hint || ""}`
      .toLowerCase();

  return (
    text.includes("schema cache") ||
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("connection terminated") ||
    text.includes("connection reset")
  );
};

export const withSupabaseRetry = async (
  operation,
  { attempts = 3, baseDelayMs = 250 } = {},
) => {
  let lastResult = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await operation();
    lastResult = result;

    if (!result?.error) {
      return result;
    }

    if (!isTransientSupabaseError(result.error) || attempt === attempts) {
      return result;
    }

    await sleep(baseDelayMs * attempt);
  }

  return lastResult;
};
