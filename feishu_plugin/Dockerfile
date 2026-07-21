FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

ENV NODE_ENV=production

EXPOSE 9090

CMD ["node", "dist/main.js"]
