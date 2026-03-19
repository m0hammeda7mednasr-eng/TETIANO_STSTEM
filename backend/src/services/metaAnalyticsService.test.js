import { describe, expect, it } from "@jest/globals";

import {
  aggregateMetaSnapshotRows,
  extractActionMetric,
  normalizeAdAccountId,
} from "./metaAnalyticsService.js";

describe("services/metaAnalyticsService", () => {
  it("normalizes numeric ad account ids into Meta account format", () => {
    expect(normalizeAdAccountId("1234567890")).toBe("act_1234567890");
    expect(normalizeAdAccountId("act_987654321")).toBe("act_987654321");
  });

  it("extracts action totals from Meta actions arrays", () => {
    const actions = [
      { action_type: "purchase", value: "2" },
      { action_type: "lead", value: "4" },
      { action_type: "purchase", value: "3" },
    ];

    expect(extractActionMetric(actions, ["purchase"])).toBe(5);
    expect(extractActionMetric(actions, ["lead"])).toBe(4);
  });

  it("aggregates stored snapshot rows into campaign and account summaries", () => {
    const payload = aggregateMetaSnapshotRows([
      {
        account_id: "act_1",
        account_name: "Primary Account",
        campaign_id: "cmp_1",
        campaign_name: "Scale Winners",
        ad_id: "ad_1",
        ad_name: "Creative A",
        date_start: "2026-03-01",
        metrics: {
          spend: 150,
          impressions: 10000,
          reach: 8000,
          clicks: 250,
          inline_link_clicks: 180,
          purchases: 5,
          purchase_value: 900,
          leads: 2,
        },
      },
      {
        account_id: "act_1",
        account_name: "Primary Account",
        campaign_id: "cmp_1",
        campaign_name: "Scale Winners",
        ad_id: "ad_2",
        ad_name: "Creative B",
        date_start: "2026-03-02",
        metrics: {
          spend: 50,
          impressions: 4000,
          reach: 3000,
          clicks: 90,
          inline_link_clicks: 70,
          purchases: 1,
          purchase_value: 180,
          leads: 1,
        },
      },
    ]);

    expect(payload.summary.spend).toBe(200);
    expect(payload.summary.clicks).toBe(340);
    expect(payload.summary.purchases).toBe(6);
    expect(payload.summary.roas).toBeCloseTo(5.4, 4);
    expect(payload.accounts).toHaveLength(1);
    expect(payload.campaigns).toHaveLength(1);
    expect(payload.ads).toHaveLength(2);
    expect(payload.daily).toHaveLength(2);
    expect(payload.campaigns[0].name).toBe("Scale Winners");
    expect(payload.campaigns[0].spend).toBe(200);
  });
});
