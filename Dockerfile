# Use Node.js 20 LTS
FROM node:20-alpine

# Set working directory to backend
WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install --production

# Copy backend source code
COPY backend/ ./

# Expose port
EXPOSE 5000

# Start the application (no cd needed since we're already in /app/backend)
CMD ["npm", "start"]