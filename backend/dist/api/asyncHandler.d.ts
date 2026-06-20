import type { NextFunction, Request, RequestHandler, Response } from 'express';
type AsyncRequestHandler<Req extends Request = Request, Res extends Response = Response> = (req: Req, res: Res, next: NextFunction) => Promise<unknown>;
export declare function asyncHandler<Req extends Request = Request, Res extends Response = Response>(handler: AsyncRequestHandler<Req, Res>): RequestHandler;
export {};
//# sourceMappingURL=asyncHandler.d.ts.map