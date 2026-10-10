import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventBuffer, SseParser } from '../src/sse.ts';

test('fragmented CRLF, heartbeats and multiline data are parsed without losing the cursor', () => {
  const parser = new SseParser();
  assert.deepEqual(parser.push(': heartbeat\r\n\r\nid: 1\r\nevent: run.'), []);
  const result = parser.push(
    'status_changed\r\ndata: {"event_id":"event-1",\r\ndata: "type":"run.status_changed","payload":{}}\r\n\r\n',
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, '1');
  assert.equal(result[0].event, 'run.status_changed');
  assert.equal(JSON.parse(result[0].data).event_id, 'event-1');
});
test('at-least-once replay deduplicates events, advances cursor and caps retained rows', () => {
  const buffer = new EventBuffer();
  for (let i = 1; i <= 250; i++)
    buffer.accept({
      id: String(i),
      data: JSON.stringify({
        event_id: `event-${i}`,
        type: 'output',
        payload: { text: '<script>escaped by React</script>' },
      }),
    });
  assert.equal(buffer.items.length, 200);
  assert.equal(buffer.items[0].event_id, 'event-51');
  assert.equal(buffer.cursor, '250');
  assert.equal(
    buffer.accept({
      id: '250',
      data: JSON.stringify({ event_id: 'event-250', type: 'output', payload: {} }),
    }),
    null,
  );
});
test('malformed and oversized frames fail without becoming accepted progress', () => {
  const parser = new SseParser();
  assert.throws(() => parser.push(`data: ${'a'.repeat(65537)}\n`), /64 KiB/);
  const buffer = new EventBuffer();
  assert.throws(() => buffer.accept({ data: '{invalid' }), /invalid JSON/);
  assert.throws(
    () => buffer.accept({ data: JSON.stringify({ type: 'completed' }) }),
    /invalid event envelope/,
  );
  assert.equal(buffer.items.length, 0);
});

test('batched valid frames are accepted even when the network chunk exceeds 128 KiB', () => {
  const parser = new SseParser();
  const frame = `id: 1\ndata: ${JSON.stringify({ event_id: 'event-1', type: 'output', payload: { text: 'a'.repeat(1000) } })}\n\n`;
  assert.equal(parser.push(frame.repeat(200)).length, 200);
});
test('UTF-8 event limits and monotonic replay cursors are enforced', () => {
  assert.throws(() => new SseParser().push(`data: ${'🙂'.repeat(20000)}\n`), /64 KiB/);
  const buffer = new EventBuffer();
  const data = JSON.stringify({ event_id: 'same', type: 'output', payload: {} });
  buffer.accept({ id: '12', data });
  buffer.accept({ id: '8', data });
  assert.equal(buffer.cursor, '12');
  assert.throws(
    () => buffer.accept({ data: JSON.stringify({ event_id: 'bad', type: 'output', payload: [] }) }),
    /envelope/,
  );
});

test('the API 60000-byte payload budget fits within the full SSE envelope limit', () => {
  const payload = { text: 'a'.repeat(59980) };
  assert.ok(new TextEncoder().encode(JSON.stringify(payload)).length <= 60000);
  const envelope = {
    event_id: '8eff8418-96ee-49bf-bb27-cd1cd761d9ff',
    run_id: '4edb3739-ac5a-48a8-a066-f5cedd9e21ee',
    run_sequence: 500,
    type: 'execution.output',
    time: new Date().toISOString(),
    payload,
  };
  const frame = `id: 500\nevent: execution.output\ndata: ${JSON.stringify(envelope)}\n\n`;
  const parser = new SseParser();
  const buffer = new EventBuffer();
  const [parsed] = parser.push(frame);
  assert.equal(buffer.accept(parsed)?.event_id, envelope.event_id);
  assert.equal(buffer.cursor, '500');
});
