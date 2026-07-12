import { logger } from '../../src/logger.js';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  optionalAuth,
  requireAuth,
  verifyToken,
  type AuthenticatedRequest,
} from '../../src/middleware/auth.js';
import { config } from '../../src/config/index.js';

const supabaseMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock('../../src/services/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: supabaseMocks.getUser,
    },
  },
}));

describe('auth middleware', () => {
  beforeEach(() => {
    config.supabase.url = 'https://supabase.example.test';
    config.supabase.serviceRoleKey = 'service-role-key';
  });

  afterEach(() => {
    config.supabase.url = '';
    config.supabase.serviceRoleKey = '';
    vi.restoreAllMocks();
    supabaseMocks.getUser.mockReset();
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

  async function flushAsyncAuth() {
    await new Promise((resolve) => setImmediate(resolve));
  }

  function mockSupabaseUser(overrides: Record<string, unknown> = {}) {
    supabaseMocks.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-1',
          email: 'alice@example.com',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          ...overrides,
        },
      },
      error: null,
    });
  }

  describe('optionalAuth', () => {
    it('should continue without user when token is missing', () => {
      const req = request();
      const next = vi.fn();

      optionalAuth(req, response() as any, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
      expect(supabaseMocks.getUser).not.toHaveBeenCalled();
    });

    it('should continue without user when auth header is not a bearer token', () => {
      const req = request('Basic abc');
      const next = vi.fn();

      optionalAuth(req, response() as any, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
      expect(supabaseMocks.getUser).not.toHaveBeenCalled();
    });

    it('should skip verification when Supabase Auth is not configured', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      config.supabase.serviceRoleKey = '';
      const req = request('Bearer token');
      const next = vi.fn();

      optionalAuth(req, response() as any, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
      expect(supabaseMocks.getUser).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        'Supabase Auth is not configured - skipping token verification'
      );
    });

    it('should attach user after Supabase Auth validates a bearer token', async () => {
      mockSupabaseUser();
      const req = request('Bearer valid-token');
      const next = vi.fn();

      optionalAuth(req, response() as any, next);
      await flushAsyncAuth();

      expect(supabaseMocks.getUser).toHaveBeenCalledWith('valid-token');
      expect(req.user).toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        role: 'authenticated',
      });
      expect(next).toHaveBeenCalledOnce();
    });

    it('should continue without user for an invalid token', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      supabaseMocks.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'invalid JWT' },
      });
      const req = request('Bearer invalid-token');
      const next = vi.fn();

      optionalAuth(req, response() as any, next);
      await flushAsyncAuth();

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith({ detail: 'invalid JWT' }, 'Token verification failed');
    });

    it('should continue without user when Supabase Auth throws a non-Error value', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      supabaseMocks.getUser.mockRejectedValueOnce('offline');
      const req = request('Bearer token');
      const next = vi.fn();

      optionalAuth(req, response() as any, next);
      await flushAsyncAuth();

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith({ detail: 'Unknown error' }, 'Token verification failed');
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
      expect(supabaseMocks.getUser).not.toHaveBeenCalled();
    });

    it('should reject requests when Supabase Auth is not configured', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      config.supabase.url = '';
      const res = response();

      requireAuth(request('Bearer token'), res as any, vi.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'server_error',
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Authentication not configured',
      });
      expect(supabaseMocks.getUser).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        'Supabase Auth is not configured - rejecting authenticated request'
      );
    });

    it('should attach user and continue for a valid token', async () => {
      mockSupabaseUser();
      const req = request('Bearer valid-token');
      const next = vi.fn();

      requireAuth(req, response() as any, next);
      await flushAsyncAuth();

      expect(supabaseMocks.getUser).toHaveBeenCalledWith('valid-token');
      expect(req.user).toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        role: 'authenticated',
      });
      expect(next).toHaveBeenCalledOnce();
    });

    it('should reject expired tokens', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      supabaseMocks.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'JWT expired' },
      });
      const res = response();

      requireAuth(request('Bearer expired-token'), res as any, vi.fn());
      await flushAsyncAuth();

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'unauthorized',
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired',
      });
      expect(warnSpy).toHaveBeenCalledWith({ detail: 'JWT expired' }, 'Expired JWT token');
    });

    it('should reject invalid tokens', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      supabaseMocks.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'invalid JWT' },
      });
      const res = response();

      requireAuth(request('Bearer invalid-token'), res as any, vi.fn());
      await flushAsyncAuth();

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'unauthorized',
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
      });
      expect(warnSpy).toHaveBeenCalledWith({ detail: 'invalid JWT' }, 'Invalid JWT token');
    });
  });

  describe('verifyToken', () => {
    it('should return null when Supabase Auth is not configured', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      config.supabase.serviceRoleKey = '';

      await expect(verifyToken('token')).resolves.toBeNull();
      expect(supabaseMocks.getUser).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        'Supabase Auth is not configured - cannot verify token'
      );
    });

    it('should return user info after Supabase Auth validates a token', async () => {
      mockSupabaseUser();

      await expect(verifyToken('valid-token')).resolves.toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        role: 'authenticated',
      });
      expect(supabaseMocks.getUser).toHaveBeenCalledWith('valid-token');
    });

    it('should fall back to app metadata role when the auth user has no top-level role', async () => {
      mockSupabaseUser({
        role: undefined,
        app_metadata: { role: 'admin' },
      });

      await expect(verifyToken('valid-token')).resolves.toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        role: 'admin',
      });
    });

    it('should return null for an invalid token', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      supabaseMocks.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'invalid JWT' },
      });

      await expect(verifyToken('invalid-token')).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith({ detail: 'invalid JWT' }, 'Token verification failed');
    });

    it('should return null when Supabase Auth throws a non-Error value', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      supabaseMocks.getUser.mockRejectedValueOnce('offline');

      await expect(verifyToken('invalid-token')).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith({ detail: 'Unknown error' }, 'Token verification failed');
    });
  });
});
