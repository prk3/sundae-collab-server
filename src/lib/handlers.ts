// I know it's a bad practice. See Store comments to learn about future plans.
/* eslint no-param-reassign: ["error", { "props": false }] */

// Handlers look much cleaner when we decompose object in one line.
/* eslint-disable object-curly-newline */

import WebSocket from 'ws';
import winston from 'winston';
import jot from 'jot';
import { ServerMessages, Message, ClientMessage, JsonData } from 'sundae-collab-shared';
import Store, { Client, Session, Brick, DocumentState } from './store';
import * as err from './errors';
import { rebaseUpdate, applyOperation, clearSelections } from './update';

/**
 * This is the context provided by the Application class to handlers.
 */
export interface BaseContext {
  log: winston.Logger;
  store: Store;
  socket: WebSocket;
  send: (socket: WebSocket, message: Message) => Promise<JsonData>;
  later: (callback: () => void) => void;
}

/**
 * Selects colors for session participants. Returns the smallest non-negative
 * integer that is not present in the list.
 */
function firstAvailableColor(usedColors: number[]) {
  const set = new Set(usedColors);
  for (let i = 0; ; i += 1) {
    if (!set.has(i)) {
      return i;
    }
  }
}

/**
 * Check if an object contains a property.
 */
function hasProp(data: object, property: string) {
  return Object.prototype.hasOwnProperty.call(data, property);
}

/**
 * Middleware adding client to the context or throwing if client is not
 * authenticated.
 */
function authenticated<D, C extends BaseContext, R>(
  handler: Handler<D, C & { client: Client }, R>,
): Handler<D, C, R> {
  return function authenticatedMiddleware(data: D, context: C) {
    const client = context.store.getClientBySocket(context.socket);
    if (!client) {
      throw new err.NotAuthenticated();
    }
    return handler(data, { ...context, client });
  };
}

/**
 * Middleware ensuring the client is not authenticated.
 */
function notAuthenticated<D, C extends BaseContext, R>(
  handler: Handler<D, C, R>,
): Handler<D, C, R> {
  return function notAuthenticatedMiddleware(data: D, context: C) {
    const client = context.store.getClientBySocket(context.socket);
    if (client) {
      throw new err.AlreadyAuthenticated();
    }
    return handler(data, context);
  };
}

/**
 * Middleware adding session to the context or throwing if session does not
 * exist. Assumes user is authenticated and injected into the context.
 */
function withJoinedSession<
  D extends { sessionId: string },
  C extends BaseContext & { client: Client },
  R
>(
  handler: Handler<D, C & { session: Session }, R>,
): Handler<D, C, R> {
  return function withSessionMiddleware(data: D, context: C) {
    const session = context.store.getSessionById(data.sessionId);
    if (session === null) {
      throw new err.SessionNotFound();
    }
    if (!session.participants.find((p) => p.id === context.client.id)) {
      throw new err.UserNotInSession();
    }
    return handler(data, { ...context, session });
  };
}

type Handler<D, C, R> = (data: D, context: C) => R;
type ExtractHandler<F, C> = F extends ((data: infer D) => infer R) ? Handler<D, C, R> : never;

type Handlers = { [key in keyof ServerMessages]: ExtractHandler<ServerMessages[key], BaseContext> };

/**
 * An object that provides a handler function for each message type handled by
 * the server. Each handler takes message data as the first parameter and
 * context object as the second parameter. You can wrap the handler with
 * middleware to reject requests early or add more data to the context.
 */
const handlers: Handlers = {
  AUTHENTICATE: notAuthenticated((
    { clientIdentity },
    { log, store, socket },
  ) => {
    log.debug('< AUTHENTICATE', { clientIdentity });

    const client = store.addClient(clientIdentity, socket);
    log.debug('created client', { client: { ...client, socket: 'X' } });
    return { id: client.id };
  }),
  START_SESSION: authenticated((
    { resourceType, resourceId, resourceValue },
    { log, store, client },
  ) => {
    log.debug('< START_SESSION', { resourceType, resourceId, resourceValue });

    const existingSession = store.getSessionByResourceTypeAndId(resourceType, resourceId);
    if (existingSession) {
      throw new err.SessionAlreadyExists();
    }
    const session = store.addSession(resourceType, resourceId, resourceValue);
    session.participants = [{ id: client.id, color: firstAvailableColor([]) }];

    log.debug(`client ${client.id} created session ${session.id}`, session);
    return {
      id: session.id,
      version: session.state.version,
      meta: session.state.meta,
      participants: session.participants
        .map((p) => ({ ...p, identity: store.getClientById(p.id)?.identity as JsonData })),
    };
  }),
  JOIN_SESSION: authenticated((
    { resourceType, resourceId },
    { log, store, client, send, later },
  ) => {
    log.debug('< JOIN_SESSION', { resourceType, resourceId });

    const session = store.getSessionByResourceTypeAndId(resourceType, resourceId);
    if (!session) {
      throw new err.SessionNotFound();
    }
    if (session.participants.find((p) => p.id === client.id)) {
      throw new err.AlreadyInSession();
    }

    const oldParticipants = session.participants;
    const usedColors = oldParticipants.map((p) => p.color);
    const newParticipant = { id: client.id, color: firstAvailableColor(usedColors) };
    session.participants = [...session.participants, newParticipant];

    later(() => {
      log.debug('> ADD_PARTICIPANT', { client: { ...client, socket: 'X' } });
      oldParticipants
        .forEach((participant) => {
          const participantClient = store.getClientById(participant.id) as Client;
          const msg: ClientMessage<'ADD_PARTICIPANT'> = {
            type: 'ADD_PARTICIPANT',
            data: {
              sessionId: session.id,
              participantId: client.id,
              participantIdentity: client.identity,
              participantColor: newParticipant.color,
            },
          };
          send(participantClient.socket, msg)
            .catch((e) => log.warning('ADD_PARTICIPANT error', { participant, e: e.toString() }));
        });
    });

    log.debug(`client ${client.id} joined session ${session.id}`, session);
    return {
      id: session.id,
      value: session.state.value,
      version: session.state.version,
      meta: session.state.meta,
      participants: session.participants
        .map((p) => ({ ...p, identity: store.getClientById(p.id)?.identity as JsonData })),
    };
  }),
  LEAVE_SESSION: authenticated(withJoinedSession((
    { sessionId },
    { log, store, client, session, send, later },
  ) => {
    log.debug('< LEAVE_SESSION', { sessionId });
    session.participants = session.participants.filter((p) => p.id !== client.id);

    // check if the leaving user has any selections
    const { selections } = session.state.meta;
    let cleanUpdate: { version: number, operation: jot.OpJson };

    if (selections && Object.values(selections).find((field) => hasProp(field, client.id))) {
      let newBrick: Brick;
      let newState: DocumentState;
      try {
        const clear = clearSelections(client.id, session.state.value, session.state.meta);
        newBrick = { version: session.state.version + 1, operation: clear };
        newState = applyOperation(newBrick.operation, session.state);
      } catch (e) {
        log.error('Failed to apply clean update.', { state: session.state });
        log.error(e);
        throw new err.BadUpdate('Clean update could not be applied.');
      }

      if (newBrick.version !== newState.version) {
        throw new Error('Versions do not match.');
      }

      session.state = newState;
      session.history.push(newBrick);
      if (newBrick.version % 10 === 0) {
        session.shortcuts.push(newState);
      }
      cleanUpdate = { version: newBrick.version, operation: newBrick.operation.toJSON() };
    }

    if (session.participants.length === 0) {
      store.removeSession(session.id);
    } else {
      later(() => {
        log.debug('> REMOVE_PARTICIPANT', { client: { ...client, socket: 'X' } });
        session.participants
          .forEach((participant) => {
            const participantClient = store.getClientById(participant.id) as Client;

            if (cleanUpdate) {
              const updateMessage: ClientMessage<'UPDATE_RESOURCE'> = {
                type: 'UPDATE_RESOURCE',
                data: {
                  sessionId: session.id,
                  participantId: client.id,
                  update: cleanUpdate,
                },
              };
              send(participantClient.socket, updateMessage)
                .catch((e) => log.warning('UPDATE_RESOURCE error', { participant, e: e.toString() }));
            }

            const removeMessage: ClientMessage<'REMOVE_PARTICIPANT'> = {
              type: 'REMOVE_PARTICIPANT',
              data: {
                sessionId: session.id,
                participantId: client.id,
              },
            };
            send(participantClient.socket, removeMessage)
              .catch((e) => log.warning('LEAVE_SESSION error', { participant, e: e.toString() }));
          });
      });
    }

    log.debug(`client ${client.id} left session ${session.id}`);
    return {};
  })),
  UPDATE_RESOURCE: authenticated(withJoinedSession((
    { sessionId, update },
    { log, store, client, session, later, send },
  ) => {
    log.debug('< UPDATE_RESOURCE', { sessionId, update });

    let newBrick: Brick;
    let newState: DocumentState;

    try {
      const op = jot.opFromJSON(update.operation);
      newBrick = rebaseUpdate(op, update.base, session.history, session.shortcuts, log);
      newState = applyOperation(newBrick.operation, session.state);
    } catch (e) {
      log.error('Failed to apply update.', { update, state: session.state });
      log.error(e);
      throw new err.BadUpdate('Update could not be applied.');
    }

    if (newBrick.version !== newState.version) {
      throw new Error('Versions do not match.');
    }

    session.state = newState;
    session.history.push(newBrick);
    if (newBrick.version % 10 === 0) {
      session.shortcuts.push(newState);
    }

    later(() => {
      log.debug('> UPDATE RESOURCE', { version: newBrick.version, operation: newBrick.operation.toJSON() });
      session.participants
        .filter((p) => p.id !== client.id)
        .forEach((participant) => {
          const participantClient = store.getClientById(participant.id) as Client;
          const message: ClientMessage<'UPDATE_RESOURCE'> = {
            type: 'UPDATE_RESOURCE',
            data: {
              sessionId: session.id,
              participantId: client.id,
              update: {
                version: newBrick.version,
                operation: newBrick.operation.toJSON(),
              },
            },
          };
          send(participantClient.socket, message)
            .catch((e) => log.warning('UPDATE_RESOURCE error', { participant, e: e.toString() }));
        });
    });

    log.debug(`client ${client.id} updated session ${session.id} with`, update);
    return {
      version: newState.version,
    };
  })),
};

export default handlers;
