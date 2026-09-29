import type { FastifyError, FastifyInstance } from 'fastify';

export interface ApiErrorBody {
  error: { message: string; type: string; code: string };
}

const TYPES: Record<number, string> = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  402: 'insufficient_credits',
  403: 'permission_error',
  404: 'not_found_error',
  413: 'invalid_request_error',
  415: 'invalid_request_error',
  429: 'rate_limit_error',
  503: 'model_unavailable',
};

export function errorBody(statusCode: number, message: string, code?: string): ApiErrorBody {
  const type = TYPES[statusCode] ?? (statusCode >= 500 ? 'api_error' : 'invalid_request_error');
  return { error: { message, type, code: code ?? type } };
}

function publicMessage(err: FastifyError, statusCode: number): string {
  if (statusCode >= 500) return 'Internal server error';
  // Body parse errors quote the raw body; never echo or log it.
  if (err instanceof SyntaxError || err.code?.startsWith('FST_ERR_CTP_')) return 'Invalid request body';
  return err.message;
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    // The err serializer drops the message; never pass request data here.
    if (statusCode >= 500) request.log.error({ err }, 'request failed');
    else request.log.info({ err }, 'request rejected');
    const code = statusCode < 500 && err.code && !err.code.startsWith('FST_') ? err.code.toLowerCase() : undefined;
    return reply.status(statusCode).send(errorBody(statusCode, publicMessage(err, statusCode), code));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send(errorBody(404, `Unknown route ${request.method} ${request.url.split('?')[0]}`));
  });
}
