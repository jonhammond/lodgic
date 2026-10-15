---
name: fn-deploy
description: Deploy the text-to-sql Edge Function to production Supabase and print the new version. Manual invocation only.
disable-model-invocation: true
---

1. Run `supabase functions deploy text-to-sql`.
2. Run `supabase functions list` and report the new version.
3. Remind: secrets are unchanged by deploy (`supabase secrets set` is separate).
4. Prompt the user to smoke-test the frontend at lodgic.jonhammond.org.
