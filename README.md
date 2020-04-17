<h1 align="center"><a href="https://github.com/prk3/sundae-collab-server">sundae-collab</a></h1>
<p align="center">Delicious collaboration framework</p>

sundae-collab is a set of tools that enable app developers to add collaboration over JSON documents to their client applications. The core of the collaboration system is sundae-server. It communicates with clients over web sockets and manages resource collaboration sessions. Operational Transformation algorithm ensures that local resource copies stay in sync.

## How do I use sundae-collab?

This repository can be built into a docker image. Simply use `https://github.com/prk3/sundae-collab-server.git` as a build path. Alternatively, you can clone this node project, install dependencies with `npm install` and run it with `npm run server`. The servers runs on port `8100` but you can override this with PORT env variable.

For the client integration, you can use [sundae-collab-react](https://github.com/prk3/sundae-collab-react) with React apps or [sundae-collab-client](https://github.com/prk3/sundae-collab-client) with vanilla javascript.

## Is there a demo?

Yes. Use this docker-compose file to run sundae-collab-server, sundae-collab-demo-client, sundae-collab-demo-api and postgress. Open [localhost:8200](http://localhost:8200) and test collaboration on cooking recipes!

```yml
version: '3'
services:

  postgres:
    image: postgres:12.1
    environment:
      POSTGRES_PASSWORD: postgres

  server:
    build: https://github.com/prk3/sundae-collab-server.git
    ports:
      - "8100:8100"
    environment:
      NODE_ENV: "development" # to allow cross origin requests
      LOG: warning

  demo-api:
    build: https://github.com/prk3/sundae-collab-demo-api.git
    ports:
      - "8000:8000"
    depends_on:
      - postgres
    environment:
      DB_HOST: postgres
      NODE_ENV: "development" # to allow cross origin requests

  demo-client:
    build: https://github.com/prk3/sundae-collab-demo-client.git
    ports:
      - "8200:8200"
```

## Environment

Before you run sundae-collab-server locally, copy `example.env` file to `.env`. The server respects the following env variables:

- NODE_ENV - environment - development / production / test (default = "production")
- PORT - defines port the server will run on (default = 8100)
- LOG - override of winstons's log level (default = "warning" in production, "debug" in development, undefined in test)

## Useful commands

In the project directory, you can run:

### `npm run server`

Runs the server.

### `npm run dev`

Runs the server in the development mode. It will reload whenever source files change.

### `npm run test`

Runs the integration tests.

### `npm run lint`

Lints all source files and tests.

## About

This software is a part of my dissertation project. While the demo looks promising, the project needs a lot more work before it becomes production ready. Feel free to experiment and contribute.

## TODO

1. Enable use of wss (secure web sockets).
1. Add constraints to identity and use it to properly authenticate users.
1. Save revisions in a persistent key-value store and add version control to the protocol.
1. Allow to leave sessions without knowing session id.
1. Add resource type schema support and validate new content revisions against those schemas.

## Learn More

[Operational Transformations as an algorithm for automatic conflict resolution by Anton Zagorskii](https://medium.com/coinmonks/operational-transformations-as-an-algorithm-for-automatic-conflict-resolution-3bf8920ea447)

## Credit

Big thanks to [JoshData](https://github.com/JoshData) for amazing work on [jot](https://github.com/JoshData/jot) - JSON OT library.
