import { authenticate } from './utils/server-requests';

describe('sessions', () => {
  it('can be started only if not already started (globally)', async () => {
    const socket = await makeClient();
    await authenticate(socket, { name: 'tom' });

    const startSessionRequest = {
      type: 'START_SESSION',
      data: {
        resourceType: 'fake_type',
        resourceId: 'fake_id',
        resourceValue: { foo: 'bar' },
      },
    };

    const startResponse = await send(socket, startSessionRequest);
    expect(startResponse).toHaveProperty('id');
    expect(typeof startResponse.id).toEqual('string');

    const secondStartResponse = await send(socket, startSessionRequest);
    expect(secondStartResponse).toHaveProperty('error');
    expect(secondStartResponse.error).toMatchObject({
      name: expect.stringMatching(/SessionAlreadyExists/i),
    });
  });

  it('can not be joined if not started (globally)', async () => {
    const socket = await makeClient();
    await authenticate(socket, { name: 'tom' });

    const joinSessionRequest = {
      type: 'JOIN_SESSION',
      data: {
        resourceType: 'fake_type',
        resourceId: 'fake_id',
      },
    };

    const joinResponse = await send(socket, joinSessionRequest);

    expect(joinResponse).toHaveProperty('error');
    expect(joinResponse.error).toMatchObject({
      name: expect.stringMatching(/SessionNotFound/i),
    });
  });

  it('can not be rejoined if already joined', async () => {
    const socket = await makeClient();
    await authenticate(socket, { name: 'tom' });

    const startSessionRequest = {
      type: 'START_SESSION',
      data: {
        resourceType: 'fake_type',
        resourceId: 'fake_id',
        resourceValue: { foo: 'bar' },
      },
    };

    const startResponse = await send(socket, startSessionRequest);

    expect(startResponse).not.toHaveProperty('error');
    expect(startResponse).toHaveProperty('id');
    expect(typeof startResponse.id).toEqual('string');

    const joinSessionRequest = {
      type: 'JOIN_SESSION',
      data: {
        resourceType: 'fake_type',
        resourceId: 'fake_id',
      },
    };

    const joinResponse = await send(socket, joinSessionRequest);
    expect(joinResponse).toHaveProperty('error');
    expect(joinResponse.error).toMatchObject({
      name: expect.stringMatching(/AlreadyInSession/i),
    });
  });
});
