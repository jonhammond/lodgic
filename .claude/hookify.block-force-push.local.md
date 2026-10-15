---
name: block-force-push
enabled: true
event: bash
pattern: git\s+push\b.*(\s-f\b|--force)
action: block
---

**Blocked: force push** (AGENTS.md Never list). Never force push to main.
