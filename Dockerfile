FROM node:22-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY server.js ./
COPY lib ./lib
COPY public ./public
ENV HOST=0.0.0.0 PORT=4400 AGENT_MONITOR_CONFIG=/config/config.json
EXPOSE 4400
CMD ["node", "server.js"]
