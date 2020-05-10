FROM node:12-alpine
WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=8100

# git is needed when package.json contains dependencies from git repos
RUN apk add git

COPY package.json .
COPY package-lock.json .
RUN npm install

COPY . .
RUN npm run build

EXPOSE $PORT
CMD npm run start

