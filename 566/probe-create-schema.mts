// Probe for #566: POST /api/sessions validation parity at whichever SHA is checked out.
// Real sessions router + errorHandler; the SessionService is a recorder.
import { createRequire } from 'node:module';

const WT = process.env.WT!;
const require = createRequire(WT + '/backend/package.json');
const express = require('express');
const request = require('supertest');

const { createSessionsRouter } = await import(WT + '/backend/src/api/sessions.ts');
const { errorHandler } = await import(WT + '/backend/src/middleware/errorHandler.ts');

let seen: unknown;
const warns: unknown[] = [];
const service = {
  createSession: async (hostName: string, opts: unknown) => {
    seen = { hostName, opts };
    throw new Error('probe-stop');
  },
};
const noop = () => undefined;
const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  req.log = { warn: (o: unknown) => warns.push(o), info: noop, error: noop, child: () => req.log };
  next();
});
app.use('/api/sessions', createSessionsRouter(service as any));
app.use(errorHandler);

const craving = { mealType: 'main course', cuisines: [], diets: [] };
const cases: Record<string, unknown> = {
  minimal: { hostName: 'A' },
  deck4: { hostName: 'A', deckSize: 4 },
  deck51: { hostName: 'A', deckSize: 51 },
  deck5_5: { hostName: 'A', deckSize: 5.5 },
  deck50: { hostName: 'A', deckSize: 50 },
  radius0_9: { hostName: 'A', searchRadiusMiles: 0.9 },
  radius15_1: { hostName: 'A', searchRadiusMiles: 15.1 },
  radius1: { hostName: 'A', searchRadiusMiles: 1 },
  radius15: { hostName: 'A', searchRadiusMiles: 15 },
  headcount0: { hostName: 'A', headcount: 0 },
  headcount1_5: { hostName: 'A', headcount: 1.5 },
  extraKeys: { hostName: 'A', unknownKey: 1, sessionCode: 'ABCDE', revision: 1 },
  name51: { hostName: 'x'.repeat(51) },
  name50padded: { hostName: `  ${'x'.repeat(50)}  ` },
  locatedNoRadius: { hostName: 'A', location: { latitude: 1, longitude: 2 } },
  cookNoHeadcount: { hostName: 'A', branch: 'cook', craving },
  cookFull: { hostName: 'A', branch: 'cook', craving, headcount: 4, deckSize: 10 },
  deckString: { hostName: 'A', deckSize: '10' },
};
for (const [name, body] of Object.entries(cases)) {
  seen = undefined;
  warns.length = 0;
  const res = await request(app).post('/api/sessions').send(body);
  console.log(
    name,
    res.status,
    res.status === 400 ? JSON.stringify(warns) : JSON.stringify(seen)
  );
}
process.exit(0);
