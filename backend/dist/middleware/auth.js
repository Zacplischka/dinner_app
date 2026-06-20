import { config } from '../config/index.js';
import { supabase } from '../services/supabase.js';
function isSupabaseAuthConfigured() {
    return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (error && typeof error === 'object' && 'message' in error) {
        const message = error.message;
        if (typeof message === 'string') {
            return message;
        }
    }
    return 'Unknown error';
}
function getFailureReason(message) {
    return message.toLowerCase().includes('expired') ? 'expired' : 'invalid';
}
function mapSupabaseUser(user) {
    const appMetadataRole = user.app_metadata?.role;
    const role = user.role || (typeof appMetadataRole === 'string' ? appMetadataRole : undefined);
    return {
        id: user.id,
        email: user.email || undefined,
        role,
    };
}
async function verifyTokenInternal(token) {
    try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) {
            const message = error ? getErrorMessage(error) : 'No user returned for token';
            return {
                user: null,
                failure: getFailureReason(message),
                message,
            };
        }
        return {
            user: mapSupabaseUser(data.user),
        };
    }
    catch (error) {
        const message = getErrorMessage(error);
        return {
            user: null,
            failure: getFailureReason(message),
            message,
        };
    }
}
export function optionalAuth(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }
    const token = authHeader.substring(7);
    if (!isSupabaseAuthConfigured()) {
        console.warn('Supabase Auth is not configured - skipping token verification');
        return next();
    }
    void (async () => {
        const result = await verifyTokenInternal(token);
        if (result.user) {
            req.user = result.user;
        }
        else {
            console.warn('Token verification failed:', result.message);
        }
        next();
    })();
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
    if (!isSupabaseAuthConfigured()) {
        console.warn('Supabase Auth is not configured - rejecting authenticated request');
        res.status(500).json({
            error: 'server_error',
            code: 'AUTH_NOT_CONFIGURED',
            message: 'Authentication not configured',
        });
        return;
    }
    void (async () => {
        const result = await verifyTokenInternal(token);
        if (result.user) {
            req.user = result.user;
            next();
            return;
        }
        if (result.failure === 'expired') {
            console.warn('Expired JWT token:', result.message);
            res.status(401).json({
                error: 'unauthorized',
                code: 'TOKEN_EXPIRED',
                message: 'Token has expired',
            });
            return;
        }
        console.warn('Invalid JWT token:', result.message);
        res.status(401).json({
            error: 'unauthorized',
            code: 'INVALID_TOKEN',
            message: 'Invalid authentication token',
        });
    })();
}
export async function verifyToken(token) {
    if (!isSupabaseAuthConfigured()) {
        console.warn('Supabase Auth is not configured - cannot verify token');
        return null;
    }
    const result = await verifyTokenInternal(token);
    if (result.user) {
        return result.user;
    }
    console.warn('Token verification failed:', result.message);
    return null;
}
//# sourceMappingURL=auth.js.map