FROM node:20-alpine

WORKDIR /app

# Copy root configuration and package files
COPY package*.json ./
COPY tsconfig.json ./
COPY jest.config.json ./
COPY .eslintrc.json ./

# Copy all packages and apps
COPY packages ./packages
COPY apps ./apps

# Install dependencies
RUN npm ci

EXPOSE 6713

# Start the Vite dev server with HMR enabled
CMD ["npm", "run", "dev", "--workspace=apps/web"]
