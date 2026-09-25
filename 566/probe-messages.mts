// Probe for #566: the two validation messages now built from shared constants.
import { createRequire } from 'node:module';

const WT = process.env.WT!;
const require = createRequire(WT + '/backend/package.json');
const express = require('express');
const request = require('supertest');

const { createSessionsRouter } = await import(WT + '/backend/src/api/sessions.ts');
const { createComparisonRouter } = await import(WT + '/backend/src/api/comparison.ts');
const { errorHandler } = await import(WT + '/backend/src/middleware/errorHandler.ts');
const { parseVenueSearchRequest } = await import(WT + '/shared/types/comparison-contract.ts');

const noop = () => undefined;
const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  req.log = { warn: noop, info: noop, error: noop, child: () => req.log };
  next();
});
app.use('/api/sessions', createSessionsRouter({} as any));
app.use('/api/comparison', createComparisonRouter({ searchNearbyVenues: async () => [] } as any));
app.use(errorHandler);

const s = await request(app).post('/api/sessions').send({});
console.log('sessions 400:', s.status, s.body.message);
const v = await request(app).get('/api/comparison/venues?latitude=1&longitude=2&radiusMiles=16');
console.log('venues 400:', v.status, v.body.message);
const q = (r: string) =>
  parseVenueSearchRequest({ latitude: '1', longitude: '2', radiusMiles: r }) ? 'ok' : 'rejected';
console.log('venue radius 0.99/1/15/15.01:', ['0.99', '1', '15', '15.01'].map(q).join(','));
process.exit(0);
