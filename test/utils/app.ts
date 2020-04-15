import makeApp from '../../src/app';
import './app.d';

// start a new server instance before each test suite
// make it available under global.httpServer
beforeAll((done) => {
  const [, server] = makeApp();
  global.httpServer = server;
  // credits to supertest for the trick with port 0 and http.Server.address().port
  // https://github.com/visionmedia/supertest/blob/master/lib/test.js
  global.httpServer.listen(0, () => done());
});

// close the server when test a suite finishes
afterAll((done) => {
  global.httpServer.close(done);
});
