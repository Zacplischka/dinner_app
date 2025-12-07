// JWT Authentication Middleware for Supabase Auth
// Verifies Supabase JWT tokens and extracts user information

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

// Extend Express Request to include user info
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

interface SupabaseJwtPayload {
  sub: string; // User ID
  email?: string;
  role?: string;
  aud: string;
  exp: number;
  iat: number;
}

/**
 * Optional auth middleware - extracts user info if token is present
 * Does not require authentication, but populates req.user if valid token exists
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided - continue without auth
    return next();
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!config.supabase.jwtSecret) {
    console.warn('SUPABASE_JWT_SECRET not configured - skipping token verification');
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.supabase.jwtSecret) as SupabaseJwtPayload;

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    // Invalid token - continue without auth (optional auth doesn't reject)
    console.warn('Invalid JWT token:', error instanceof Error ? error.message : 'Unknown error');
    next();
  }
}

/**
 * Required auth middleware - rejects requests without valid token
 * Use this for protected routes
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
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
    res.status(500).json({
      error: 'server_error',
      code: 'AUTH_NOT_CONFIGURED',
      message: 'Authentication not configured',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.supabase.jwtSecret) as SupabaseJwtPayload;

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'unauthorized',
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired',
      });
      return;
    }

    res.status(401).json({
      error: 'unauthorized',
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token',
    });
  }
}

/**
 * Verify a JWT token and return the user info
 * Useful for Socket.IO authentication
 */
export function verifyToken(token: string): { id: string; email?: string; role?: string } | null {
  if (!config.supabase.jwtSecret) {
    console.warn('SUPABASE_JWT_SECRET not configured - cannot verify token');
    return null;
  }

  try {
    const decoded = jwt.verify(token, config.supabase.jwtSecret) as SupabaseJwtPayload;
    return {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };
  } catch (error) {
    console.warn('Token verification failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}
