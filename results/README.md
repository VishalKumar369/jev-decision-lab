# results/

Generated output. Gitignored except this file and `.gitkeep`.

- `benchmark-<experiment>-<provider>-<stamp>.json` — `{ meta, summary, records, traces }` from `npm run bench` or the UI's "Run whole dataset"
- `benchmark-…csv` — `records` only, one row per (example, question)
- `ui-runs.jsonl` — every single pipeline run from the UI
- `calibration-<stamp>.{json,csv}`, `latency-<stamp>.json`, `cost-<stamp>.json`

Delete anything here freely; `npm run bench` regenerates it.
