import type { Role, Snapshot } from '../../shared/schemas';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly code?: string,
  ) {
    super(message);
  }
}

export class OfflineError extends Error {
  constructor() {
    super('offline');
  }
}

export interface LoginResult {
  token: string;
  role: Role;
}

export interface MutationResult {
  ok: true;
  version: number;
  id?: string;
  [key: string]: unknown;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiClient {
  constructor(
    private getToken: () => string | null,
    private onUnauthorized: () => void,
  ) {}

  async request<T>(method: Method, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<{ status: number; data: T; etag?: string | null }> {
    const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new OfflineError();
    }
    if (res.status === 304) return { status: 304, data: undefined as T, etag: res.headers.get('ETag') };
    let data: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      const err = (data || {}) as { error?: string; details?: unknown; code?: string };
      if (res.status === 401 && token && path !== '/auth/login') this.onUnauthorized();
      if (res.status >= 502 && res.status <= 504) throw new OfflineError();
      throw new ApiError(err.error || `Request failed (${res.status})`, res.status, err.details, err.code);
    }
    return { status: res.status, data: data as T, etag: res.headers.get('ETag') };
  }

  async login(code: string): Promise<LoginResult> {
    return (await this.request<LoginResult>('POST', '/auth/login', { code })).data;
  }

  async snapshot(etag?: string | null): Promise<{ snapshot?: Snapshot; etag?: string | null }> {
    const res = await this.request<Snapshot>('GET', '/data', undefined, etag ? { 'If-None-Match': etag } : {});
    if (res.status === 304) return { etag: res.etag };
    return { snapshot: res.data, etag: res.etag };
  }

  async get<T>(path: string): Promise<T> {
    return (await this.request<T>('GET', path)).data;
  }
  async post<T = MutationResult>(path: string, body?: unknown): Promise<T> {
    return (await this.request<T>('POST', path, body ?? {})).data;
  }
  async put<T = MutationResult>(path: string, body: unknown): Promise<T> {
    return (await this.request<T>('PUT', path, body)).data;
  }
  async patch<T = MutationResult>(path: string, body: unknown): Promise<T> {
    return (await this.request<T>('PATCH', path, body)).data;
  }
  async del<T = MutationResult>(path: string): Promise<T> {
    return (await this.request<T>('DELETE', path)).data;
  }
}

export function errorMessage(err: unknown, offlineText: string): string {
  if (err instanceof OfflineError) return offlineText;
  if (err instanceof Error) return err.message;
  return String(err);
}
