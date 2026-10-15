# Reduce session-start context baseline (~10%)

## Context
Every new session in `lodgic` starts ~10% full before any work. The baseline is not the code; it is global plugins/MCP servers/skills that are enabled for all projects, plus memory dumps. This project needs Supabase, Vercel (deploy only), Expo (rarely), chrome-devtools (chart QA). It does not need dart, Microsoft Learn, Claude Docs, agent-sdk-dev, mcp-server-dev, codex, ralph-loop, security plugins, etc.

## Measured baseline contributors (largest first)
1. **Deferred tool name list** (~450 names): Vercel MCP ≈300, Expo ≈70, chrome-devtools ≈30, serena ≈25, dart ≈15, Claude Docs, MS Learn. Names only, but ≈4–6k tokens.
2. **Skills listing** (~110 skills with descriptions): vercel (≈40), expo (≈25), superpowers (≈15), codebase-memory, anthropic-skills, chrome-devtools, etc. ≈5–7k tokens.
3. **MCP server instruction blocks**: Vercel, Supabase, Claude Docs, dart, MS Learn, serena. ≈1.5k tokens.
4. **superpowers `using-superpowers` full skill text** injected at SessionStart. ≈1.2k tokens.
5. **remember plugin memory dump** (`.remember/today-*.md`, `now.md`, `recent.md`; ≈10 KB today). ≈2.5–3k tokens, grows daily.
6. **Agent list** (~30 agent types incl. 12 claude-security agents, vercel ×3, agent-sdk-dev ×2). ≈1.5k tokens.
7. **CLAUDE.md chain** (global + QMD + RTK + model-handoff + project CLAUDE.md + AGENTS.md ≈13 KB) ≈3.5k tokens. Mostly needed; model-handoff.md (4.9 KB) is the fat one.
8. Serena instruction nag + `initial_instructions` read if followed (≈2–4k on first call).

## Plan (all config, no code)

### A. ✅ DONE 2026-10-15 — Project-scoped MCP disables (`/mcp` in this project → persist in `.claude/settings.local.json` / project state)
Disable for lodgic: `dart`, `claude.ai Microsoft Learn`, `claude.ai Claude Docs`, `serena` (unless actively used — it costs tools + instructions + hooks), `plugin:expo:expo` (keep plugin skills if wanted; disable MCP server only when not doing EAS work).
Keep: `supabase`, `vercel` (optional: disable and use `vercel` CLI; Vercel is the single biggest tool-name cost), `chrome-devtools`.

### B. ✅ DONE 2026-10-15 (superpowers left on) — Global plugin trims (`~/.claude/settings.json` → `enabledPlugins`)
Set to `false`: `agent-sdk-dev`, `mcp-server-dev`, `claude-security`, `codex`, `ralph-loop`, `claude-code-setup`, `skill-creator`, `hookify` (rules already written; re-enable to edit). Project settings already turn off agent-sdk-dev/mcp-server-dev, but the global list still loads skill/agent descriptions.
Consider: `superpowers` → off for low-effort polishing sessions (removes the SessionStart injection, ~15 skills, brainstorming gate). Re-enable per project via `.claude/settings.json` when planning big features.

### C. ✅ DONE 2026-10-15 — remember plugin
`/remember:doctor` healthy. Added `.remember/config.json` (self-gitignored): `thresholds.memory_inject_max_bytes: 1024` → every memory file >1 KB is named, not injected (SessionStart payload 13.1 KB → 0.9 KB); `prompt_stamp: stable` drops the per-turn clock/context% line. Capture + consolidation unchanged; `grep .remember/` on demand. Plugin has no dedicated injection-off switch; the "store is broken, run doctor" footer it prints is a false alarm caused by this cap.
- Rotate/trim: `.remember/today-*.done.md` already excluded; `today-2026-10-15.md` (4.9 KB) is injected in full. Run `/remember:doctor`, set shorter daily window or disable auto-injection; rely on `grep .remember/` on demand.
- Alternative: disable `remember` for this project and keep `.claude/memory/` (built-in) which is index-only.

### D. ✅ DONE 2026-10-15 — CLAUDE.md chain
- `~/.claude/rules/model-handoff.md` 4.9 KB → 1.1 KB summary table; full prose moved to `~/.claude/skills/model-handoff/SKILL.md` (load via `/model-handoff` before dispatching subagents).
- `AGENTS.md`: kept.
- `@~/.claude/QMD.md` import removed from global CLAUDE.md: `qmd status` shows only CMSDemo/OneGuide collections, 246 days stale, nothing for lodgic. File kept on disk; re-add the import after `qmd collection add` for this repo.

### E. Session hygiene
- `/compact` with protect list before switching tasks; `/clear` on task boundaries (CLAUDE.md already mandates the prompt).
- Keep `/effort low` for polish work; dispatch exploration to `scout`/Haiku.

## Expected result
Baseline drops from ~10% to ~4–5%: removing Vercel+Expo+dart+MS Learn+Docs tool names and ~60 skill descriptions is the bulk; remember dump and model-handoff trim the rest.

## Verification
Start a new session in lodgic, run `/context` (or `/cost`) before the first prompt; compare against ~10%. Re-run after each step A→D to attribute savings.
