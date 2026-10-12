# Garage Planner — demo

## Files to upload to private GitHub repo
Upload `index.html`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png` at repository root. `supabase_setup.sql` and this README are setup instructions, not needed on public website.

## Preview without Supabase
Open deployed site. It loads sample appointments in localStorage. Use the role selector in the blue demo banner to preview owner and each master's view. These roles are ONLY a local preview; there is no shared data until Supabase is connected.

## Connect Supabase (separate project)
1. Create a NEW Supabase project, not the existing customer's database.
2. SQL Editor: run `supabase_setup.sql` on this new project.
3. Authentication > Users: create 4 confirmed test users (owner, 3 masters).
4. Run SQL Editor for each user (replace email and role):

```sql
insert into public.profiles (id,role)
select id,'owner' from auth.users where email='owner@example.com'
on conflict (id) do update set role=excluded.role;
```

Use roles `owner`, `alex`, `ivan`, `sergey` for other users. The exact email must match the Auth user. Do not give unassigned accounts access.
5. In `index.html`, set `CONFIG.SUPABASE_URL` and `CONFIG.SUPABASE_ANON_KEY` to Project URL and publishable key, set `DEMO_MODE:false`.
6. Deploy and sign in with each account. Owner can see all; masters only their own records (enforced by database RLS). Verify on two devices.

## Hosting
For private GitHub repo: Cloudflare Pages > Connect to Git > choose private repository; framework None, no build command, output directory `/` (or `.` if requested). Public Pages URL is HTTPS and PWA-capable. A private repository does NOT hide browser-delivered JavaScript.

## Important limitations
- The app has no automatic SMS, email or push alerts to customers. The 'Changes' list is local in-app feedback, not a durable notification feed.
- Realtime requires internet; no offline queue for edits.
- Week view shows each day with master assignments; it is not an hour-by-hour drag/drop Gantt chart. It warns about overlapping working intervals.
- Service stay (`service_end`) and actual master's booked time (`start_at`–`end_at`) are separate.
- Demo local mode does not simulate real authentication. Actual roles require Supabase and the profiles table.
- Do not put `service_role` keys in HTML.
- Test with sample records only, not real customer personal data.
