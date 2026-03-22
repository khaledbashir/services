FROM node:20-alpine

WORKDIR /app

# Install Python and required system packages
RUN apk add --no-cache python3 py3-pip postgresql-client

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy app source
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
