FROM node:22-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000 DATA_DIR=/app/data ALLOWED_FILE=/app/allowed.txt
EXPOSE 3000
CMD ["npm", "start"]
