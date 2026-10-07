FROM node:22-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY server.js ./
COPY public ./public
ENV HOST=0.0.0.0 PORT=4400
EXPOSE 4400
CMD ["node", "server.js"]
