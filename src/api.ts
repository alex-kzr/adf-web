import type { Page } from './models.ts';
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;
  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  revision?: number;
  signal?: AbortSignal;
  idempotencyKey?: string;
}
export class ApiClient {
  private token: string;
  private unauthorized?: () => void;
  constructor(token: string, unauthorized?: () => void) {
    this.token = token;
    this.unauthorized = unauthorized;
  }
  headers(): Headers {
    return new Headers({ Authorization: `Bearer ${this.token}` });
  }
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!path.startsWith('/api/') || path.includes('://'))
      throw new Error('Only same-origin API routes are allowed.');
    const method = options.method ?? 'GET';
    const headers = this.headers();
    headers.set('Accept', 'application/json');
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.revision !== undefined) headers.set('If-Match', String(options.revision));
    if (method !== 'GET')
      headers.set('Idempotency-Key', options.idempotencyKey ?? crypto.randomUUID());
    const response = await fetch(path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response.ok) {
      let error: { code?: string; message?: string; details?: unknown; request_id?: string } = {};
      try {
        error = await response.json();
      } catch {
        /* Reverse proxy errors need a bounded fallback. */
      }
      if (response.status === 401) this.unauthorized?.();
      throw new ApiError(
        response.status,
        error.code ?? `HTTP_${response.status}`,
        error.message ?? `Request failed (${response.status}).`,
        error.details,
        error.request_id,
      );
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { signal });
  }
  list<T>(
    resource: string,
    filters: Record<string, string | undefined> = {},
    signal?: AbortSignal,
  ): Promise<Page<T>> {
    const query = new URLSearchParams({ limit: '200' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    return this.get(`/api/${resource}?${query}`, signal);
  }
  async artifact(id: string, signal?: AbortSignal): Promise<Blob> {
    const response = await fetch(`/api/artifacts/${encodeURIComponent(id)}/content`, {
      headers: this.headers(),
      credentials: 'omit',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      if (response.status === 401) this.unauthorized?.();
      throw new ApiError(
        response.status,
        'ARTIFACT_UNAVAILABLE',
        'Artifact could not be downloaded.',
      );
    }
    return response.blob();
  }
  async downloadArtifact(id: string, signal?: AbortSignal): Promise<void> {
    const url = URL.createObjectURL(await this.artifact(id, signal));
    const a = document.createElement('a');
    a.href = url;
    a.download = `adf-artifact-${id}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export const errorMessage = (error: unknown): string =>
  error instanceof ApiError
    ? `${error.message} [${error.code}]${error.requestId ? ` · request ${error.requestId}` : ''}`
    : error instanceof Error
      ? error.message
      : 'The request could not be completed.';

/** Retain a request key after an uncertain transport failure until a receipt arrives. */
export class IdempotencyKeys {
  private pending = new Map<string, string>();
  private signature(value: unknown): string {
    return JSON.stringify(value);
  }
  get(value: unknown): string {
    const signature = this.signature(value);
    let key = this.pending.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      this.pending.set(signature, key);
    }
    return key;
  }
  complete(value: unknown): void {
    this.pending.delete(this.signature(value));
  }
}
