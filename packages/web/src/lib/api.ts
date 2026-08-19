// عميل API خفيف مكتوب يدوياً — يستبدل @workspace/api-client-react المولّد
// آلياً والمرتبط بأدوات Replit. يعتمد فقط على fetch القياسي + كوكي الجلسة.
//
// محلياً: "/api" (يُمرَّر عبر بروكسي vite إلى localhost:8080).
// على Vercel: الواجهة والباك-إند مشروعان منفصلان بدومينين مختلفين، لذا
// يجب ضبط VITE_API_BASE_URL على الرابط الكامل لمشروع الباك-إند
// (مثال: https://golog-api.vercel.app/api).
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error?.formErrors?.join(", ") || body.error || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function googleLoginUrl() {
  return `${API_BASE}/auth/google`;
}
