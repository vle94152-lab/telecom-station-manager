export type LogContext = Record<string, unknown>;

function log(level: 'info' | 'warn' | 'error', message: string, context?: LogContext) {
  const payload = context ? { message, ...context } : { message };
  if (level === 'info') console.info(payload);
  if (level === 'warn') console.warn(payload);
  if (level === 'error') console.error(payload);
}

export const logger = {
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};
