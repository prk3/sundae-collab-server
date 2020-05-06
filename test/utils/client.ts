import WebSocket from 'ws';
import nanoid from 'nanoid/non-secure';
import {
  ClientMessageType, ClientMessageData, ClientResponse, ServerMessageType, ServerMessage,
  ServerResponse, responsePacketValidator, requestPacketValidator, messageValidator,
  ResponsePacket, errorDataValidator, RequestPacket, Message,
} from 'sundae-collab-shared';
import './app';

declare global {
  namespace NodeJS {
    interface Global {
      sockets: WebSocket[];
      makeClient: () => Promise<WebSocket>;

      send: <T extends ServerMessageType>(
        socket: WebSocket,
        message: ServerMessage<T>,
      ) => Promise<ServerResponse<T>>;

      waitFor: <T extends ClientMessageType>(
        socket: WebSocket,
        type: T,
      ) => Promise<[ClientMessageData<T>, (data: ClientResponse<T>) => Promise<void>]>;
    }
  }
  let makeClient: NodeJS.Global['makeClient'];
  let send: NodeJS.Global['send'];
  let waitFor: NodeJS.Global['waitFor'];
}


type WebSocketMessage = {
  data: any;
  type: string;
  target: WebSocket;
};

/**
 * Creates a web socket connection to the server initialized in app.ts.
 */
async function makeClientLocal(): Promise<WebSocket> {
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
async function sendLocal<T extends ServerMessageType>(
  socket: WebSocket,
  message: ServerMessage<T>,
): Promise<ServerResponse<T>> {
  const uid = nanoid();
  let timeoutId: any = null;
  let messageListener: any = null;

  // set up a time limit of 4 seconds
  const timeoutPromise = new Promise<ServerResponse<T>>((res, rej) => {
    timeoutId = setTimeout(() => {
      socket.removeEventListener('message', messageListener);
      rej(new Error('WS timeout. Either server did not respond or response could not be read.'));
    }, 4000);
  });

  // set up response listener
  const responsePromise = new Promise<ServerResponse<T>>((res, rej) => {
    messageListener = ({ data }: WebSocketMessage) => {
      let packet: ResponsePacket;
      try {
        packet = responsePacketValidator.validateSync(JSON.parse(data), { strict: true });
      } catch (e) {
        // ignore non-string, non-json or invalid packets
        return;
      }
      // response's id must match sent id
      if (packet.responseTo === uid) {
        clearTimeout(timeoutId);
        socket.removeEventListener('message', messageListener);

        try {
          // reject if response data matches error response format
          const errData = errorDataValidator.validateSync(packet.data, { strict: true });
          const err = new Error(errData.error.message);
          err.name = errData.error.name;
          rej(err);
        } catch (e) {
          // not an error
          // the cast is necessary, but we could validate the response to be sure
          res(packet.data as ServerResponse<T>);
        }
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
async function waitForLocal<T extends ClientMessageType>(
  socket: WebSocket,
  type: T,
): Promise<DataAndRespond<T>> {
  let timeoutId: any = null;
  let messageListener: any = null;

  // set up time limit of 4 seconds
  const timeoutPromise = new Promise<DataAndRespond<T>>((res, rej) => {
    timeoutId = setTimeout(() => {
      socket.removeEventListener('message', messageListener);
      rej(new Error('WS timeout. Either server did not send a request or request could not be read.'));
    }, 4000);
  });

  // listen for requests
  const requestPromise = new Promise<DataAndRespond<T>>((res) => {
    messageListener = ({ data }: WebSocketMessage) => {
      let packet: RequestPacket;
      let message: Message;
      try {
        packet = requestPacketValidator.validateSync(JSON.parse(data), { strict: true });
        message = messageValidator.validateSync(packet.message, { strict: true });
      } catch (e) {
        // ignore non-string, non-json and invalid request packets
        return;
      }
      // type must match
      if (message.type === type) {
        clearTimeout(timeoutId);
        socket.removeEventListener('message', messageListener);

        // extract data from the request and prepare respond function
        const respond = (responseData: ClientResponse<T>) => new Promise<void>(
          (respondRes, respondRej) => {
            socket.send(
              JSON.stringify({ responseTo: packet.uid, data: responseData }),
              (err) => (err ? respondRej(err) : respondRes()),
            );
          },
        );

        res([message.data as ClientMessageData<T>, respond]);
      }
    };
    socket.addEventListener('message', messageListener);
  });

  return Promise.race([requestPromise, timeoutPromise]);
}

// make client functions public at the start of a test suite
beforeAll(() => {
  global.makeClient = makeClientLocal;
  global.send = sendLocal;
  global.waitFor = waitForLocal;
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

/* eslint-disable-next-line import/prefer-default-export */
export { sendLocal as send };
