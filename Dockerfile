FROM node:24-alpine
WORKDIR /app
COPY server.mjs sync-store.mjs ./
COPY public ./public
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.mjs"]
