import './utils/client';

describe('authentication', () => {
  it('protects guarded actions', async () => {
    const socket = await makeClient();

    const guardedRequest = {
      type: 'JOIN_SESSION',
      data: {
        resourceType: 'recipe',
        resourceId: '123',
      },
    };

    const guardedResponse = await send(socket, guardedRequest);
    expect(guardedResponse).toHaveProperty('error');
    expect(guardedResponse.error).toMatchObject({
      name: expect.stringMatching(/NotAuthenticated/i),
    });
  });

  it('unlocks guarded actions', async () => {
    const socket = await makeClient();

    const authenticationRequest = {
      type: 'AUTHENTICATE',
      data: {
        clientIdentity: { name: 'bob' },
      },
    };

    const authenticationResponse = await send(socket, authenticationRequest);
    expect(authenticationResponse).not.toHaveProperty('error');

    // some non-auth request that will fail
    const guardedRequest = {
      type: 'JOIN_SESSION',
      data: {
        resourceType: 'fake_type',
        resourceId: 'fake_id',
      },
    };

    const guardedResponse = await send(socket, guardedRequest);
    expect(guardedResponse).toHaveProperty('error');
    expect(guardedResponse.error).toMatchObject({
      name: expect.not.stringMatching(/NotAuthenticated/i),
    });
  });

  it('can be done once per socket', async () => {
    const socket = await makeClient();

    const authenticationRequest = {
      type: 'AUTHENTICATE',
      data: {
        clientIdentity: { name: 'bob' },
      },
    };

    const authenticationResponse = await send(socket, authenticationRequest);
    expect(authenticationResponse).not.toHaveProperty('error');

    const secondAuthenticationRequest = {
      type: 'AUTHENTICATE',
      data: {
        clientIdentity: { name: 'alice' },
      },
    };

    const secondResponse = await send(socket, secondAuthenticationRequest);
    expect(secondResponse).toHaveProperty('error');
    expect(secondResponse.error).toMatchObject({
      name: expect.stringMatching(/AlreadyAuthenticated/i),
    });
  });
});
