import { describe, expect, it } from 'vitest';
import {
  getSocketAuthToken,
  getSocketUser,
  setSocketUser,
} from '../../src/websocket/socketAuth.js';

describe('socket auth helpers', () => {
  it('should store authenticated users on socket data', () => {
    const socket = { data: {} };
    const user = {
      id: 'user-1',
      email: 'alice@example.com',
      role: 'authenticated',
    };

    setSocketUser(socket, user);

    expect(getSocketUser(socket)).toEqual(user);
  });

  it('should read string auth tokens from unknown handshake auth data', () => {
    expect(getSocketAuthToken({ token: 'jwt-token' })).toBe('jwt-token');
    expect(getSocketAuthToken({ token: 123 })).toBeUndefined();
    expect(getSocketAuthToken(null)).toBeUndefined();
  });
});
