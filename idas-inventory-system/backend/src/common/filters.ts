import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');
  catch(ex: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';

    if (ex instanceof HttpException) {
      status = ex.getStatus();
      const r = ex.getResponse() as any;
      message = typeof r === 'string' ? r : r.message ?? r;
    } else if (ex instanceof Prisma.PrismaClientKnownRequestError) {
      if (ex.code === 'P2002') { status = 409; message = 'A record with the same unique value already exists'; }
      else if (ex.code === 'P2025') { status = 404; message = 'Record not found'; }
      else if (ex.code === 'P2003') { status = 409; message = 'Operation violates a relationship constraint'; }
      else if (ex.code === 'P2034') { status = 409; message = 'Conflicting concurrent change; please retry'; }
      else this.logger.error(ex.message, ex.stack);
    } else if (ex instanceof Prisma.PrismaClientUnknownRequestError && /no_overlap|23P01/.test(ex.message)) {
      status = 409; message = 'That time slot has just been booked by someone else';
    } else {
      this.logger.error((ex as Error)?.message, (ex as Error)?.stack);
    }
    res.status(status).json({ statusCode: status, message, path: req.url, timestamp: new Date().toISOString() });
  }
}
