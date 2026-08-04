import { useRef } from "react";

export interface EditorSession<T> {
  readonly initialValue: T;
  readonly key: string;
}

export function reconcileEditorSession<T>(
  current: EditorSession<T> | null,
  key: string,
  initialValue: () => T,
): EditorSession<T> {
  if (current?.key === key) return current;
  return Object.freeze({ initialValue: initialValue(), key });
}

export function resolveEditorSession<T>(
  ready: boolean,
  key: string,
  initialValue: () => T,
): EditorSession<T> | null {
  if (!ready) return null;
  return reconcileEditorSession(null, key, initialValue);
}

export function useStableEditorSession<T>(key: string, initialValue: () => T): EditorSession<T> {
  const session = useRef<EditorSession<T> | null>(null);
  session.current = reconcileEditorSession(session.current, key, initialValue);
  return session.current;
}

export type EditorTarget<T> =
  | { readonly kind: "CREATE"; readonly value: null }
  | { readonly kind: "EDIT"; readonly value: T }
  | { readonly kind: "MISSING" };

export function resolveEditorTarget<T>(
  requestedId: string | undefined,
  value: T | null | undefined,
): EditorTarget<T> {
  if (requestedId === undefined) return Object.freeze({ kind: "CREATE", value: null });
  if (value === null || value === undefined) return Object.freeze({ kind: "MISSING" });
  return Object.freeze({ kind: "EDIT", value });
}
