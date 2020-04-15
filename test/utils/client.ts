import './app';
import './client.d';
import WebSocket from 'ws';
import nanoid from 'nanoid/non-secure';
import {
  ClientMessageType, ClientMessageData, ClientResponse, ServerMessageType, ServerMessage,
  ServerResponse, responsePacketValidator, requestPacketValidator, messageValidator,
} from 'sundae-collab-shared';

type WebSocketMessage = {
  data: any;
  type: string;
  target: WebSocket;
};

/**
 * Creates a web socket connection to the server initialized in app.ts.
 */
export async function makeClient(): Promise<WebSocket> {
  return new Promise((res, rej) => {
    // credits to supertest for the trick with port 0 and http.Server.address().port
    // https://github.com/visionmedia/supertest/blob/master/lib/test.js
    const address = global.httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 8100;

    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.on('open', () => {
      global.sockets.push(socket);
      res(socket);
    });
    socket.on('error', () => {
      rej(new Error('Could not establish ws connection.'));
    });
  });
}

/**
 * Sends a message and returns a promise resolving to a server response.
 * Error is considered a valid response.
 */
export async function send<T extends ServerMessageType>(
  socket: WebSocket,
  message: ServerMessage<T>,
): Promise<ServerResponse<T>> {
  const uid = nanoid();
  let timeoutId: any = null;
  let messageListener: any = null;

  // set up a time limit of 4 seconds
  const timeoutPromise = new Promise<ServerResponse<T>>((res, rej) => {
    timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      socket.removeEventListener('message', messageListener);
      rej(new Error('WS timeout. Either server did not respond or response could not be read.'));
    }, 4000);
  });

  // set up response listener
  const responsePromise = new Promise<ServerResponse<T>>((res) => {
    messageListener = ({ data }: WebSocketMessage) => {
      if (typeof data !== 'string') {
        // ignore non-string packets
        return;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        // ignore non-json packets
        return;
      }
      if (!responsePacketValidator.validateSync(parsed)) {
        // ignore non-response packets
        return;
      }
      // response's id must match sent id
      if (parsed?.responseTo === uid) {
        clearTimeout(timeoutId);
        socket.removeEventListener('message', messageListener);
        // resolve the promise even if the server returned an error
        res(parsed.data);
      }
    };
    socket.addEventListener('message', messageListener);
  });

  // send the packet
  socket.send(JSON.stringify({ uid, message }));

  return Promise.race([responsePromise, timeoutPromise]);
}

type DataAndRespond<T extends ClientMessageType>
  = [ClientMessageData<T>, (data: ClientResponse<T>) => Promise<void>];

/**
 * Waits for a request from the server. Promise resolves when a message arrives.
 * The resolved value contains the response content and a response function
 * which sends response to the server.
 */
async function waitFor<T extends ClientMessageType>(
  socket: WebSocket,
  type: T,
): Promise<DataAndRespond<T>> {
  let timeoutId: any = null;
  let messageListener: any = null;

  // set up time limit of 4 seconds
  const timeoutPromise = new Promise<DataAndRespond<T>>((res, rej) => {
    timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      rej(new Error('WS timeout. Either server did not send a request or request could not be read.'));
    }, 4000);
  });

  // listen for requests
  const requestPromise = new Promise<DataAndRespond<T>>((res) => {
    messageListener = ({ data }: WebSocketMessage) => {
      if (typeof data !== 'string') {
        // ignore non-string packets
        return;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        // ignore non-json packets
        return;
      }
      if (!requestPacketValidator.validateSync(parsed)
        || !messageValidator.validateSync(parsed.message)) {
        // ignore non-request packets and requests with invalid message format
        return;
      }
      // type must match
      if (parsed.message.type === type) {
        clearTimeout(timeoutId);
        socket.removeEventListener('message', messageListener);

        // extract data from the request and prepare respond function
        const messageData = parsed.message.data;
        const respond = (responseData: ClientResponse<T>) => new Promise<void>(
          (respondRes, respondRej) => {
            socket.send(
              JSON.stringify({ responseTo: parsed.uid, data: responseData }),
              (err) => (err ? respondRej(err) : respondRes()),
            );
          },
        );

        res([messageData, respond]);
      }
    };
    socket.addEventListener('message', messageListener);
  });

  return Promise.race([requestPromise, timeoutPromise]);
}

// make client functions public at the start of a test suite
beforeAll(() => {
  global.makeClient = makeClient;
  global.send = send;
  global.waitFor = waitFor;
});

// initialize the socket list before each socket
beforeEach(() => {
  global.sockets = [];
});

// clean up sockets after a test finishes
afterEach(() => {
  global.sockets.forEach((socket) => {
    socket.removeAllListeners();
    socket.close();
  });
});
