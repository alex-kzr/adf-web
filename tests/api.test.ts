import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ApiClient, ApiError, IdempotencyKeys } from '../src/api.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
test('bearer stays in a header; mutations bind revision and an explicit retry key', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ id: 'run-1' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const api = new ApiClient('sentinel-admin');
  await api.request('/api/runs', {
    method: 'POST',
    revision: 4,
    idempotencyKey: 'same-command',
    body: { task_id: 'task-1' },
  });
  const headers = new Headers(calls[0].options?.headers);
  assert.equal(calls[0].url, '/api/runs');
  assert.equal(headers.get('Authorization'), 'Bearer sentinel-admin');
  assert.equal(headers.get('If-Match'), '4');
  assert.equal(headers.get('Idempotency-Key'), 'same-command');
  assert.equal(calls[0].options?.credentials, 'omit');
  assert.ok(!calls[0].url.includes('sentinel-admin'));
});
test('unauthorized clears the session and redacted API conflicts preserve their code', async () => {
  let locked = false;
  const api = new ApiClient('token', () => {
    locked = true;
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ code: 'AUTH_REQUIRED', message: 'Reconnect', request_id: 'req-1' }),
      { status: 401 },
    );
  await assert.rejects(
    api.get('/api/projects'),
    (error: unknown) =>
      error instanceof ApiError && error.code === 'AUTH_REQUIRED' && error.requestId === 'req-1',
  );
  assert.equal(locked, true);
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ code: 'VERSION_CONFLICT', message: 'Reload the changed snapshot' }),
      { status: 412 },
    );
  await assert.rejects(
    api.request('/api/tasks/id', { method: 'PATCH', revision: 1, body: {} }),
    (error: unknown) =>
      error instanceof ApiError && error.status === 412 && error.code === 'VERSION_CONFLICT',
  );
});
test('proxy failures produce a bounded actionable fallback; external routes are refused', async () => {
  globalThis.fetch = async () => new Response('<html>Proxy unavailable</html>', { status: 502 });
  const api = new ApiClient('token');
  await assert.rejects(
    api.get('/api/projects'),
    (error: unknown) => error instanceof ApiError && error.message === 'Request failed (502).',
  );
  await assert.rejects(api.get('https://example.com/api/projects'), /same-origin/);
});

test('uncertain mutation retries retain the same key; changed scope gets a new key', () => {
  const keys = new IdempotencyKeys();
  const request = { path: '/api/runs', body: { task_id: 'task-1' }, revision: 1 };
  const first = keys.get(request);
  assert.equal(keys.get({ ...request }), first);
  assert.notEqual(keys.get({ ...request, revision: 2 }), first);
  keys.complete(request);
  assert.notEqual(keys.get(request), first);
});

test('protected artifacts use bearer headers and clear the session on expiry', async () => {
  let locked = false;
  let headers = new Headers();
  let route = '';
  globalThis.fetch = async (url, options) => {
    headers = new Headers(options?.headers);
    route = String(url);
    return new Response('escaped artifact', { headers: { 'Content-Type': 'text/plain' } });
  };
  const api = new ApiClient('sentinel-artifact', () => {
    locked = true;
  });
  assert.equal(await (await api.artifact('artifact-id')).text(), 'escaped artifact');
  assert.equal(route, '/api/artifacts/artifact-id/content');
  assert.equal(headers.get('Authorization'), 'Bearer sentinel-artifact');
  assert.ok(!route.includes('sentinel-artifact'));
  globalThis.fetch = async () => new Response('', { status: 401 });
  await assert.rejects(
    api.artifact('artifact-id'),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(locked, true);
});
