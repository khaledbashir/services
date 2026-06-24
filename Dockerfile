FROM node:20-alpine

WORKDIR /app

# Install Python and required system packages (poppler-utils=pdftoppm/pdfinfo, ghostscript=gs for OCR PDF->image)
RUN apk add --no-cache python3 py3-pip postgresql-client poppler-utils ghostscript

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy app source
ARG SOURCE_CACHE_BUST=2026-05-06-ai-panel-navigation
COPY . .

# Build Next.js app
RUN npm run build

# Copy scripts and config (already copied by COPY . . above, but explicit for clarity)
COPY scripts/ ./scripts/
COPY claw-config.json ./

# Install Python dependencies with --break-system-packages
RUN pip3 install --break-system-packages google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client psycopg2-binary

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]
