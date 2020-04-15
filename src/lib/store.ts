import WebSocket from 'ws';
import nanoid from 'nanoid';
import jot from 'jot';
import { JsonData } from 'sundae-collab-shared';

// type aliases, give function parameters more context
export type Id = string;
export type Version = number;
export type Color = number;

/**
 * State of a resource at a particular version.
 */
export type DocumentState = {
  version: Version;
  value: jot.Document;
  meta: jot.Meta;
};

/**
 * Change to a resource producing a new version.
 */
export type Brick = {
  version: Version;
  operation: jot.Operation;
};

/**
 * Client is a user who connected to the collaboration server and sent an
 * authentication request with a valid identity. This model holds client's
 * id, web socket connection and identity.
 */
export type Client = {
  id: Id;
  socket: WebSocket;
  identity: JsonData;
};

/**
 * Session is like a communication channel for people working on a resource.
 * Withing a session, participants are informed about changes to the
 * resource and session itself. Sessions in the application are unique per
 * resource type and resource id.
 */
export type Session = {
  id: Id;
  resourceType: string;
  resourceId: string;
  state: DocumentState;
  participants: {
    id: Id,
    color: Color;
  }[],
  history: Brick[];
  shortcuts: DocumentState[];
};

/**
 * The data store of the collaboration server.
 *
 * TODO: decide on the update approach: either produce new versions of state
 * (immutable structure) or add more classes to manipulate sessions, clients.
 */
export default class Store {
  private clients: Map<Id, Client> = new Map();

  private sessions: Map<Id, Session> = new Map();

  private socketToClientIdMap: Map<WebSocket, Id> = new Map();

  /**
   * Produces a view into the application state. Can be used for inspection.
   */
  snapshot() {
    return {
      clients: Object.fromEntries(this.clients.entries()),
      sessions: Object.fromEntries(this.sessions.entries()),
    };
  }

  /**
   * Adds a new client to the store.
   */
  addClient(identity: JsonData, socket: WebSocket): Client {
    let id = nanoid();
    while (id in this.clients) {
      id = nanoid();
    }

    const client = { id, identity, socket };

    this.clients.set(id, client);
    this.socketToClientIdMap.set(socket, id);

    return client;
  }

  /**
   * Retrieves client by id.
   */
  getClientById(id: Id): Client | null {
    return this.clients.get(id) ?? null;
  }

  /**
   * Retrieves client by socket connection.
   */
  getClientBySocket(socket: WebSocket): Client | null {
    const id = this.socketToClientIdMap.get(socket);

    if (id === undefined) {
      return null;
    }

    return this.clients.get(id) ?? null;
  }

  /**
   * Removes client with that id.
   */
  removeClient(id: Id): void {
    const client = this.clients.get(id);

    if (client) {
      this.socketToClientIdMap.delete(client.socket);
      this.clients.delete(id);
    }
  }

  /**
   * Adds a new session to the store.
   */
  addSession(
    resourceType: string,
    resourceId: string,
    value: jot.Document,
  ): Session {
    const meta: jot.Meta = {};

    let id = nanoid();
    while (id in this.sessions) {
      id = nanoid();
    }

    const session: Session = {
      id,
      resourceType,
      resourceId,
      state: {
        value,
        meta,
        version: 0,
      },
      // starting the history with "operation 0" is technically not necessary,
      // but it gets rid of edge cases in rebase code
      history: [{ version: 0, operation: new jot.NO_OP() }],
      shortcuts: [{ version: 0, value, meta }],
      participants: [],
    };
    this.sessions.set(id, session);
    return session;
  }

  /**
   * Retrieves session by id.
   */
  getSessionById(id: Id): Session | null {
    return this.sessions.get(id) ?? null;
  }

  /**
   * Retrieves session by resource type and id.
   */
  getSessionByResourceTypeAndId(resourceType: string, resourceId: string): Session | null {
    return [...this.sessions.values()].find(
      (s) => s.resourceType === resourceType && s.resourceId === resourceId,
    ) ?? null;
  }

  /**
   * Removes session with a given id.
   */
  removeSession(id: Id): void {
    this.sessions.delete(id);
  }

  /**
   * Returns all sessions the client participates in.
   */
  getClientSessions(clientId: Id): Session[] {
    return [...this.sessions.values()].filter(
      (session) => session.participants.find((participant) => participant.id === clientId),
    );
  }
}
