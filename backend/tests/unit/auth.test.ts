import { describe, it, expect, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  optionalAuth,
  requireAuth,
  verifyToken,
  type AuthenticatedRequest,
} from '../../src/middleware/auth.js';
import { config } from '../../src/config/index.js';

describe('auth middleware', () => {
  const secret = 'test-secret';

  afterEach(() => {
    config.supabase.jwtSecret = '';
    vi.restoreAllMocks();
  });

  function response() {
    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  }

  function request(authorization?: string): AuthenticatedRequest {
    return {
      headers: authorization ? { authorization } : {},
    } as AuthenticatedRequest;
  }

  function token(payload: Record<string, unknown> = {}) {
    return jwt.sign(
      {
        sub: 'user-1',
        email: 'alice@example.com',
        role: 'authenticated',
        aud: 'authenticated',
        ...payload,
      },
      secret,
      { expiresIn: '1h' }
    );
  }

  describe('optionalAuth', () => {
    it('should continue without user when token is missing', () => {
      const req = request();
      const next = vi.fn();

      optionalAuth(req, response() as any, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
    });

    it('should continue without user when auth header is not a bearer token', () => {
      const req = request('Basic abc');
      const next = vi.fn();

      optionalAuth(req, response() as any, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
    });

    it('should skip verification when JWT secret is not configured', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const req = request(`Bearer ${token()}`);
      const next = vi.fn();

      optionalAuth(req, response() as any, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        'SUPABASE_JWT_SECRET not configured - skipping token verification'
      );
    });

    it('should attach user for a valid token', () => {
      config.supabase.jwtSecret = secret;
      const req = request(`Bearer ${token()}`);
      const next = vi.fn();

      optionalAuth(req, response() as any, next);

      expect(req.user).toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        role: 'authenticated',
      });
      expect(next).toHaveBeenCalledOnce();
    });

    it('should continue without user for an invalid token', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      config.supabase.jwtSecret = secret;
      const req = request('Bearer invalid-token');
      const next = vi.fn();

      optionalAuth(req, response() as any, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        'Invalid JWT token:',
        expect.stringContaining('jwt malformed')
      );
    });

    it('should continue without user when token verification throws a non-Error value', () => {
      config.supabase.jwtSecret = secret;
      vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw 'invalid';
      });
      const req = request('Bearer token');
      const next = vi.fn();

      optionalAuth(req, response() as any, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('requireAuth', () => {
    it('should reject requests without a bearer token', () => {
      const res = response();

      requireAuth(request(), res as any, vi.fn());

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'unauthorized',
        code: 'MISSING_TOKEN',
        message: 'Authentication required',
      });
    });

    it('should reject requests when auth is not configured', () => {
      const res = response();

      requireAuth(request(`Bearer ${token()}`), res as any, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'server_error',
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Authentication not configured',
      });
    });

    it('should attach user and continue for a valid token', () => {
      config.supabase.jwtSecret = secret;
      const req = request(`Bearer ${token()}`);
      const next = vi.fn();

      requireAuth(req, response() as any, next);

      expect(req.user).toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        role: 'authenticated',
      });
      expect(next).toHaveBeenCalledOnce();
    });

    it('should reject expired tokens', () => {
      config.supabase.jwtSecret = secret;
      const expiredToken = jwt.sign(
        {
          sub: 'user-1',
          aud: 'authenticated',
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        secret
      );
      const res = response();

      requireAuth(request(`Bearer ${expiredToken}`), res as any, vi.fn());

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'unauthorized',
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired',
      });
    });

    it('should reject invalid tokens', () => {
      config.supabase.jwtSecret = secret;
      const res = response();

      requireAuth(request('Bearer invalid-token'), res as any, vi.fn());

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'unauthorized',
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
      });
    });
  });

  describe('verifyToken', () => {
    it('should return null when JWT secret is not configured', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(verifyToken(token())).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        'SUPABASE_JWT_SECRET not configured - cannot verify token'
      );
    });

    it('should return user info for a valid token', () => {
      config.supabase.jwtSecret = secret;

      expect(verifyToken(token())).toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        role: 'authenticated',
      });
    });

    it('should return null for an invalid token', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      config.supabase.jwtSecret = secret;

      expect(verifyToken('invalid-token')).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        'Token verification failed:',
        expect.stringContaining('jwt malformed')
      );
    });

    it('should return null when verification throws a non-Error value', () => {
      config.supabase.jwtSecret = secret;
      vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw 'invalid';
      });

      expect(verifyToken('invalid-token')).toBeNull();
    });
  });
});
