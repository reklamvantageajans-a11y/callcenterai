const KEY = "call_secret";

export const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL || "https://callcenterai-yxqp.onrender.com";

export function getSecret(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) || "";
}

export function setSecret(v: string) {
  localStorage.setItem(KEY, v);
}

export function authHeaders(): HeadersInit {
  return { "x-call-secret": getSecret() };
}

export function recordingSrc(callId: string): string {
  const s = encodeURIComponent(getSecret());
  return `${BACKEND}/api/calls/${callId}/recording?secret=${s}`;
}
