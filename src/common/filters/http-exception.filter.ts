import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HTTP_ERROR_CODE_MAP } from '../constants/http-error-code-map';

type ErrorPayload = {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  requestId: string;
  timestamp: string;
  details?: Record<string, unknown>;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{
      url: string;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const response = http.getResponse<{
      setHeader: (name: string, value: string) => void;
      status: (code: number) => { json: (body: ErrorPayload) => void };
    }>();

    const status = this.resolveStatus(exception);
    const requestId = this.resolveRequestId(request.headers['x-request-id']);
    const normalized = this.normalizeException(exception, status);

    const payload: ErrorPayload = {
      statusCode: status,
      code: this.resolveErrorCode(status),
      message: normalized.message,
      path: request.url,
      requestId,
      timestamp: new Date().toISOString(),
      ...(normalized.details ? { details: normalized.details } : {}),
    };

    response.setHeader('x-request-id', requestId);
    response.status(status).json(payload);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveRequestId(rawRequestId: string | string[] | undefined): string {
    if (typeof rawRequestId === 'string' && rawRequestId.trim().length > 0) {
      return rawRequestId;
    }

    if (Array.isArray(rawRequestId) && rawRequestId.length > 0) {
      const first = rawRequestId[0]?.trim();
      if (first) {
        return first;
      }
    }

    return randomUUID();
  }

  private resolveErrorCode(status: number): string {
    const mapped = HTTP_ERROR_CODE_MAP[status];
    if (mapped) {
      return mapped;
    }

    const fallback = HttpStatus[status];
    return typeof fallback === 'string' ? fallback : 'INTERNAL_SERVER_ERROR';
  }

  private normalizeException(
    exception: unknown,
    status: number,
  ): { message: string; details?: Record<string, unknown> } {
    if (exception instanceof HttpException) {
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'string') {
        return { message: responseBody };
      }

      if (responseBody && typeof responseBody === 'object') {
        const payload = responseBody as Record<string, unknown>;
        const rawMessage = payload.message;
        const message = this.resolveMessage(rawMessage, status);
        const details = this.resolveDetails(payload, rawMessage);
        return { message, ...(details ? { details } : {}) };
      }

      return {
        message: this.resolveMessage(exception.message, status),
      };
    }

    if (exception instanceof Error) {
      if (status >= 500) {
        return {
          message: 'Internal server error',
          details: { reason: exception.message },
        };
      }

      return { message: exception.message };
    }

    return {
      message:
        status >= 500
          ? 'Internal server error'
          : 'Request failed',
      details: { reason: String(exception) },
    };
  }

  private resolveMessage(rawMessage: unknown, status: number): string {
    if (Array.isArray(rawMessage)) {
      const first = rawMessage.find((value) => typeof value === 'string');
      if (typeof first === 'string') {
        return first;
      }
    }

    if (typeof rawMessage === 'string' && rawMessage.trim().length > 0) {
      return rawMessage;
    }

    if (status >= 500) {
      return 'Internal server error';
    }

    return 'Request failed';
  }

  private resolveDetails(
    payload: Record<string, unknown>,
    rawMessage: unknown,
  ): Record<string, unknown> | undefined {
    const { error, ...rest } = payload;
    const details: Record<string, unknown> = {};
    delete rest.statusCode;
    delete rest.message;

    if (Array.isArray(rawMessage)) {
      details.validationErrors = rawMessage;
    }

    if (typeof error === 'string' && error.trim().length > 0) {
      details.error = error;
    }

    if (Object.keys(rest).length > 0) {
      details.meta = rest;
    }

    return Object.keys(details).length > 0 ? details : undefined;
  }
}
