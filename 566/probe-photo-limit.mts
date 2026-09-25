// Probe for #566: PUT /api/users/me/photo limiter at whichever SHA is checked out.
// Real friends router + requireAuth + errorHandler; only Supabase getUser and the service are faked.
import { createRequire } from 'node:module';

const WT = process.env.WT!;
const require = createRequire(WT + '/backend/package.json');
const express = require('express');
const request = require('supertest');

const { supabase } = await import(WT + '/backend/src/services/supabase.ts');
(supabase.auth as any).getUser = async (token: string) => ({
  data: { user: token.startsWith('user-') ? { id: token, email: null } : null },
  error: null,
});
const { createFriendsRouter } = await import(WT + '/backend/src/api/friends.ts');
const { errorHandler } = await import(WT + '/backend/src/middleware/errorHandler.ts');

let now = 1_700_000_000_000;
Date.now = () => now;

let saves = 0;
const service = { saveProfilePhoto: async () => ({ avatarUrl: `saved-${++saves}` }) };
const app = express();
app.use(express.json());
app.use('/api', createFriendsRouter(service as any));
app.use(errorHandler);

const put = (token?: string) => {
  const r = request(app).put('/api/users/me/photo').set('Content-Type', 'image/png');
  if (token) r.set('Authorization', `Bearer ${token}`);
  return r.send(Buffer.from([1, 2, 3]));
};

const statuses: number[] = [];
for (let i = 0; i < 6; i++) statuses.push((await put('user-a')).status);
console.log('user-a first 6 statuses:', statuses.join(','));
now += 20_000; // 20 s into the window
const limited = await put('user-a');
console.log(
  'user-a 7th @+20s:',
  limited.status,
  JSON.stringify(limited.body),
  'Retry-After=',
  limited.headers['retry-after']
);
console.log('user-b 1st (same IP, other user):', (await put('user-b')).status);
console.log('no auth:', (await put()).status, JSON.stringify((await put()).body));
console.log('saves reaching service:', saves);
process.exit(0);
