declare global {
  /* eslint-disable-next-line */
  namespace jest {
    interface Matchers<R> {
      toThrowName: (expected: string | RegExp) => R;
    }
  }
}

expect.extend({
  toThrowName(received: Error, expected: string | RegExp) {
    return {
      pass: received instanceof Error && (expected instanceof RegExp
        ? expected.test(received.name)
        : received.name.includes(expected)
      ),
      message: () => `Error name "${received?.name}" does not match "${expected.toString()}".`,
    };
  },
});

export {};
