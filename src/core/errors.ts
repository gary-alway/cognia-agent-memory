export class CogniaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CogniaError";
    Object.setPrototypeOf(this, CogniaError.prototype);
  }
}

export class NetworkError extends CogniaError {
  constructor(
    message: string,
    options?: { cause?: unknown; statusCode?: number },
  ) {
    super(message, options);
    this.name = "NetworkError";
    if (options?.statusCode !== undefined) {
      (this as { statusCode?: number }).statusCode = options.statusCode;
    }
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class TimeoutError extends CogniaError {
  constructor(
    message: string,
    options?: { cause?: unknown; timeoutMs?: number },
  ) {
    super(message, options);
    this.name = "TimeoutError";
    if (options?.timeoutMs !== undefined) {
      (this as { timeoutMs?: number }).timeoutMs = options.timeoutMs;
    }
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}
