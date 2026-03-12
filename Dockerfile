# Use Node.js 20 LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm install --production

# Copy backend source code
COPY backend/ ./

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]