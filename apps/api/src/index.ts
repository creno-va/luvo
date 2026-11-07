import { createDb, appMetadata } from '@luvo/db';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { prescriptions } from './prescriptions';
import { briefings } from './briefings';
import { medications } from './medications';
import { chat } from './chat';

const app = new Hono<{ Bindings: ApiBindings }>();

app.use('*', secureHeaders());
app.route('/api/prescriptions', prescriptions);
app.route('/api/briefings', briefings);
app.route('/api/medications', medications);
app.route('/api/chat', chat);

app.get('/api', (c) => c.json({ name: 'luvo-api', version: '0.0.0' }));

app.get('/api/health', (c) => c.json({ status: 'ok', service: 'luvo-api' }));

app.get('/api/health/db', async (c) => {
  c.header('Cache-Control', 'no-store');

  try {
    const db = createDb(c.env.DB);
    await db.select({ key: appMetadata.key }).from(appMetadata).limit(1);
    return c.json({ status: 'ok', database: 'd1' });
  } catch (error) {
    console.error('D1 readiness check failed', error);
    return c.json({ status: 'error', database: 'd1' }, 503);
  }
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Internal server error' }, 500);
});

export type AppType = typeof app;
export default app;
