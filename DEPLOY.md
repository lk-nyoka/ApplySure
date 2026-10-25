# Deploying ApplySure

## Hackathon quick deploy (free: Vercel + Render), about 20 minutes

Judges must open the app from their own devices, so it has to be online. Do these in order. You need the code on
GitHub first, and a free account on [Render](https://render.com) and [Vercel](https://vercel.com). Sign in to both with GitHub.

1. **API on Render.** Dashboard → **New → Blueprint** → choose the ApplySure repo. Render reads `render.yaml`. When it asks:
   - `SUPABASE_URL`: your project root URL (`https://<id>.supabase.co`, the same as in `backend/.env`);
   - `CORS_ORIGINS`: type `https://applysure.vercel.app` for now and correct it after step 2.

   Click **Apply** and wait for "Live", which takes about 10 minutes the first time. Open `https://applysure-api.onrender.com/health`; it should say `{"status":"ok"}`.
   If Render gave the service a different address, put that address in `frontend/vercel.json` (the `/api/:path*` rewrite) and push.
2. **Website on Vercel.** **Add New → Project** → import the repo.
   - **Root Directory:** `frontend`. The framework is detected as Vite.
   - **Environment variables:** `VITE_SUPABASE_URL` (same URL) and `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable key from `frontend/.env`).
   - Click **Deploy**. Copy the address it gives you. If it isn't `https://applysure.vercel.app`, update `CORS_ORIGINS` on Render (Environment tab) to that exact address.
3. **Supabase sign-in links.** Authentication → **URL Configuration**:
   - set **Site URL** to the Vercel address;
   - add `https://<your-vercel-address>/**` under Redirect URLs.
4. **Judges' demo account.** Authentication → **Users → Add user → Create new user**:
   - email such as `judges@applysure.app`, a strong password, and tick **Auto Confirm User**;
   - sign in on the live site as that user, finish the three-tap setup, run one check and press **Save to my applications**, so judges land on a populated app;
   - put the link, email and password on the deck's "Demo account" slide.
5. **Keep it awake for judging.** The free API sleeps after 15 idle minutes, and the first visit then waits about a minute. The site already wakes it when a page opens. For a smoother experience, add a free monitor at [UptimeRobot](https://uptimerobot.com) that opens `https://<your-vercel-address>/api/health` every 5 minutes.
6. **Smoke test** on your phone, signed in as the demo user:
   - the bursaries load;
   - a bursary opens;
   - a check runs;
   - a PDF upload returns findings;
   - Profile → Download my data works.

**Known trade-off on the free tier:** Render's free 512 MB can't also run the ClamAV virus scanner, so `render.yaml` runs the API in `ENVIRONMENT=demo` with `ALLOW_UNSCANNED_UPLOADS=true`. Files are still only read in memory, never stored or shown to anyone else, and PDF and photo reading run in isolated, time-limited processes. For real users, use the full setup below with ClamAV, where `ENVIRONMENT=production` refuses unscanned uploads.

---

The full setup has three parts: the database (Supabase), the API with its malware scanner (Docker), and the web app (Vercel).

## 1. Database: Supabase

1. In the Supabase dashboard, open **SQL Editor** and run `supabase/migrations/0001_applications_and_saved.sql`. It is safe to run twice.
2. Under **Project Settings → JWT Keys**, make sure the project uses asymmetric signing keys. The API rejects legacy shared-secret tokens.
3. Under **Authentication → URL Configuration**, set the site URL to the web app's address and add `https://<your-web-domain>/**` as a redirect URL.
4. Under **Authentication → Providers → Email**, keep **Confirm email** on. Under **Authentication → Policies**, set a minimum password length of 8 or more, and turn on leaked-password protection if your plan has it.
5. **Check isolation:** sign up two test users. Save an application with one, then confirm the other sees nothing. RLS is what guarantees this.

Until step 1 is done, the app still works, but applications and saved bursaries last only for the browser tab, and the app says so.

## 2. API and malware scanner: Docker

`docker-compose.yml` runs the API together with ClamAV:

```sh
cp backend/.env.example backend/.env   # set SUPABASE_URL and CORS_ORIGINS=https://<your-web-domain>
docker compose up --build -d
curl http://localhost:8000/health/ready   # {"status":"ready"} once ClamAV has loaded its signatures
```

On a container host (Render, Fly.io, Railway, a VM):

- Build `backend/Dockerfile`, which runs as an unprivileged user with `ENVIRONMENT=production`.
- Run `clamav/clamav` alongside it and set `CLAMAV_HOST` to its address.
- Point the load balancer's health check at `/health/ready`. It reports not ready while the scanner is unreachable, so uploads are never accepted unscanned.
- Give the container at least 2 GB of memory. OCR and ClamAV both need it.
- Terminate TLS at the host. The API sends HSTS and expects HTTPS.

In production the API refuses to start if `ALLOW_UNSCANNED_UPLOADS=true`, and the API docs (`/docs`, `/openapi.json`) are switched off.

## 3. Web app: Vercel

Project root `frontend`, build command `npm run build`, output directory `dist`. Set these environment variables:

- `VITE_SUPABASE_URL`: the project root URL, such as `https://abcd.supabase.co`, not `/rest/v1/`.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable (anon) key. Never use the service-role key here.

**Route `/api` to the API.** Add this as the first entry in `rewrites` in `frontend/vercel.json`, using your API's address:

```json
{ "source": "/api/:path*", "destination": "https://<your-api-host>/api/:path*" }
```

The browser then talks to one origin, so the CSP and CORS need no changes. Without this rewrite, `/api` returns a 404 and the app shows "We could not reach the ApplySure service".

## 4. Bursary data

```sh
cd backend
python -m app.ingest --closing --limit 40          # bursaries closing in the next few months
python -m app.ingest --faculty engineering --limit 10
python -m app.review list                          # drafts waiting for a person
python -m app.review approve <id>                  # after checking it against the source page
```

Ingestion uses free-tier AI when available (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`). When every provider is out of quota, it falls back to reading the page layout. Closed bursaries are skipped. Commit `backend/data/ingested.json`, or mount it as a volume as in `docker-compose.yml`, so deployments have the data.

## Before going public

- [x] Support email set in `frontend/src/lib/brand.ts`. Name an information officer (by default, the person who runs the service).
- [ ] Have the privacy notice and terms (`frontend/src/pages/LegalPages.tsx`) reviewed for POPIA.
- [ ] Sign a data processing agreement with Supabase, and choose a South African or EU region if you can.
- [ ] Review the bursary drafts (`python -m app.review list`) or show them only with their "not reviewed" label.
- [ ] Rotate any API keys that have ever been shared outside `backend/.env`.
- [ ] Send the API's stdout logs (request IDs, no personal data) to your host's log service, and alert on 5xx errors.
