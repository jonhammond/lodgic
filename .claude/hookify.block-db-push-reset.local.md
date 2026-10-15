---
name: block-db-push-reset
enabled: true
event: bash
pattern: supabase\s+db\s+(push|reset)
action: block
---

**Blocked: `supabase db push` / `supabase db reset`** (AGENTS.md Never list).

Use `supabase migration up` locally; production only via MCP `apply_migration` after explicit user confirmation.
