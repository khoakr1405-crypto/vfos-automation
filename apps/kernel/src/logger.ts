import pino, { type Logger, type LoggerOptions } from 'pino';
import type { KernelConfig } from './config.js';

export function createLogger(cfg: KernelConfig): Logger {
  const opts: LoggerOptions = {
    level: cfg.LOG_LEVEL,
    base: { service: 'vfos-kernel' },
  };
  if (cfg.NODE_ENV === 'development') {
    opts.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l' },
    };
  }
  return pino(opts);
}
