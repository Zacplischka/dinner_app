import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
export function optionalAuth(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }
    const token = authHeader.substring(7);
    if (!config.supabase.jwtSecret) {
        console.warn('SUPABASE_JWT_SECRET not configured - skipping token verification');
        return next();
    }
    try {
        const decoded = jwt.verify(token, config.supabase.jwtSecret);
        req.user = {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
        };
        next();
    }
    catch (error) {
        console.warn('Invalid JWT token:', error instanceof Error ? error.message : 'Unknown error');
        next();
    }
}
export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            error: 'unauthorized',
            code: 'MISSING_TOKEN',
            message: 'Authentication required',
        });
        return;
    }
    const token = authHeader.substring(7);
    if (!config.supabase.jwtSecret) {
        console.warn('SUPABASE_JWT_SECRET not configured - rejecting authenticated request');
        res.status(500).json({
            error: 'server_error',
            code: 'AUTH_NOT_CONFIGURED',
            message: 'Authentication not configured',
        });
        return;
    }
    try {
        const decoded = jwt.verify(token, config.supabase.jwtSecret);
        req.user = {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
        };
        next();
    }
    catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            console.warn('Expired JWT token:', error.message);
            res.status(401).json({
                error: 'unauthorized',
                code: 'TOKEN_EXPIRED',
                message: 'Token has expired',
            });
            return;
        }
        console.warn('Invalid JWT token:', error instanceof Error ? error.message : 'Unknown error');
        res.status(401).json({
            error: 'unauthorized',
            code: 'INVALID_TOKEN',
            message: 'Invalid authentication token',
        });
    }
}
export function verifyToken(token) {
    if (!config.supabase.jwtSecret) {
        console.warn('SUPABASE_JWT_SECRET not configured - cannot verify token');
        return null;
    }
    try {
        const decoded = jwt.verify(token, config.supabase.jwtSecret);
        return {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
        };
    }
    catch (error) {
        console.warn('Token verification failed:', error instanceof Error ? error.message : 'Unknown error');
        return null;
    }
}
//# sourceMappingURL=auth.js.map