import { authenticate, joinSession, startSession } from './utils/server-requests';
import './utils/matchers';

describe('sessions', () => {
  it('can be started only if not already started (globally)', async () => {
    const socket = await makeClient();
    await authenticate(socket, { name: 'tom' });

    const startResponse = await startSession(socket, 'fake_type', 'fake_id', { foo: 'bar' });
    expect(startResponse).toMatchObject({
      id: expect.any(String),
      meta: expect.any(Object),
      version: 0,
    });

    const secondStartRequest = startSession(socket, 'fake_type', 'fake_id', { foo: 'bar' });
    await expect(secondStartRequest).rejects.toThrowName(/AlreadyExists/i);
  });

  it('can not be joined if not started (globally)', async () => {
    const socket = await makeClient();
    await authenticate(socket, { name: 'tom' });

    const joinRequest = joinSession(socket, 'fake_type', 'fake_id');
    await expect(joinRequest).rejects.toThrowName(/SessionNotFound/i);
  });

  it('can not be rejoined if already joined', async () => {
    const socket = await makeClient();
    await authenticate(socket, { name: 'tom' });

    const startResponse = await startSession(socket, 'fake_type', 'fake_id', { foo: 'bar' });
    expect(startResponse).toMatchObject({
      id: expect.any(String),
      meta: expect.any(Object),
      version: 0,
    });

    const joinRequest = joinSession(socket, 'fake_type', 'fake_id');
    await expect(joinRequest).rejects.toThrowName(/AlreadyInSession/i);
  });
});
