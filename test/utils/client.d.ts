declare module NodeJS {
  interface Global {
    sockets: import('ws')[];
    makeClient: () => Promise<import('ws')>;
    send: (socket: import('ws'), message: any) => Promise<any>;
    waitFor: <T extends import('sundae-collab-shared').ClientMessageType>(
      socket: import('ws'),
      type: T,
    ) => Promise<[
      import('sundae-collab-shared').ClientMessageData<T>,
      (data: import('sundae-collab-shared').ClientResponse) => Promise<any>
    ]>;
  }
}

declare let makeClient: NodeJS.Global['makeClient'];
declare let send: NodeJS.Global['send'];
declare let waitFor: NodeJS.Global['waitFor'];
