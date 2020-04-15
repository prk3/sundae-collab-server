declare module NodeJS {
  interface Global {
    httpServer: import('http').Server;
  }
}
