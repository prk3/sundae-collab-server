import jot from 'jot';
import {
  authenticate, startSession, joinSession, leaveSession, updateResource,
} from './utils/server-requests';


describe('client messages', () => {
  it('sent when user joins and leaves session', async () => {
    const patrickSocket = await makeClient();
    const patrickAuth = await authenticate(patrickSocket, { name: 'patrick' });
    const patrickSession = await startSession(patrickSocket, 'fake_type', 'fake_id', { name: '', description: '' });

    const tomSocket = await makeClient();
    const tomAuth = await authenticate(tomSocket, { name: 'tom' });
    const tomSession = await joinSession(tomSocket, 'fake_type', 'fake_id');

    expect(tomSession).toMatchObject({
      id: patrickSession.id,
      participants: expect.arrayContaining([
        expect.objectContaining({ id: patrickAuth.id, color: 0 }),
        expect.objectContaining({ id: tomAuth.id, color: 1 }),
      ]),
    });
    expect(tomSession.participants.length).toEqual(2);

    await waitFor(patrickSocket, 'ADD_PARTICIPANT').then(([data, respond]) => {
      expect(data).toMatchObject({
        sessionId: patrickSession.id,
        participantId: tomAuth.id,
        participantIdentity: { name: 'tom' },
        participantColor: 1,
      });
      return respond({});
    });

    await leaveSession(tomSocket, tomSession.id);

    await waitFor(patrickSocket, 'REMOVE_PARTICIPANT').then(([data, respond]) => {
      expect(data).toMatchObject({
        sessionId: patrickSession.id,
        participantId: tomAuth.id,
      });
      return respond({});
    });
  });

  it('sent when changes are made', async () => {
    const patrickSocket = await makeClient();
    await authenticate(patrickSocket, { name: 'patrick' });
    const patrickSession = await startSession(patrickSocket, 'fake_type', 'fake_id', { name: '', description: '' });

    const tomSocket = await makeClient();
    const tomAuth = await authenticate(tomSocket, { name: 'tom' });
    const tomSession = await joinSession(tomSocket, 'fake_type', 'fake_id');

    await waitFor(patrickSocket, 'ADD_PARTICIPANT').then(([, respond]) => respond({}));

    const update = {
      base: 0,
      operation: (new jot.APPLY('name', new jot.SET('hello'))).toJSON(),
    };
    await updateResource(tomSocket, tomSession.id, update);

    await waitFor(patrickSocket, 'UPDATE_RESOURCE').then(([data, respond]) => {
      expect(data).toMatchObject({
        sessionId: patrickSession.id,
        participantId: tomAuth.id,
      });
      expect(data.update).toEqual({ version: 1, operation: update.operation });
      return respond({});
    });
  });
});
