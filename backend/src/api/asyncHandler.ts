import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler<
  Req extends Request = Request,
  Res extends Response = Response,
> = (req: Req, res: Res, next: NextFunction) => Promise<unknown>;

export function asyncHandler<
  Req extends Request = Request,
  Res extends Response = Response,
>(handler: AsyncRequestHandler<Req, Res>): RequestHandler {
  return (req, res, next) => {
    void handler(req as Req, res as Res, next).catch(next);
  };
}
