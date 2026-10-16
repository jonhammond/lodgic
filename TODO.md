# TODO

- [ ] prompt-regress: "RevPAR vs occupancy" baseline is kpi (occupancy_pct, revpar); the prompt now returns bar (name, avg_occupancy, avg_revpar). The UI never sends this question to Gemini (chip bypasses via isRevparOccQuestion). Decide: re-record with --record and commit baseline.json, or drop the preset from the regress list.
