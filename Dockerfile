FROM node:22-alpine

WORKDIR /app


COPY package*.json ./
RUN npm install
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

ENV VAULT_PATH=/vault
ENV STATE_DIR=/state

ENTRYPOINT ["node", "dist/index.js"]
CMD ["--watch", "all"]
