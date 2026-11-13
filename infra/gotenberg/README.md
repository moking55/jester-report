# Jester Gotenberg image

Base: `gotenberg/gotenberg:9.4.1` pinned by digest. Adds TH Sarabun New as a system font because Chromium
header/footer templates ignore `@font-face` (spike M0 finding).

```bash
docker build -t jester/gotenberg:9.4.1-th1 infra/gotenberg
docker run -d --name gotenberg -p 127.0.0.1:3000:3000 jester/gotenberg:9.4.1-th1 \
  gotenberg --chromium-auto-start=true --chromium-start-timeout=60s
```

Fonts: see `fonts/THSarabunNew-LICENSE.txt` (GPL v2 or later with font exception).
