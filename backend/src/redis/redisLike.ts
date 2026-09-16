// The slice of ioredis the services depend on, structural so a test can hand
// in ioredis-mock or a plain fake instead of the client.

/** The chained MULTI builder, narrowed to the commands a Claim or swap needs. */
export interface RedisMulti {
  hsetnx(key: string, field: string, value: string): RedisMulti;
  hset(key: string, field: string, value: string): RedisMulti;
  pexpireat(key: string, timestampMs: number): RedisMulti;
  exec(): Promise<unknown>;
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  hdel(key: string, field: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  multi(): RedisMulti;
}
