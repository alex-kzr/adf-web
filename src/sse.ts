import type { DomainEvent } from './models.ts';
export interface SseMessage {
  id?: string;
  event?: string;
  data: string;
}
export class SseParser {
  private buffer = '';
  private fields: string[] = [];
  private eventBytes = 0;
  private encoder = new TextEncoder();
  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const messages: SseMessage[] = [];
    let end = this.buffer.indexOf('\n');
    while (end >= 0) {
      let line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') {
        const parsed = this.parse();
        if (parsed) messages.push(parsed);
        this.fields = [];
        this.eventBytes = 0;
      } else if (!line.startsWith(':')) {
        this.fields.push(line);
        this.eventBytes += this.encoder.encode(line).length + 1;
        if (this.eventBytes > 65536) throw new Error('Event stream event exceeded 64 KiB.');
      }
      end = this.buffer.indexOf('\n');
    }
    if (this.encoder.encode(this.buffer).length + this.eventBytes > 65536)
      throw new Error('Event stream event exceeded 64 KiB.');
    return messages;
  }
  private parse(): SseMessage | null {
    const result: SseMessage = { data: '' };
    const data: string[] = [];
    for (const line of this.fields) {
      const index = line.indexOf(':');
      const key = index < 0 ? line : line.slice(0, index);
      let value = index < 0 ? '' : line.slice(index + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (key === 'data') data.push(value);
      if (key === 'id' && !value.includes('\0')) result.id = value;
      if (key === 'event') result.event = value;
    }
    if (!data.length) return null;
    result.data = data.join('\n');
    return result;
  }
}
export class EventBuffer {
  private ids = new Set<string>();
  readonly items: DomainEvent[] = [];
  cursor = '';
  accept(message: SseMessage): DomainEvent | null {
    let value: unknown;
    try {
      value = JSON.parse(message.data);
    } catch {
      throw new Error('Server sent an invalid JSON event.');
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      !('event_id' in value) ||
      typeof value.event_id !== 'string' ||
      !('type' in value) ||
      typeof value.type !== 'string' ||
      !('payload' in value) ||
      typeof value.payload !== 'object' ||
      value.payload === null ||
      Array.isArray(value.payload)
    )
      throw new Error('Server sent an invalid event envelope.');
    const event = value as DomainEvent;
    if (
      message.id !== undefined &&
      /^\d+$/.test(message.id) &&
      BigInt(message.id) > BigInt(this.cursor || '0')
    )
      this.cursor = message.id;
    if (this.ids.has(event.event_id)) return null;
    this.ids.add(event.event_id);
    this.items.push(event);
    while (this.items.length > 200) {
      const first = this.items.shift();
      if (first) this.ids.delete(first.event_id);
    }
    return event;
  }
}
