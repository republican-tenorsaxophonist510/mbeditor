FROM python:3.11-slim

WORKDIR /app

# CJK fonts first — needed for Playwright/Chromium to render Chinese <text>
# inside user-supplied SVGs during publish-time rasterization. Installed in
# its own layer so Playwright updates don't re-pull fonts.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium + its apt-level runtime deps for headless SVG rasterization.
# Kept separate from the code COPY so a requirements.txt bump invalidates
# this layer but an app-code change does not.
RUN playwright install --with-deps chromium

COPY . .

RUN chmod +x entrypoint.sh

CMD ["./entrypoint.sh"]
