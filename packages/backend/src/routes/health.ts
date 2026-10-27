/** Health route — the one unauthenticated console endpoint (liveness). */
import { Hono } from 'hono';
export function healthRoutes(): Hono {
    const app = new Hono();
    app.get('/', (c) => c.json({ ok: true, service: 'frontbase-console' }));
    return app;
}
