import { extractArray } from "./response";

const getPaginationMeta = (payload) => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  if (payload.pagination && typeof payload.pagination === "object") {
    return payload.pagination;
  }

  if (payload.data && typeof payload.data === "object") {
    return payload.data.pagination || {};
  }

  return {};
};

export const fetchAllPages = async (
  requestPage,
  { limit = 200, maxPages = 500 } = {},
) => {
  const rows = [];
  let offset = 0;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const response = await requestPage({ limit, offset, pageIndex });
    const payload = response?.data;
    const batch = extractArray(payload);
    const pagination = getPaginationMeta(payload);

    rows.push(...batch);

    if (batch.length === 0) {
      break;
    }

    const hasMore =
      typeof pagination.has_more === "boolean"
        ? pagination.has_more
        : batch.length === limit;

    if (!hasMore) {
      break;
    }

    offset =
      typeof pagination.next_offset === "number"
        ? pagination.next_offset
        : offset + batch.length;
  }

  return rows;
};
