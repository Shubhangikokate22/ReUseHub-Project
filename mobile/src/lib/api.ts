import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

const expoHost = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
const host = expoHost
  ? new URL(`http://${expoHost}`).hostname
  : Platform.OS === 'android'
    ? '10.0.2.2'
    : 'localhost';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? `http://${host}:5000/api`).replace(/\/$/, '');

export function resolveMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = API_BASE_URL.replace(/\/api$/, '');
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
  timeoutMs?: number;
};

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: BodyInit | undefined;
  const multipartBody = typeof FormData !== 'undefined' && options.body instanceof FormData ? options.body : null;
  const isMultipart = multipartBody !== null;
  if (multipartBody) {
    body = multipartBody;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 20_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetcher = isMultipart && Platform.OS !== 'web' ? expoFetch : fetch;
    response = await fetcher(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw new ApiError(0, `ReUseHub did not respond within ${Math.ceil(timeoutMs / 1000)} seconds at ${API_BASE_URL}. Check your internet connection and try again.`);
    }
    throw new ApiError(0, `Could not reach ReUseHub at ${API_BASE_URL}. Check your internet connection and try again.`);
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let payload: unknown = {};
  try { payload = responseText ? JSON.parse(responseText) as unknown : {}; } catch { /* Some proxy and Express 404 responses are HTML, not JSON. */ }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : response.status === 404
        ? `The API route ${path} was not found. Restart the backend from the current ReUseHub project.`
        : `The server returned HTTP ${response.status} for ${path}.`;
    throw new ApiError(response.status, message);
  }
  try { return (responseText ? JSON.parse(responseText) : {}) as T; }
  catch { throw new ApiError(response.status, `The server returned an invalid response for ${path}.`); }
}
