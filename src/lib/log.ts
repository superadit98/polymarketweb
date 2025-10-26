/* eslint-disable no-console */
import util from 'node:util';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function normaliseLevel(level: string | undefined): LogLevel {
  if (!level) return 'info';
  const lower = level.toLowerCase();
  if (lower === 'error' || lower === 'warn' || lower === 'info' || lower === 'debug') {
    return lower;
  }
  return 'info';
}

type LogPayload = Record<string, unknown> | undefined;

type LogFn = (message: string, payload?: LogPayload) => void;

class Logger {
  private level: LogLevel = 'info';

  setLevel(level: string | LogLevel) {
    this.level = normaliseLevel(typeof level === 'string' ? level : `${level}`);
  }

  private shouldLog(level: LogLevel) {
    return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[this.level];
  }

  private format(message: string, payload?: LogPayload) {
    if (!payload || Object.keys(payload).length === 0) {
      return message;
    }
    return `${message} ${util.inspect(payload, { depth: 4, colors: false })}`;
  }

  error: LogFn = (message, payload) => {
    if (!this.shouldLog('error')) return;
    console.error(this.format(message, payload));
  };

  warn: LogFn = (message, payload) => {
    if (!this.shouldLog('warn')) return;
    console.warn(this.format(message, payload));
  };

  info: LogFn = (message, payload) => {
    if (!this.shouldLog('info')) return;
    console.info(this.format(message, payload));
  };

  debug: LogFn = (message, payload) => {
    if (!this.shouldLog('debug')) return;
    console.debug(this.format(message, payload));
  };
}

const globalKey = Symbol.for('smartTraders.logger');

const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: Logger;
};

if (!globalStore[globalKey]) {
  globalStore[globalKey] = new Logger();
}

export const logger = globalStore[globalKey]!;
