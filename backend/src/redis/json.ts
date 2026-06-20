export function parseRedisJson<T>(raw: string): T {
  const parsed = JSON.parse(raw) as unknown;
  return parsed as T;
}
