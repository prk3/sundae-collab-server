
import { Server as WebSocketServer } from 'ws';
import { Server as HttpServer } from 'http';
import Application from './lib/app';

/**
 * This function sets up an http server, starts a WebSocket server and creates
 * an Application instance. It returns a tuple with both the app and http
 * server, so that tests can run the application on a random free port.
 */
export default function makeApp(): [Application, HttpServer] {
  const http = new HttpServer((req, res) => {
    // allow cross-origin requests in test/development env
    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, PATCH, UPDATE, DELETE, HEAD');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
      }
    }
  });

  const wss = new WebSocketServer({ server: http });

  http.on('close', () => wss.close());

  const app = new Application(wss);

  return [app, http];
}
