function getApiUrl(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env && env !== "http://localhost:4000/api") return env;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000/api`;
  }
  return "http://localhost:4000/api";
}
const API_URL = getApiUrl();

const REMEMBER_ME_KEY = "rememberMe";
const SAVED_EMAIL_KEY = "savedLoginEmail";

function getTokenStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REMEMBER_ME_KEY) === "true"
    ? window.localStorage
    : window.sessionStorage;
}

export function getAccessToken(): string | null {
  const storage = getTokenStorage();
  if (!storage) return null;
  return storage.getItem("accessToken");
}

export function getRefreshToken(): string | null {
  const storage = getTokenStorage();
  if (!storage) return null;
  return storage.getItem("refreshToken");
}

export function setTokens(accessToken: string, refreshToken: string, rememberMe: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");
  const storage = rememberMe ? window.localStorage : window.sessionStorage;
  storage.setItem("accessToken", accessToken);
  storage.setItem("refreshToken", refreshToken);
  if (!rememberMe) {
    window.localStorage.removeItem("accessToken");
    window.localStorage.removeItem("refreshToken");
  }
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("accessToken");
  window.localStorage.removeItem("refreshToken");
  window.sessionStorage.removeItem("accessToken");
  window.sessionStorage.removeItem("refreshToken");
}

export function setSavedLoginEmail(email: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SAVED_EMAIL_KEY, email);
}

export function getSavedLoginEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SAVED_EMAIL_KEY);
}

export function clearSavedLoginEmail(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SAVED_EMAIL_KEY);
}

async function doRefresh(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rememberMe = typeof window !== "undefined" && window.localStorage.getItem(REMEMBER_ME_KEY) === "true";
    setTokens(data.accessToken, data.refreshToken, rememberMe);
    return data;
  } catch {
    return null;
  }
}

function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    clearTokens();
    window.location.href = "/login";
  }
}

export async function apiGet<T>(
  path: string,
  options?: { timeoutMs?: number },
  retried = false,
): Promise<T> {
  const token = getAccessToken();
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs;
  const timeoutId =
    typeof timeoutMs === "number" && typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } finally {
    if (timeoutId != null && typeof window !== "undefined") window.clearTimeout(timeoutId);
  }
  if (response.status === 401 && !retried) {
    const refreshed = await doRefresh();
    if (refreshed) return apiGet<T>(path, options, true);
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (response.status === 401 && retried) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options?: { timeoutMs?: number },
  retried = false,
): Promise<T> {
  const token = getAccessToken();
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs;
  const timeoutId =
    typeof timeoutMs === "number" && typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    if (timeoutId != null && typeof window !== "undefined") window.clearTimeout(timeoutId);
  }
  if (response.status === 401 && !retried) {
    const refreshed = await doRefresh();
    if (refreshed) return apiPost<T>(path, body, options, true);
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (response.status === 401 && retried) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiPatch<T>(path: string, body: unknown, retried = false): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (response.status === 401 && !retried) {
    const refreshed = await doRefresh();
    if (refreshed) return apiPatch<T>(path, body, true);
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (response.status === 401 && retried) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiDelete<T>(path: string, retried = false): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (response.status === 401 && !retried) {
    const refreshed = await doRefresh();
    if (refreshed) return apiDelete<T>(path, true);
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (response.status === 401 && retried) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

/** Sube un archivo (multipart/form-data). Campo del archivo: "file". */
export async function apiUploadFile<T = { count: number; message?: string }>(
  path: string,
  file: File,
  retried = false,
): Promise<T> {
  const token = getAccessToken();
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (response.status === 401 && !retried) {
    const refreshed = await doRefresh();
    if (refreshed) return apiUploadFile<T>(path, file, true);
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (response.status === 401 && retried) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API error: ${response.status}`);
  }
  return response.json();
}
