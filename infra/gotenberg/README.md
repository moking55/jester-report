# Jester Gotenberg image

Base: `gotenberg/gotenberg:9.4.1` pinned by digest. Adds TH Sarabun New as a system font because Chromium
header/footer templates ignore `@font-face` (spike M0 finding).

```bash
docker build -t jester/gotenberg:9.4.1-th1 infra/gotenberg
docker run -d --name gotenberg --restart unless-stopped -p 127.0.0.1:3000:3000 jester/gotenberg:9.4.1-th1 \
  gotenberg --api-start-timeout=90s --chromium-auto-start=true --chromium-start-timeout=60s \
  --chromium-disable-javascript=true '--chromium-allow-list=^file:///tmp/.*' \
  --chromium-deny-private-ips=true --chromium-deny-public-ips=true
```

Why each flag (SPEC-binder.md "ชั้นป้องกันที่ engine"; verified in spike M0 round 3):

- `--chromium-auto-start` / `--chromium-start-timeout=60s`: Chromium cold start takes more than 20 s on a small VM.
- `--api-start-timeout=90s`: the API waits for Chromium; the default 30 s made the container exit.
- `--chromium-disable-javascript`: templates have no JavaScript in v1; page numbers, repeated table
  headers and page breaks still work (they are CSS and Chromium's own header/footer).
- `--chromium-allow-list=^file:///tmp/.*` + deny private/public IPs: Chromium may load only the files sent
  in the request. A blocked URL does **not** fail the render (the image is simply missing), so `binder`
  still rejects such resources first and gives the user a clear problem.

Fallback if a future version breaks page numbers with JavaScript off: drop `--chromium-disable-javascript`
and keep the allow-list and IP flags.

Fonts: see `fonts/THSarabunNew-LICENSE.txt` (GPL v2 or later with font exception).
