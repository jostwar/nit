import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = isHttp ? exception.getResponse() : null;
    const detail =
      typeof responseBody === 'string'
        ? responseBody
        : (responseBody as { message?: string })?.message ??
          'Unexpected error';

    response.status(status).json({
      type: 'about:blank',
      title: isHttp ? exception.name : 'Internal Server Error',
      status,
      detail,
      instance: request?.url ?? '',
    });
  }
}
