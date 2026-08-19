# 🏊 Rankings de Natação — Portugal

A website showing the **all‑time top‑10 swimmers per event, for every swimming club in Portugal**.

**Live site:** https://rankingswim.vercel.app

---

## 🤖 About this project (please read)

This project — the code, the data pipeline, the website, and this README — was **built almost entirely with AI** (Anthropic's Claude, via Claude Code), pair‑programmed with the repository owner over a series of conversations. Design decisions, the club list, logos, and the overall product direction are the owner's; the implementation was AI‑generated.

It's a personal, non‑commercial hobby project for the Portuguese swimming community. It is **not affiliated with, endorsed by, or operated by swimrankings.net** or any swimming federation.

---

## What it does

For each Portuguese club you can browse:

- **Top 10 per event**, split by:
  - **Piscina** — Long Course (50 m, LCM) and Short Course (25 m, SCM)
  - **Género** — Masculino / Feminino
  - **Estilo** — Livres, Costas, Bruços, Mariposa, Estilos, plus **Estafetas** (relays) and **Passagens** (individual split times)
- Each entry shows swimmer, birth year, time, FINA points, Rudolph points (LCM only), and the **date + city** of the swim. Meets held abroad are tagged with a country code (e.g. `Gijon (ESP)`).
- 🏆 **Hall of Fame** — a per‑club, per‑gender ranking that aggregates all events of a stroke into a single "best athletes" table (see below), plus an overall ranking across all strokes.
- **Light / dark mode**, club logos (with dark‑mode variants for some), and a searchable club list.

### Hall of Fame scoring

The Hall of Fame combines **both courses (LCM + SCM)** and awards **place‑points** for each event a swimmer appears in the club's top 10: **10 points for 1st, 9 for 2nd … 1 for 10th**. Points are summed per stroke to rank athletes within that stroke, and the five stroke totals are summed for the overall ranking. Ties are broken by average placement, and tied ranks share the same position (e.g. two 1st places). This mirrors a hand‑built spreadsheet the club owner used previously.

---

## Where the data comes from

All data originates from **[swimrankings.net](https://www.swimrankings.net)** — specifically each club's *all‑time* ranking pages, exported as Excel (`.xlsx`) files, one per **club × gender × course**. Each file contains one sheet per event with the club's ranked swimmers.

The rankings only change when a swimmer sets a **new personal best**, so the data evolves slowly — a weekly refresh is more than enough.

---

## How it operates (weekly self‑update)

swimrankings.net is protected by **Cloudflare's interactive Turnstile challenge**. Automated/headless browsers and datacenter IPs (like cloud servers) get blocked, so the data can't be scraped from a normal cloud cron job. The workaround:

> The refresh runs on a **home laptop** (a residential IP that Cloudflare trusts). Instead of launching a browser it can detect, the scraper **attaches to a real Chrome** the user starts, after the user solves the checkbox once. From there it downloads every club's files, parses them, and uploads the result to the cloud.

The weekly cycle:

1. **Windows Task Scheduler** launches `refresh.bat` weekly (with catch‑up if the laptop was off).
2. A debug Chrome opens; the user solves the Cloudflare checkbox **once**.
3. `scrape-cdp.js` attaches to that Chrome and downloads all clubs' Excel files (throttled, with resume + back‑off if swimrankings rate‑limits).
4. `parse.js` turns the Excel files into JSON (top‑10 per event + Hall of Fame).
5. `upload.js` writes everything to **Firestore**.
6. The **website reads from Firestore** and is always online — independent of the laptop.

If some downloads fail (e.g. temporary `502`s), `recover.bat` re‑runs only the missing ones.

---

## Architecture

```
  HOME LAPTOP (weekly, ~1 checkbox)            CLOUD (always on)
  ┌──────────────────────────────┐
  │ scrape-cdp.js  (attach Chrome)│            ┌─────────────┐      ┌──────────────────┐
  │ parse.js       (xlsx → JSON)  │  write     │  Firestore  │ read │  Next.js on       │
  │ upload.js      (→ Firestore)  │ ─────────► │  (database) │ ◄─── │  Vercel           │
  └──────────────────────────────┘            └─────────────┘      │  (static + ISR)   │
        residential IP                                              └──────────────────┘
```

- **Scraper / parser / uploader** — Node.js (Playwright via CDP attach, SheetJS, firebase‑admin).
- **Database** — Cloud Firestore (public read, writes only from the laptop's admin key).
- **Website** — Next.js 14 (App Router) on Vercel. Club pages are **statically pre‑rendered** and all filtering happens **client‑side**, so navigation and filter changes are instant; content refreshes via ISR / redeploys.

---

## Repository layout

```
clubs.json            Configurable club list (id, name, code) — add clubs here
scrape-cdp.js         Downloads swimrankings Excel files via an attached Chrome
parse.js              Excel → JSON (top-10 per event) + Hall of Fame + new-city detector
upload.js             Uploads parsed JSON to Firestore
refresh.bat           Weekly: clear → scrape → parse → upload
recover.bat           Re-download only files that failed, then re-upload
known-cities.json     Ledger of meet cities already seen (to flag new foreign ones)

web/                  Next.js website
  app/                Pages (home, club page + client-side filtering, Hall of Fame)
  lib/cities.js       Foreign meet-city → country code map (IOC codes)
  public/logos/       Club logos, named by club code (<CODE>.png, <CODE>-dark.png)
  scripts/gen-logos-manifest.js   Builds a manifest of available logos
```

### Configuration & secrets (not in the repo)

- `serviceAccountKey.json` — Firebase Admin key, **laptop‑only** (git‑ignored). Used by `upload.js`.
- `web/.env.local` — public Firebase web config for local dev (git‑ignored); the same values live in Vercel's environment variables.

---

## Running it yourself

**Refresh the data** (on the laptop, with Chrome + the debug flag as `refresh.bat` sets up):

```bash
node scrape-cdp.js   # download (resumes; skips files you already have)
node parse.js        # build JSON + Hall of Fame
node upload.js       # push to Firestore
```

**Run the website locally:**

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

**Add a club:** append `{ "id", "name", "code" }` to `clubs.json` (the `id` is the swimrankings `clubId`), then run a refresh.

**Add a logo:** drop `web/public/logos/<CODE>.png` (transparent PNG). Optionally add `<CODE>-dark.png` for a dark‑mode variant. Clubs without a logo fall back to the federation logo, then to a monogram.

---

## Notes & limitations

- The scraping approach depends on swimrankings' current site/Cloudflare behaviour and could break if they change things.
- Meet‑country tagging is a manual lookup (the source data has no country field); the parser flags newly‑seen cities so foreign ones can be added to `web/lib/cities.js`.
- Data freshness is bounded by the weekly cycle and the site's cache — new personal bests appear after the next refresh + revalidation.

## License / usage

Personal, non‑commercial project. Swimming data belongs to swimrankings.net and the respective athletes/clubs; club logos are the property of their clubs.
