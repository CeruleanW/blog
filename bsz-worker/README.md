# Self-hosted view counter (busuanzi-compatible)

A drop-in replacement for the busuanzi service (busuanzi.ibruce.info), which
began failing with 502s. Runs on Cloudflare Workers + D1 — both permanently
free at this scale, no payment method required, and all code/data stay yours.

## What it provides

- `GET /busuanzi` — JSONP API identical to busuanzi's contract:
  `BusuanziCallback_<rand>({"site_pv":…, "page_pv":…, "site_uv":…})`
- `GET /busuanzi.pure.mini.js` — the busuanzi client script, rewritten so it
  calls this Worker instead of ibruce.info.

The NexT theme keeps rendering 阅读次数 / site counters exactly as with the
original busuanzi (`busuanzi_count` config stays enabled); only the script
URL changes via `vendors.busuanzi` in `_config.next.yml`.

## Setup (Cloudflare dashboard, ~15 minutes, no CLI)

1. **Create a free Cloudflare account** (no card needed).
2. **Workers & Pages → Create → Worker** — name it e.g. `bsz`, choose "Hello
   World", then Edit code: replace everything with the contents of
   `worker.js` and Deploy. Note your URL:
   `https://bsz.<your-subdomain>.workers.dev`.
3. **Storage & Databases → D1 → Create database** — name it e.g. `bsz`.
   Open it → **Console** → paste the contents of `schema.sql` → Run.
4. Bind the database: Worker `bsz` → **Settings → Bindings → Add → D1**,
   variable name exactly `DB`, and select the database from step 3.
5. (Recommended) Settings → Variables → add secret `SALT` with any random
   string (used to hash visitor IPs).

## Wire it into the blog

Once the Worker URL works (test: open `/busuanzi.pure.mini.js` in a browser —
you should see JavaScript), set in `_config.next.yml`:

```yml
vendors:
  busuanzi: https://bsz.<your-subdomain>.workers.dev/busuanzi.pure.mini.js
```

then `hexo clean && hexo g && hexo deploy` as usual.

## Notes

- Free limits: Workers 100,000 requests/day, D1 ~100,000 writes/day — orders
  of magnitude beyond a personal blog.
- `workers.dev` domains are DNS-polluted in mainland China. If most of your
  readers are in mainland China and you own a domain, add the domain to
  Cloudflare and bind it to the Worker (Workers → Settings → Domains & Routes)
  for reliable access; the `vendors.busuanzi` URL would then use that domain.
- Data model: `pv` (per-path counts, keyed by URL path), `site` (site total),
  `uv` (unique visitors, IP hashes only). Back it up anytime with
  `d1 export` or by querying the tables.
