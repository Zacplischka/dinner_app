import { Request, Response, NextFunction } from 'express';
export interface AuthenticatedUser {
    id: string;
    email?: string;
    role?: string;
}
export interface AuthenticatedRequest extends Request {
    user?: AuthenticatedUser;
}
export declare function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void;
export declare function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
export declare function verifyToken(token: string): Promise<AuthenticatedUser | null>;
//# sourceMappingURL=auth.d.ts.map