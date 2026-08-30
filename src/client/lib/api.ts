export const fetcher = <T,>(url: string): Promise<T> =>
  fetch(url).then((r) => r.json() as Promise<T>);

export async function post<T = Record<string, unknown>>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

/** El BLOB del fantasma viaja en base64: es lo único que sobrevive a JSON. */
export function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
