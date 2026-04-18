const TRUE_QUERY_FLAGS = new Set(["1", "true", "yes", "on"]);
const FALSE_QUERY_FLAGS = new Set(["0", "false", "no", "off"]);

export const toBooleanQueryFlag = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (TRUE_QUERY_FLAGS.has(normalized)) {
    return true;
  }

  if (FALSE_QUERY_FLAGS.has(normalized)) {
    return false;
  }

  return fallback;
};

export const partitionWarehouseStockRows = (
  rows = [],
  { includeArchived = false } = {},
) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const archivedRows = normalizedRows.filter((row) => Boolean(row?.is_archived));

  return {
    visibleRows: includeArchived
      ? normalizedRows
      : normalizedRows.filter((row) => !Boolean(row?.is_archived)),
    archivedRowsTotal: archivedRows.length,
    archivedRowsHidden: includeArchived ? 0 : archivedRows.length,
  };
};
