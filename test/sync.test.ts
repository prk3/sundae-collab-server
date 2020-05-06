// the rule does not consider awaiting promises with jest's except
/* eslint-disable jest/valid-expect-in-promise */

import jot from 'jot';
import {
  authenticate, startSession, joinSession, updateResource,
} from './utils/server-requests';

describe('synchronization', () => {
  it('works in a non-concurrent edit scenario', async () => {
    const aliceSocket = await makeClient();
    const aliceAuth = await authenticate(aliceSocket, { name: 'alice' });
    const aliceSession = await startSession(aliceSocket, 'fake_type', 'fake_id', 'zero five ten fifteen twenty');

    const bobSocket = await makeClient();
    await authenticate(bobSocket, { name: 'bob' });
    const bobSession = await joinSession(bobSocket, 'fake_type', 'fake_id');

    expect(aliceSession).toMatchObject({
      version: 0,
      meta: {},
    });

    expect(bobSession).toMatchObject({
      version: 0,
      value: 'zero five ten fifteen twenty',
      meta: {},
    });

    const aliceOp1 = new jot.LIST([
      new jot.SPLICE(14, 0, 'eleven '),
      new jot.SELECT('a', { start: 21, end: 21 }),
    ]).simplify();

    const aliceUpdate1 = {
      base: 0,
      operation: aliceOp1.toJSON(),
    };

    await Promise.all([
      updateResource(aliceSocket, aliceSession.id, aliceUpdate1).then((res) => {
        expect(res).toMatchObject({
          version: 1,
        });
      }),
      waitFor(bobSocket, 'UPDATE_RESOURCE').then(([data, respond]) => {
        expect(data).toMatchObject({
          sessionId: bobSession.id,
          participantId: aliceAuth.id,
          update: {
            version: 1,
            operation: aliceUpdate1.operation,
          },
        });
        const op = jot.opFromJSON(data.update.operation);
        const [newValue, newMeta] = op.applyWithMeta(bobSession.value, bobSession.meta);
        expect(newValue).toEqual('zero five ten eleven fifteen twenty');
        expect(newMeta).toMatchObject({
          selections: {
            '': {
              a: { start: 21, end: 21 },
            },
          },
        });
        return respond({});
      }),
    ]);

    const chrisSocket = await makeClient();
    await authenticate(chrisSocket, { name: 'chris' });
    const chrisSession = await joinSession(chrisSocket, 'fake_type', 'fake_id');

    expect(chrisSession.value).toEqual('zero five ten eleven fifteen twenty');
    expect(chrisSession.meta).toMatchObject({
      selections: {
        '': {
          a: { start: 21, end: 21 },
        },
      },
    });
  });

  it('works in a concurrent edit scenario', async () => {
    const initValue = 'zero five ten fifteen twenty';
    const initMeta = {};

    const aliceSocket = await makeClient();
    const aliceAuth = await authenticate(aliceSocket, { name: 'alice' });
    const aliceSession = await startSession(aliceSocket, 'fake_type', 'fake_id', 'zero five ten fifteen twenty');

    const bobSocket = await makeClient();
    const bobAuth = await authenticate(bobSocket, { name: 'bob' });
    const bobSession = await joinSession(bobSocket, 'fake_type', 'fake_id');

    const aliceOp1 = new jot.LIST([
      new jot.SPLICE(14, 0, 'eleven '),
      new jot.SELECT('a', { start: 21, end: 21 }),
    ]).simplify();

    const aliceUpdate1 = {
      base: 0,
      operation: aliceOp1.toJSON(),
    };

    const bobOp1 = new jot.LIST([
      new jot.SPLICE(5, 0, 'two '),
      new jot.SELECT('b', { start: 9, end: 9 }),
    ]).simplify();

    const bobUpdate1 = {
      base: 0,
      operation: bobOp1.toJSON(),
    };

    // bob's update will arrive first and thus won't be rebased
    // alice's update must be rebased against bob's changes
    const clientMessages = Promise.all([
      waitFor(aliceSocket, 'UPDATE_RESOURCE').then(([data, respond]) => {
        expect(data).toMatchObject({
          sessionId: aliceSession.id,
          participantId: bobAuth.id,
          update: {
            version: 1,
            operation: bobOp1.toJSON(),
          },
        });
        return respond({});
      }),
      waitFor(bobSocket, 'UPDATE_RESOURCE').then(([data, respond]) => {
        expect(data).toMatchObject({
          sessionId: bobSession.id,
          participantId: aliceAuth.id,
          update: {
            version: 2,
            // rebase should not conflict, we can null-coalesce
            operation: aliceOp1.rebase(bobOp1)?.toJSON(),
          },
        });
        const op = jot.opFromJSON(data.update.operation);
        const [finalValue, finalMeta] = op.applyWithMeta(
          ...bobOp1.applyWithMeta(initValue, initMeta),
        );
        expect(finalValue).toEqual('zero two five ten eleven fifteen twenty');
        expect(finalMeta).toMatchObject({
          selections: {
            '': {
              a: { start: 25, end: 25 },
              b: { start: 9, end: 9 },
            },
          },
        });

        return respond({});
      }),
    ]);

    // send bob's update and later alice's update
    await Promise.all([
      updateResource(bobSocket, bobSession.id, bobUpdate1).then((res) => {
        expect(res).toMatchObject({
          version: 1,
        });
      }),
      updateResource(aliceSocket, aliceSession.id, aliceUpdate1).then((res) => {
        expect(res).toMatchObject({
          version: 2,
        });
        const [finalValue, finalMeta] = bobOp1.applyWithMeta(
          ...aliceOp1.applyWithMeta(initValue, initMeta),
        );
        expect(finalValue).toEqual('zero two five ten eleven fifteen twenty');
        expect(finalMeta).toMatchObject({
          selections: {
            '': {
              a: { start: 25, end: 25 },
              b: { start: 9, end: 9 },
            },
          },
        });
      }),
    ]);

    await clientMessages;

    const chrisSocket = await makeClient();
    await authenticate(chrisSocket, { name: 'chris' });
    const chrisSession = await joinSession(chrisSocket, 'fake_type', 'fake_id');

    expect(chrisSession.value).toEqual('zero two five ten eleven fifteen twenty');
    expect(chrisSession.meta).toMatchObject({
      selections: {
        '': {
          a: { start: 25, end: 25 },
          b: { start: 9, end: 9 },
        },
      },
    });
  });
});
