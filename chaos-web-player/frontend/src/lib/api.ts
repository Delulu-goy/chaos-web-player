// Chaos Radio — API client
// Wrapper su fetch con:
//  - base URL da VITE_API_URL (fallback /api per quando Vite proxy è attivo)
//  - credentials: 'include' per inviare il cookie httpOnly
//  - Content-Type JSON di default
//  - parsing errori standard dal backend ({ error, details })

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestInitWithJson = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function request<T>(
  method: string,
  path: string,
  init: RequestInitWithJson = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    method,
    credentials: "include",
    headers,
    body:
      init.body === undefined || init.body instanceof FormData
        ? (init.body as BodyInit | undefined)
        : JSON.stringify(init.body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? "unknown_error",
      data?.details,
    );
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInitWithJson) =>
    request<T>("GET", path, init),
  post: <T>(path: string, body?: unknown, init?: RequestInitWithJson) =>
    request<T>("POST", path, { ...init, body }),
  put: <T>(path: string, body?: unknown, init?: RequestInitWithJson) =>
    request<T>("PUT", path, { ...init, body }),
  patch: <T>(path: string, body?: unknown, init?: RequestInitWithJson) =>
    request<T>("PATCH", path, { ...init, body }),
  delete: <T>(path: string, init?: RequestInitWithJson) =>
    request<T>("DELETE", path, init),
};

export default api;