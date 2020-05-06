import './utils/client';
import './utils/matchers';
import { authenticate, joinSession } from './utils/server-requests';

describe('authentication', () => {
  it('protects guarded actions', async () => {
    const socket = await makeClient();

    const guardedRequest = joinSession(socket, 'recipe', '123');
    await expect(guardedRequest).rejects.toThrowName(/NotAuthenticated/i);
  });

  it('unlocks guarded actions', async () => {
    const socket = await makeClient();
    await authenticate(socket, { name: 'bob' });

    // some non-auth request that will fail
    const guardedRequest = joinSession(socket, 'fake_type', 'fake_id');
    await expect(guardedRequest).rejects.not.toThrowName(/NotAuthenticated/i);
  });

  it('can be done once per socket', async () => {
    const socket = await makeClient();
    await authenticate(socket, { name: 'bob' });

    const secondAuthenticationRequest = authenticate(socket, { name: 'bob2' });
    await expect(secondAuthenticationRequest).rejects.toThrowName(/AlreadyAuthenticated/i);
  });
});
