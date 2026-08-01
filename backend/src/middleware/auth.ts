// Authentication middleware for Supabase Auth
// Verifies Supabase access tokens with the Auth service and extracts user information

import { logger } from '../logger.js';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { supabase } from '../services/supabase.js';

// The user attached to a request once authenticated; AuthenticatedRequest
// below is the Express Request extension that carries it.
export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  role?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

// Two arms: a user, or the reason there isn't one. Callers that care whether the
// reason was expiry read it off `message` themselves.
type TokenVerification = { user: AuthenticatedUser } | { user: null; message: string };

function isSupabaseAuthConfigured(): boolean {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

// Supabase hands back plain `{ message }` objects as often as real Errors, and a
// transport failure can reject with anything at all.
function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return 'Unknown error';
}

async function verifyTokenInternal(token: string): Promise<TokenVerification> {
  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error) return { user: null, message: errorMessage(error) };
    if (!data.user) return { user: null, message: 'No user returned for token' };

    const authUser = data.user as SupabaseAuthUser;
    const appMetadataRole = authUser.app_metadata?.role;

    return {
      user: {
        id: authUser.id,
        email: authUser.email || undefined,
        role: authUser.role || (typeof appMetadataRole === 'string' ? appMetadataRole : undefined),
      },
    };
  } catch (error) {
    return { user: null, message: errorMessage(error) };
  }
}

/**
 * Required auth middleware - rejects requests without valid token
 * Use this for protected routes
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      code: 'MISSING_TOKEN',
      message: 'Authentication required',
    });
    return;
  }

  const token = authHeader.substring(7);

  if (!isSupabaseAuthConfigured()) {
    logger.warn('Supabase Auth is not configured - rejecting authenticated request');
    // A server misconfiguration is an internal failure; never expose it as a
    // distinct public code, or the body leaks a deployment detail.
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
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

    if (result.message.toLowerCase().includes('expired')) {
      logger.warn({ detail: result.message }, 'Expired JWT token');
      res.status(401).json({
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired',
      });
      return;
    }

    logger.warn({ detail: result.message }, 'Invalid JWT token');
    res.status(401).json({
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token',
    });
  })();
}

/**
 * Verify a Supabase access token and return the user info.
 * Useful for Socket.IO authentication
 */
export async function verifyToken(token: string): Promise<AuthenticatedUser | null> {
  if (!isSupabaseAuthConfigured()) {
    logger.warn('Supabase Auth is not configured - cannot verify token');
    return null;
  }

  const result = await verifyTokenInternal(token);
  if (result.user) {
    return result.user;
  }

  logger.warn({ detail: result.message }, 'Token verification failed');
  return null;
}
