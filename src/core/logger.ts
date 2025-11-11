type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[DEFAULT_LOG_LEVEL];
}

export class Logger {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const prefix = this.context ? `[${this.context}]` : "";
    const timestamp = new Date().toISOString();
    return `${timestamp} ${level.toUpperCase()} ${prefix} ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (shouldLog("info")) {
      console.log(this.formatMessage("info", message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (shouldLog("error")) {
      console.error(this.formatMessage("error", message), ...args);
    }
  }
}

let defaultLogger: Logger | null = null;

export function getLogger(context?: string): Logger {
  if (!context) {
    if (defaultLogger === null) {
      defaultLogger = new Logger();
    }
    return defaultLogger;
  }
  return new Logger(context);
}
