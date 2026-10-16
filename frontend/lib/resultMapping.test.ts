import assert from "node:assert/strict";
import { test } from "node:test";
import type { QueryResult } from "./api.ts";
import { mapResult } from "./resultMapping.ts";

// Legacy inputs and the mapResult output captured BEFORE the explicit-chart branch existed.
// A null / absent / unusable chart_spec must keep producing exactly this output.
const NOW = new Date("2026-08-20T12:00:00Z");

const INPUTS = {
  "revparBar": {
    "sql": "select 1",
    "caveat": null,
    "summary": null,
    "chart": "bar",
    "title": "RevPAR by property",
    "rows": [
      {
        "name": "Harbor Inn",
        "revpar": 120.5
      },
      {
        "name": "Alpine Lodge",
        "revpar": 103.25
      },
      {
        "name": "City Suites",
        "revpar": 86
      }
    ]
  },
  "adrRoomsTrend": {
    "sql": "select 1",
    "caveat": null,
    "summary": null,
    "chart": "line",
    "title": "ADR and rooms sold by week",
    "rows": [
      {
        "week": "2026-08-03",
        "name": "Harbor Inn",
        "adr": 150,
        "rooms_sold": 900
      },
      {
        "week": "2026-08-03",
        "name": "Alpine Lodge",
        "adr": 170,
        "rooms_sold": 800
      },
      {
        "week": "2026-08-10",
        "name": "Harbor Inn",
        "adr": 153,
        "rooms_sold": 910
      },
      {
        "week": "2026-08-10",
        "name": "Alpine Lodge",
        "adr": 173,
        "rooms_sold": 810
      },
      {
        "week": "2026-08-17",
        "name": "Harbor Inn",
        "adr": 156,
        "rooms_sold": 920
      },
      {
        "week": "2026-08-17",
        "name": "Alpine Lodge",
        "adr": 176,
        "rooms_sold": 820
      }
    ]
  },
  "revparTrend": {
    "sql": "select 1",
    "caveat": null,
    "summary": null,
    "chart": "line",
    "title": "RevPAR trend",
    "rows": [
      {
        "week": "2026-08-03",
        "name": "Harbor Inn",
        "revpar": 100
      },
      {
        "week": "2026-08-03",
        "name": "Alpine Lodge",
        "revpar": 112
      },
      {
        "week": "2026-08-03",
        "name": "City Suites",
        "revpar": 124
      },
      {
        "week": "2026-08-10",
        "name": "Harbor Inn",
        "revpar": 104
      },
      {
        "week": "2026-08-10",
        "name": "Alpine Lodge",
        "revpar": 116
      },
      {
        "week": "2026-08-10",
        "name": "City Suites",
        "revpar": 128
      },
      {
        "week": "2026-08-17",
        "name": "Harbor Inn",
        "revpar": 108
      },
      {
        "week": "2026-08-17",
        "name": "Alpine Lodge",
        "revpar": 120
      },
      {
        "week": "2026-08-17",
        "name": "City Suites",
        "revpar": 132
      }
    ]
  },
  "dailyLine": {
    "sql": "select 1",
    "caveat": null,
    "summary": null,
    "chart": "line",
    "title": "Revenue last days",
    "rows": [
      {
        "metric_date": "2026-08-01",
        "revenue": 1000
      },
      {
        "metric_date": "2026-08-02",
        "revenue": 1200
      },
      {
        "metric_date": "2026-08-03",
        "revenue": 900
      }
    ]
  },
  "groupedBar": {
    "sql": "select 1",
    "caveat": null,
    "summary": null,
    "chart": "bar",
    "title": "CPOR vs ADR",
    "rows": [
      {
        "name": "Harbor Inn",
        "cpor": 40,
        "adr": 140
      },
      {
        "name": "Alpine Lodge",
        "cpor": 41,
        "adr": 150
      },
      {
        "name": "City Suites",
        "cpor": 42,
        "adr": 160
      }
    ]
  },
  "csatNps": {
    "sql": "select 1",
    "caveat": null,
    "summary": null,
    "chart": "bar",
    "title": "CSAT and NPS",
    "rows": [
      {
        "segment": "business_travel",
        "csat": 4.2,
        "nps": 35
      },
      {
        "segment": "leisure",
        "csat": 4.6,
        "nps": 48
      }
    ]
  },
  "kpi": {
    "sql": "select 1",
    "caveat": null,
    "summary": null,
    "chart": "kpi",
    "title": "Occupancy",
    "rows": [
      {
        "occupancy_pct": 71.4
      }
    ]
  },
  "table": {
    "sql": "select 1",
    "caveat": null,
    "summary": null,
    "chart": "table",
    "title": "Raw",
    "rows": [
      {
        "a": "x",
        "b": "y"
      }
    ]
  }
} as unknown as Record<string, QueryResult>;

const EXPECTED = {
  "revparBar": {
    "headline": "RevPAR by property: Harbor Inn — $120.50",
    "facts": [
      "Harbor Inn leads at $120.50.",
      "City Suites is lowest at $86.00.",
      "Average $103.25; spread $34.50."
    ],
    "charts": [
      {
        "kind": "category",
        "key": "revpar",
        "title": "RevPAR",
        "note": "USD",
        "labels": [
          "Harbor Inn",
          "Alpine Lodge",
          "City Suites"
        ],
        "values": [
          120.5,
          103.25,
          86
        ],
        "color": "revpar",
        "partialLast": false,
        "projection": null,
        "unit": "currency"
      }
    ],
    "pair": null,
    "table": null
  },
  "adrRoomsTrend": {
    "headline": "ADR and rooms sold by week",
    "facts": [
      "Alpine Lodge averaged $173.00 over 3 weeks; Harbor Inn lowest at $153.00."
    ],
    "charts": [],
    "pair": {
      "rate": {
        "kind": "trend",
        "key": "adr",
        "title": "ADR",
        "note": "weekly · USD",
        "unit": "currency",
        "labels": [
          "08/03",
          "08/10",
          "08/17"
        ],
        "series": [
          {
            "name": "Harbor Inn",
            "values": [
              150,
              153,
              156
            ],
            "order": 1,
            "rank": "bottom"
          },
          {
            "name": "Alpine Lodge",
            "values": [
              170,
              173,
              176
            ],
            "order": 0,
            "rank": "top"
          }
        ],
        "reference": null
      },
      "volume": {
        "kind": "trend",
        "key": "rooms_sold",
        "title": "Rooms Sold",
        "note": "weekly · number",
        "unit": "number",
        "labels": [
          "08/03",
          "08/10",
          "08/17"
        ],
        "series": [
          {
            "name": "Harbor Inn",
            "values": [
              900,
              910,
              920
            ],
            "order": 0,
            "rank": "top"
          },
          {
            "name": "Alpine Lodge",
            "values": [
              800,
              810,
              820
            ],
            "order": 1,
            "rank": "bottom"
          }
        ],
        "reference": null
      }
    },
    "table": {
      "columns": [
        "week",
        "name",
        "adr",
        "rooms_sold"
      ],
      "rows": [
        {
          "week": "2026-08-03",
          "name": "Harbor Inn",
          "adr": 150,
          "rooms_sold": 900
        },
        {
          "week": "2026-08-03",
          "name": "Alpine Lodge",
          "adr": 170,
          "rooms_sold": 800
        },
        {
          "week": "2026-08-10",
          "name": "Harbor Inn",
          "adr": 153,
          "rooms_sold": 910
        },
        {
          "week": "2026-08-10",
          "name": "Alpine Lodge",
          "adr": 173,
          "rooms_sold": 810
        },
        {
          "week": "2026-08-17",
          "name": "Harbor Inn",
          "adr": 156,
          "rooms_sold": 920
        },
        {
          "week": "2026-08-17",
          "name": "Alpine Lodge",
          "adr": 176,
          "rooms_sold": 820
        }
      ],
      "groupBy": "week",
      "seriesOrder": {
        "Harbor Inn": 1,
        "Alpine Lodge": 0
      }
    }
  },
  "revparTrend": {
    "headline": "RevPAR trend",
    "facts": [
      "City Suites averaged $128.00 over 3 weeks; Harbor Inn lowest at $104.00."
    ],
    "charts": [
      {
        "kind": "trend",
        "key": "revpar",
        "title": "RevPAR",
        "note": "weekly · USD",
        "unit": "currency",
        "labels": [
          "08/03",
          "08/10",
          "08/17"
        ],
        "series": [
          {
            "name": "Harbor Inn",
            "values": [
              100,
              104,
              108
            ],
            "order": 2,
            "rank": "bottom"
          },
          {
            "name": "Alpine Lodge",
            "values": [
              112,
              116,
              120
            ],
            "order": 1,
            "rank": "mid"
          },
          {
            "name": "City Suites",
            "values": [
              124,
              128,
              132
            ],
            "order": 0,
            "rank": "top"
          }
        ],
        "reference": null
      }
    ],
    "pair": null,
    "table": {
      "columns": [
        "week",
        "name",
        "revpar"
      ],
      "rows": [
        {
          "week": "2026-08-03",
          "name": "Harbor Inn",
          "revpar": 100
        },
        {
          "week": "2026-08-03",
          "name": "Alpine Lodge",
          "revpar": 112
        },
        {
          "week": "2026-08-03",
          "name": "City Suites",
          "revpar": 124
        },
        {
          "week": "2026-08-10",
          "name": "Harbor Inn",
          "revpar": 104
        },
        {
          "week": "2026-08-10",
          "name": "Alpine Lodge",
          "revpar": 116
        },
        {
          "week": "2026-08-10",
          "name": "City Suites",
          "revpar": 128
        },
        {
          "week": "2026-08-17",
          "name": "Harbor Inn",
          "revpar": 108
        },
        {
          "week": "2026-08-17",
          "name": "Alpine Lodge",
          "revpar": 120
        },
        {
          "week": "2026-08-17",
          "name": "City Suites",
          "revpar": 132
        }
      ],
      "groupBy": "week",
      "seriesOrder": {
        "Harbor Inn": 2,
        "Alpine Lodge": 1,
        "City Suites": 0
      }
    }
  },
  "dailyLine": {
    "headline": "Revenue last days",
    "facts": [
      "$1K on 08/01 to $900.00 on 08/03 (-10%).",
      "Peak $1K on 08/02; low $900.00 on 08/03."
    ],
    "charts": [
      {
        "kind": "time",
        "key": "revenue",
        "title": "Revenue",
        "note": "USD",
        "labels": [
          "08/01",
          "08/02",
          "08/03"
        ],
        "values": [
          1000,
          1200,
          900
        ],
        "color": "revenue",
        "partialLast": false,
        "projection": null,
        "unit": "currency"
      }
    ],
    "pair": null,
    "table": null
  },
  "groupedBar": {
    "headline": "CPOR vs ADR",
    "facts": [
      "City Suites leads at $42.00.",
      "City Suites leads at $160.00."
    ],
    "charts": [
      {
        "kind": "grouped",
        "key": "cpor+adr",
        "title": "CPOR vs ADR",
        "note": "USD",
        "unit": "currency",
        "labels": [
          "Harbor Inn",
          "Alpine Lodge",
          "City Suites"
        ],
        "series": [
          {
            "key": "cpor",
            "title": "CPOR",
            "values": [
              40,
              41,
              42
            ],
            "color": "cost"
          },
          {
            "key": "adr",
            "title": "ADR",
            "values": [
              140,
              150,
              160
            ],
            "color": "adr"
          }
        ]
      }
    ],
    "pair": null,
    "table": null
  },
  "csatNps": {
    "headline": "CSAT and NPS",
    "facts": [
      "Leisure leads at 4.6.",
      "Business Travel is lowest at 4.2.",
      "Leisure leads at 48."
    ],
    "charts": [
      {
        "kind": "combo",
        "key": "csat+nps",
        "title": "CSAT and NPS",
        "labels": [
          "Business Travel",
          "Leisure"
        ],
        "bar": {
          "key": "csat",
          "label": "CSAT",
          "values": [
            84,
            92
          ],
          "raw": [
            4.2,
            4.6
          ],
          "color": "guest"
        },
        "line": {
          "key": "nps",
          "label": "NPS",
          "values": [
            35,
            48
          ],
          "color": "market"
        }
      }
    ],
    "pair": null,
    "table": {
      "columns": [
        "segment",
        "csat",
        "nps"
      ],
      "rows": [
        {
          "segment": "business_travel",
          "csat": 4.2,
          "nps": 35
        },
        {
          "segment": "leisure",
          "csat": 4.6,
          "nps": 48
        }
      ]
    }
  },
  "kpi": {
    "headline": "Occupancy: 71.4%",
    "facts": [],
    "charts": [],
    "pair": null,
    "table": null
  },
  "table": {
    "headline": "Raw",
    "facts": [
      "1 rows × 2 columns."
    ],
    "charts": [],
    "pair": null,
    "table": {
      "columns": [
        "a",
        "b"
      ],
      "rows": [
        {
          "a": "x",
          "b": "y"
        }
      ]
    }
  }
} as unknown as Record<string, unknown>;

// JSON round trip drops undefined-valued keys, matching how the fixtures were serialised.
const run = (input: QueryResult) => JSON.parse(JSON.stringify(mapResult(input, NOW)));

for (const name of Object.keys(INPUTS)) {
  test(`legacy ${name}: chart_spec absent is unchanged`, () => {
    assert.deepEqual(run(INPUTS[name]), EXPECTED[name]);
  });

  test(`legacy ${name}: chart_spec null is unchanged`, () => {
    assert.deepEqual(run({ ...INPUTS[name], chart_spec: null }), EXPECTED[name]);
  });

  test(`legacy ${name}: unusable chart_spec falls through to legacy output`, () => {
    const bad = { x: "no_such_column", y: ["also_missing"] };
    assert.deepEqual(run({ ...INPUTS[name], chart_spec: bad }), EXPECTED[name]);
  });
}
