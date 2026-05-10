"use client";

const USER_ID_KEY = "parcel:userId";
const THREAD_ID_KEY = "parcel:threadId";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function getThreadId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(THREAD_ID_KEY);
}

export function setThreadId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(THREAD_ID_KEY, id);
  } else {
    localStorage.removeItem(THREAD_ID_KEY);
  }
}
