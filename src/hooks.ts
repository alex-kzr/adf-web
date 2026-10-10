import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { type ApiClient, ApiError, IdempotencyKeys } from './api';
import type { DomainEvent, Page, RunStatus } from './models';
import { EventBuffer, SseParser } from './sse';
export const ApiContext = createContext<ApiClient | null>(null);
export const useApi = (): ApiClient => {
  const api = useContext(ApiContext);
  if (!api) throw new Error('Authenticated API context is missing.');
  return api;
};
export function useList<T>(resource: string, filters: Record<string, string | undefined> = {}) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [resource, filters],
    initialPageParam: null as string | number | null,
    queryFn: ({ signal, pageParam }) =>
      api.list<T>(
        resource,
        {
          ...filters,
          ...(pageParam === null
            ? {}
            : { [resource.endsWith('event-history') ? 'after' : 'cursor']: String(pageParam) }),
        },
        signal,
      ),
    getNextPageParam: (page: Page<T>) => page.next_cursor ?? undefined,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.items),
      next_cursor: data.pages.at(-1)?.next_cursor ?? null,
    }),
  });
}
export function useRecord<T>(path: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: [path], queryFn: ({ signal }) => api.get<T>(path, signal), enabled });
}
export function useCommand() {
  const api = useApi();
  const client = useQueryClient();
  const keys = useRef(new IdempotencyKeys());
  return useMutation({
    mutationFn: ({
      path,
      body,
      revision,
      method = 'POST',
    }: {
      path: string;
      body?: unknown;
      revision?: number;
      method?: 'POST' | 'PATCH' | 'DELETE';
    }) =>
      api.request<unknown>(path, {
        method,
        body: body ?? {},
        revision,
        idempotencyKey: keys.current.get({ path, method, body: body ?? {}, revision }),
      }),
    onSuccess: (_data, variables) => {
      keys.current.complete({
        path: variables.path,
        method: variables.method ?? 'POST',
        body: variables.body ?? {},
        revision: variables.revision,
      });
      return client.invalidateQueries();
    },
    onError: (error) => {
      if (error instanceof ApiError && [409, 412].includes(error.status))
        void client.invalidateQueries();
    },
  });
}
export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'closed' | 'error';
export function useRunEvents(runId: string, status?: RunStatus) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [state, setState] = useState<StreamState>('connecting');
  const [error, setError] = useState('');
  const buffer = useRef(new EventBuffer());
  const latestStatus = useRef(status);
  useEffect(() => {
    latestStatus.current = status;
  }, [status]);
  useEffect(() => {
    buffer.current = new EventBuffer();
    setEvents([]);
    setError('');
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (!refreshTimer)
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          if (!stopped)
            void queryClient.invalidateQueries({
              predicate: (query) =>
                query.queryKey[0] === 'runs' || String(query.queryKey[0]).includes(runId),
            });
        }, 500);
    };
    let attempts = 0;
    let stopped = false;
    const connect = async () => {
      if (stopped) return;
      setState(attempts ? 'reconnecting' : 'connecting');
      try {
        const headers = api.headers();
        headers.set('Accept', 'text/event-stream');
        if (buffer.current.cursor) headers.set('Last-Event-ID', buffer.current.cursor);
        const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/events`, {
          headers,
          signal: abort.signal,
          cache: 'no-store',
          credentials: 'omit',
        });
        if (response.status === 401) {
          await api.get(`/api/runs/${encodeURIComponent(runId)}`);
          throw new ApiError(401, 'AUTH_REQUIRED', 'Reconnect with the local admin token.');
        }
        if (response.status === 409) {
          buffer.current = new EventBuffer();
          setEvents([]);
          await queryClient.invalidateQueries();
          throw new Error('Event cursor expired. Reloaded the current snapshot.');
        }
        if (!response.ok || !response.body)
          throw new Error(`Event stream unavailable (${response.status}).`);
        setState('live');
        setError('');
        attempts = 0;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseParser();
        try {
          while (!stopped) {
            const result = await reader.read();
            if (result.done || stopped) break;
            for (const message of parser.push(decoder.decode(result.value, { stream: true }))) {
              const event = buffer.current.accept(message);
              if (!event) continue;
              setEvents([...buffer.current.items]);
              refresh();
            }
          }
        } finally {
          reader.releaseLock();
        }
        if (['completed', 'failed', 'cancelled'].includes(latestStatus.current ?? '')) {
          setState('closed');
          return;
        }
        throw new Error('Connection ended. Replaying persisted events.');
      } catch (cause) {
        if (stopped || abort.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Stream disconnected.');
        if (cause instanceof ApiError && cause.status === 401) {
          setState('error');
          return;
        }
        attempts += 1;
        setState('reconnecting');
        timer = setTimeout(
          () => void connect(),
          Math.min(20000, 1000 * 2 ** Math.min(attempts - 1, 5)),
        );
      }
    };
    void connect();
    return () => {
      stopped = true;
      abort.abort();
      if (timer) clearTimeout(timer);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [api, runId, queryClient]);
  return { events, state, error };
}
export const listItems = <T>(value: Page<T> | T[] | undefined): T[] =>
  Array.isArray(value) ? value : (value?.items ?? []);
