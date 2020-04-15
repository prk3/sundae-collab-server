ENV NODE_ENV=production
ENV PORT=8100
ENV LOG

FROM node:12
WORKDIR /usr/src/app

COPY package.json .
RUN npm install

EXPOSE $PORT
CMD npm run server

COPY . .
