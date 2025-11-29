FROM node:20

# Where the app lives inside the container
WORKDIR /app

# Production environment
ENV NODE_ENV=production

# 1. Copy package files
COPY package.json package-lock.json ./

# 2. Install dependencies
RUN npm install --omit=dev

# 3. Copy the rest of the source code
COPY . .

# Use a separate volume for SQLite data
RUN mkdir -p /data
VOLUME ["/data"]
ENV DATABASE_URL="file:///data/sqlite.db"

# Port the app listens on
EXPOSE 3000

# Start the application (expects "start": "node server.js" in package.json)
CMD ["npm", "run", "start"]
