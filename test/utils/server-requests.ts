import WebSocket from 'ws';
import { ServerMessageData } from 'sundae-collab-shared';
import { send } from './client';

// This file defines message-specific wrappers over generic send function.
// They make integrations tests a bit more concise.

export async function authenticate(socket: WebSocket, identity: any) {
  return send(socket, {
    type: 'AUTHENTICATE',
    data: {
      clientIdentity: identity,
    },
  });
}

export async function startSession(socket: WebSocket, rType: string, rId: string, rValue: any) {
  return send(socket, {
    type: 'START_SESSION',
    data: {
      resourceType: rType,
      resourceId: rId,
      resourceValue: rValue,
    },
  });
}

export async function joinSession(socket: WebSocket, rType: string, rId: string) {
  return send(socket, {
    type: 'JOIN_SESSION',
    data: {
      resourceType: rType,
      resourceId: rId,
    },
  });
}

export async function leaveSession(socket: WebSocket, sessionId: string) {
  return send(socket, {
    type: 'LEAVE_SESSION',
    data: { sessionId },
  });
}

export async function updateResource(
  socket: WebSocket,
  sessionId: string,
  update: ServerMessageData<'UPDATE_RESOURCE'>['update'],
) {
  return send(socket, {
    type: 'UPDATE_RESOURCE',
    data: { sessionId, update },
  });
}
