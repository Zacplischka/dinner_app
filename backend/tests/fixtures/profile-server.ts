// Disposable browser-test backend. Real HTTP/auth middleware, stores and Session commands;
// only the Supabase network boundary is a deterministic, non-customer fixture.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const names = ['Alice', 'Bob', 'Cara', 'Dan'];
const profiles = new Map(
  names.map((name, i) => {
    const id = `00000000-0000-4000-8000-00000000000${i + 1}`;
    return [
      id,
      {
        id,
        display_name: name,
        email: `${name.toLowerCase()}@example.test`,
        avatar_url: null as string | null,
      },
    ];
  })
);
function authUser(id: string) {
  const row = profiles.get(id);
  return (
    row && {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: row.email,
      app_metadata: { provider: 'google' },
      user_metadata: {
        full_name: row.display_name,
        avatar_url: 'https://example.test/stale-google.jpg',
        id: names[1],
      },
      created_at: '2026-09-09T00:00:00Z',
    }
  );
}
const auth = createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://localhost');
  res.setHeader('Content-Type', 'application/json');
  const reply = (data: unknown, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  if (url.pathname === '/auth/v1/user') {
    const id = req.headers.authorization?.replace('Bearer ', '').split('.').at(-1) ?? '';
    const user = authUser(id);
    return user ? reply(user) : reply({ message: 'Invalid fixture token' }, 401);
  }
  if (url.pathname.startsWith('/auth/v1/admin/users/'))
    return reply(authUser(url.pathname.split('/').at(-1)!));
  if (url.pathname === '/rest/v1/profiles') {
    const id = url.searchParams.get('id')?.replace('eq.', '') ?? '';
    const row = profiles.get(id);
    if (!row) return reply({ code: 'PGRST116' }, 406);
    if (req.method === 'PATCH') {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { avatar_url: string | null };
      row.avatar_url = body.avatar_url;
    }
    return reply(row);
  }
  if (url.pathname.startsWith('/rest/v1/')) return reply([]);
  return reply({});
});
await new Promise<void>((resolve) => auth.listen(0, '127.0.0.1', resolve));
process.env.SUPABASE_URL = `http://127.0.0.1:${(auth.address() as AddressInfo).port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-fixture-only';
const { httpServer } = await import('../../src/server.js');
httpServer.listen(0, '127.0.0.1', () =>
  process.send?.({ url: `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}` })
);
