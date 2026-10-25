# Supabase workflow

No executable schema SQL exists yet and this scaffold does not contact or modify the project. The owner will create tables in the Supabase SQL Editor after reviewing `docs/database-design.md` and the security design.

For every SQL Editor change, save the exact executed SQL as a numbered, version-controlled file under `supabase/migrations/` in the same change. Record execution order and any rollback notes. Review constraints, RLS policies, private Storage policies and two-user isolation before application writes are enabled. Do not put service-role keys in the frontend or use them for ordinary requests. Local planning notes in `docs/` are ignored by Git.
