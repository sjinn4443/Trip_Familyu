FROM node:22-alpine
WORKDIR /app
COPY package.json server.cjs ./
COPY lib ./lib
COPY public ./public
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
CMD ["npm", "start"]
