---
name: warn-sql-guard-edit
enabled: true
event: file
action: warn
conditions:
  - field: file_path
    operator: regex_match
    pattern: sql_guard\.ts|schema_prompt\.ts|run_hotel_analytics
---

Security/prompt-critical file edited. Run /prompt-regress and dispatch sql-guard-reviewer before committing.
