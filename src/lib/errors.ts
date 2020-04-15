/* eslint max-classes-per-file: 0 */

// This file defines errors thrown inside the app.

export class BadPacket extends Error {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Public errors are turned into proper responses and sent to clients.
 */
export class PublicError extends Error {}

export class BadMessage extends PublicError {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class NotAuthenticated extends PublicError {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class AlreadyAuthenticated extends PublicError {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class SessionNotFound extends PublicError {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class SessionAlreadyExists extends PublicError {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class UserNotInSession extends PublicError {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class AlreadyInSession extends PublicError {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class BadPath extends PublicError {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class BadUpdate extends PublicError {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
