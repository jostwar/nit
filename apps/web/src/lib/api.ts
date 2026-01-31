const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export async function apiGet<T>(path: string): Promise<T> {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
  const response = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}
