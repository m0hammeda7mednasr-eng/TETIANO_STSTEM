import { describe, expect, it } from "@jest/globals";

import {
  partitionWarehouseStockRows,
  toBooleanQueryFlag,
} from "./warehouseStock.js";

describe("helpers/warehouseStock", () => {
  it("hides archived warehouse rows by default", () => {
    const result = partitionWarehouseStockRows([
      { id: "active-1", is_archived: false },
      { id: "archived-1", is_archived: true },
      { id: "active-2" },
    ]);

    expect(result.visibleRows.map((row) => row.id)).toEqual(["active-1", "active-2"]);
    expect(result.archivedRowsTotal).toBe(1);
    expect(result.archivedRowsHidden).toBe(1);
  });

  it("keeps archived rows visible when explicitly requested", () => {
    const result = partitionWarehouseStockRows(
      [
        { id: "active-1", is_archived: false },
        { id: "archived-1", is_archived: true },
      ],
      { includeArchived: true },
    );

    expect(result.visibleRows.map((row) => row.id)).toEqual([
      "active-1",
      "archived-1",
    ]);
    expect(result.archivedRowsTotal).toBe(1);
    expect(result.archivedRowsHidden).toBe(0);
  });

  it("parses boolean query flags safely", () => {
    expect(toBooleanQueryFlag("true")).toBe(true);
    expect(toBooleanQueryFlag("1")).toBe(true);
    expect(toBooleanQueryFlag("off", true)).toBe(false);
    expect(toBooleanQueryFlag(undefined, true)).toBe(true);
    expect(toBooleanQueryFlag("unexpected", false)).toBe(false);
  });
});
