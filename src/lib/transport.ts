import WebSocket from 'ws';
import { Schema as YupSchema } from 'yup';
import {
  RequestPacket, requestPacketValidator, Message, messageValidator, ServerMessageType,
  ResponsePacket, responsePacketValidator, JsonData,
} from 'sundae-collab-shared';
import { BadMessage, BadPacket } from './errors';
import { serverInputValidators } from './validators';

/**
 * Turns raw data received by the web socket server into a request packet.
 * Throws if not possible.
 */
export async function parseRequestPacket(socketData: WebSocket.Data): Promise<RequestPacket> {
  if (typeof socketData !== 'string') {
    throw new BadPacket('Packet is not a string.');
  }

  const packet: JsonData = await (async () => JSON.parse(socketData))().catch(() => {
    throw new BadPacket('Packet is not a valid json.');
  });

  return requestPacketValidator.validate(packet, { strict: true }).catch(() => {
    throw new BadPacket('Packet is not formatted correctly.');
  });
}

/**
 * Turns an incoming request packet into a server request message, validating it on the way.
 * Throws if not possible.
 */
export async function parseServerMessage(inPacket: RequestPacket): Promise<Message> {
  const message = await messageValidator.validate(inPacket.message, { strict: true }).catch(() => {
    throw new BadMessage('Message is not formatted correctly.');
  });

  if (!(message.type in serverInputValidators)) {
    throw new BadMessage('Message type not supported.');
  }

  const dataValidator: YupSchema<JsonData> = serverInputValidators[
    message.type as ServerMessageType
  ];

  await dataValidator.validate(message.data, { strict: true }).catch(() => {
    throw new BadMessage('Message data is not formatted correctly.');
  });

  return message;
}

/**
 * Turns raw data received by the web socket server into a response packet.
 * Throws if not possible.
 */
export async function parseResponsePacket(socketData: WebSocket.Data): Promise<ResponsePacket> {
  if (typeof socketData !== 'string') {
    throw new BadPacket('Response packet is not a string.');
  }

  const packet: JsonData = await (async () => JSON.parse(socketData))().catch(() => {
    throw new BadPacket('Response packet is not a valid json.');
  });

  return responsePacketValidator.validate(packet, { strict: true }).catch(() => {
    throw new BadPacket('Response packet is not formatted correctly.');
  });
}

/**
 * Creates raw web socket message from a response id and response data.
 */
export function encodeResponsePacket(uid: string, data: JsonData): string {
  const responsePacket: ResponsePacket = { responseTo: uid, data };
  return JSON.stringify(responsePacket);
}
