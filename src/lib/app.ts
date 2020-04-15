import WebSocket from 'ws';
import winston from 'winston';
import nanoid from 'nanoid';
import {
  ServerMessageType, Message, RequestPacket, ResponsePacket, responsePacketValidator, JsonData,
} from 'sundae-collab-shared';
import serverHandlers, { BaseContext } from './handlers';
import {
  parseRequestPacket, parseServerMessage, encodeResponsePacket, parseResponsePacket,
} from './transport';
import { PublicError } from './errors';
import Store from './store';

/**
 * Determines log level based on env variables.
 */
function getLogLevel(): string | undefined {
  if (process.env.LOG) {
    return process.env.LOG;
  }
  switch (process.env.NODE_ENV) {
    case 'production': return 'warning';
    case 'test': return undefined;
    default: return 'debug';
  }
}

/**
 * Turns exception object into JSON-compatible data.
 */
function formatError(error: Error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

/**
 * Sends request to the client and returns a promise resolving with a response.
 */
async function send(socket: WebSocket, message: Message): Promise<JsonData> {
  return new Promise<JsonData>((res, rej) => {
    const uid = nanoid();
    const packet: RequestPacket = { uid, message };

    let closeListener: () => void;

    const messageListener = ({ data }: any) => {
      if (typeof data !== 'string') {
        return;
      }

      let response: ResponsePacket;
      try {
        response = responsePacketValidator.validateSync(JSON.parse(data), { strict: true });
      } catch (e) {
        return;
      }

      if (response.responseTo === uid) {
        // TODO maybe validate message deeper (clientOutputValidators)?
        socket.removeEventListener('message', messageListener);
        socket.removeEventListener('close', closeListener);
        res(response.data);
      }
    };

    closeListener = () => {
      socket.removeEventListener('message', messageListener);
      socket.removeEventListener('close', closeListener);
      // should we reject this? or maybe hang if client did not respond?
      rej(new Error('Socket closed.'));
    };

    socket.addEventListener('message', messageListener);
    socket.addEventListener('close', closeListener);

    // TODO maybe set timeout and remove listeners?

    socket.send(JSON.stringify(packet), (err) => {
      if (err) {
        socket.removeEventListener('message', messageListener);
        socket.removeEventListener('close', closeListener);
        rej(err);
      }
    });
  });
}

/**
 * The main class of the collaboration server. Attaches listeners to a web
 * socket server to talk with clients. Forms context object and passes it
 * to request handlers.
 *
 * TODO: manage client response listeners centrally to avoid unnecessary
 * repeating packet validation. We could reuse some code from client's
 * Client class.
 */
export default class Application {
  /**
   * The main application logger.
   */
  log: winston.Logger;

  /**
   * Web socket server.
   */
  wss: WebSocket.Server;

  /**
   * In memory data store.
   */
  store: Store;

  /**
   * List of functions that should be executed after handling a request.
   */
  postponed: (() => void)[];

  constructor(wss: WebSocket.Server) {
    const logLevel = getLogLevel();

    this.log = winston.createLogger({
      levels: winston.config.syslog.levels,
      level: logLevel,
      silent: logLevel === undefined,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
      transports: [
        new winston.transports.Console(),
      ],
    });

    this.wss = wss;
    this.store = new Store();
    this.postponed = [];

    // TODO: add timeout to remove unauthenticated sockets
    this.wss.on('connection', (socket) => {
      // every 15 seconds ping a client
      // if client doesn't respond within 10 seconds close connection
      const pingInterval = setInterval(() => {
        let pongListener: () => void;
        const closeTimeout = setTimeout(() => {
          socket.removeEventListener('pong', pongListener);
          socket.close();
        }, 10_000);
        pongListener = () => {
          clearTimeout(closeTimeout);
          socket.removeEventListener('pong', pongListener);
        };
        socket.ping();
        socket.addEventListener('pong', pongListener);
      }, 15_000);

      socket.on('message', (raw) => {
        this.handleIncomingSocketMessage(socket, raw);
      });
      socket.on('close', () => {
        clearInterval(pingInterval);
        this.handleSocketClose(socket);
      });
      socket.on('error', (e) => this.log.error(e));
      socket.on('unexpected-response', (req) => this.log.warning('unexpected response', req));
    });
  }

  /**
   * Adds a callback that should be executed after the handler finishes.
   */
  private later(callback: () => void) {
    this.postponed.push(callback);
  }

  /**
   * Executes actions from the postponed queue.
   */
  private handlePostponed() {
    while (this.postponed.length > 0) {
      const action = this.postponed.shift() as () => void;
      action();
    }
  }

  /**
   * Catches incoming requests and runs an appropriate handler.
   */
  private async handleIncomingSocketMessage(
    socket: WebSocket,
    socketData: WebSocket.Data,
  ): Promise<void> {
    try {
      await parseResponsePacket(socketData);
      return;
    } catch (e) {
      // good, we're not handling response packets
    }

    let packet: RequestPacket | null = null;

    try {
      packet = await parseRequestPacket(socketData);
      const message: Message = await parseServerMessage(packet);

      // conversions here are safe because message have been validated at this point
      const response = await serverHandlers[message.type as ServerMessageType](
        message.data as any,
        this.formContext(socket),
      );

      socket.send(encodeResponsePacket(packet.uid, response));

      this.handlePostponed();
    } catch (error) {
      if (error instanceof PublicError && packet !== null) {
        socket.send(encodeResponsePacket(packet.uid, { error: formatError(error) }));
      } else {
        this.log.error(error);
      }
    }
  }

  /**
   * Reacts to client disconnecting. Removes the client from sessions they
   * participated in.
   */
  private async handleSocketClose(socket: WebSocket): Promise<void> {
    const client = this.store.getClientBySocket(socket);

    if (client) {
      const leavePromises = this.store.getClientSessions(client.id).map(async (session) => {
        // using handles this way may cause problems, not sure though
        await serverHandlers.LEAVE_SESSION({ sessionId: session.id }, this.formContext(socket));
        this.handlePostponed();
      });
      // resolve leavePromises in sequence
      await leavePromises.reduce((acc, nextLeave) => (
        acc
          .then(() => nextLeave)
          .catch((err) => { this.log.error('session leave failed', err); })
      ), Promise.resolve());

      this.store.removeClient(client.id);
    }
  }

  /**
   * Forms a context object used by handlers.
   */
  private formContext(socket: WebSocket): BaseContext {
    return {
      log: this.log,
      store: this.store,
      send, // TODO make a better response handler
      later: this.later.bind(this),
      socket,
    };
  }
}
