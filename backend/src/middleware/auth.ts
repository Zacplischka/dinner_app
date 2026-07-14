// Authentication middleware for Supabase Auth
// Verifies Supabase access tokens with the Auth service and extracts user information

import { logger } from '../logger.js';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { supabase } from '../services/supabase.js';

// Extend Express Request to include user info
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

type TokenVerificationFailure = 'expired' | 'invalid';

type TokenVerificationResult =
  | { user: AuthenticatedUser; failure?: never; message?: never }
  | { user: null; failure: TokenVerificationFailure; message: string };

function isSupabaseAuthConfigured(): boolean {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

function getErrorMessage(error: unknown): string {
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

function getFailureReason(message: string): TokenVerificationFailure {
  return message.toLowerCase().includes('expired') ? 'expired' : 'invalid';
}

function mapSupabaseUser(user: SupabaseAuthUser): AuthenticatedUser {
  const appMetadataRole = user.app_metadata?.role;
  const role = user.role || (typeof appMetadataRole === 'string' ? appMetadataRole : undefined);

  return {
    id: user.id,
    email: user.email || undefined,
    role,
  };
}

async function verifyTokenInternal(token: string): Promise<TokenVerificationResult> {
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
      user: mapSupabaseUser(data.user as SupabaseAuthUser),
    };
  } catch (error) {
    const message = getErrorMessage(error);
    return {
      user: null,
      failure: getFailureReason(message),
      message,
    };
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

  if (!isSupabaseAuthConfigured()) {
    logger.warn('Supabase Auth is not configured - rejecting authenticated request');
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
      logger.warn({ detail: result.message }, 'Expired JWT token');
      res.status(401).json({
        error: 'unauthorized',
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired',
      });
      return;
    }

    logger.warn({ detail: result.message }, 'Invalid JWT token');
    res.status(401).json({
      error: 'unauthorized',
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
