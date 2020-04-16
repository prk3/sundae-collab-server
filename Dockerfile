FROM node:12
WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=8100

COPY package.json .
COPY package-lock.json .
RUN npm install

EXPOSE $PORT
CMD npm run server

COPY . .

