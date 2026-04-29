# ANC-branded Baserow overlay.
#
# Extends the stock all-in-one image and replaces brand assets + locale
# strings so the running UI says "ANC Operations" instead of "Baserow"
# and uses our logo. MIT license — fully legal to ship modifications.
#
# Build:
#   docker build -t anc-baserow:latest deploy/baserow
#
# Run:
#   Same env as the stock compose, just swap the image name to
#   anc-baserow:latest in docker-compose.easypanel.yml.
#
# Note: the asset paths inside the all-in-one image are stable across
# Baserow point releases but may shift on a major version bump. If a
# Baserow upgrade breaks the brand replacements, re-inspect the paths
# under /baserow/web-frontend/.nuxt/dist/client/static/img/ and update
# the COPY targets below.

FROM baserow/baserow:latest

USER root

# 1. Replace the static logo files served by the frontend.
#    Stock paths in the Nuxt build:
#      /baserow/web-frontend/.nuxt/dist/client/static/img/logo.svg
#      /baserow/web-frontend/.nuxt/dist/client/static/img/logo-white.svg
#      /baserow/web-frontend/.nuxt/dist/client/static/img/baserow-icon.svg
#      /baserow/web-frontend/modules/core/static/img/logoOnly.svg
COPY assets/logo.svg /baserow/web-frontend/.nuxt/dist/client/static/img/logo.svg
COPY assets/logo.svg /baserow/web-frontend/.nuxt/dist/client/static/img/logo-white.svg
COPY assets/logo-icon.svg /baserow/web-frontend/.nuxt/dist/client/static/img/baserow-icon.svg
COPY assets/logo-icon.svg /baserow/web-frontend/modules/core/static/img/logoOnly.svg
COPY assets/logo.svg /baserow/web-frontend/modules/core/static/img/logo.svg
COPY assets/logo.svg /baserow/web-frontend/modules/core/static/img/logo-white.svg

# 2. Rewrite "Baserow" → "ANC Operations" inside the locale + HTML files
#    that ship the brand name. Keep the "@baserow/" import paths intact so
#    the build doesn't break — only swap the displayed text.
RUN find /baserow/web-frontend/.nuxt/dist/client/static -type f \( -name "*.html" -o -name "*.json" \) \
    -exec sed -i 's/Baserow/ANC Operations/g' {} + ; \
    find /baserow/web-frontend/modules -type f -name "*.json" -path "*/locales/*" \
    -exec sed -i 's/Baserow/ANC Operations/g' {} + || true

# 3. Drop in custom CSS to hide the upgrade nags and recolor the primary brand
#    color to ANC blue (#0A52EF). Mounted as a stylesheet the frontend serves.
COPY assets/anc-overrides.css /baserow/web-frontend/.nuxt/dist/client/static/anc-overrides.css

USER baserow_docker_user
