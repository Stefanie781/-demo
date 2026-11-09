/**
 * 前端数据访问层：接口形状与真实后端一致，但由本地 mock 数据层实现。
 * 后续要接服务端时，只需把 request / useApi 的内部实现换成 fetch + SSE。
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { exportCsv, handleGet, handleMutation, type ChangeEvent } from './mock';

export type { ChangeEvent } from './mock';

interface RequestOptions { method?: string; body?: unknown }

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return Promise.resolve().then(() => {
    if (!options.method || options.method === 'GET') return handleGet(path) as T;
    return handleMutation(options.method, path, options.body) as T;
  });
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' })
};

export function downloadFile(path: string, filename: string): void {
  const dataset = new URL(path, window.location.origin).searchParams.get('dataset') ?? 'balances';
  const blob = new Blob([`\uFEFF${exportCsv(dataset)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface DataContextValue {
  version: number;
  refresh: () => void;
  lastEvent: ChangeEvent | null;
}

const DataContext = createContext<DataContextValue>({ version: 0, refresh: () => undefined, lastEvent: null });

/** 本地版「实时联动」：任意写入触发全局版本号提升，所有页面同时重新取数 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [lastEvent, setLastEvent] = useState<ChangeEvent | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const refresh = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVersion((v) => v + 1), 40);
  }, []);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ChangeEvent>).detail;
      if (detail) setLastEvent(detail);
      refresh();
    };
    window.addEventListener('asset:refresh', onChange);
    return () => window.removeEventListener('asset:refresh', onChange);
  }, [refresh]);

  return <DataContext.Provider value={{ version, refresh, lastEvent }}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);

export function useApi<T>(path: string | null) {
  const { version } = useContext(DataContext);
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null, loading: Boolean(path), error: null
  });

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    api.get<T>(path)
      .then((data) => { if (active) setState({ data, loading: false, error: null }); })
      .catch((error: Error) => { if (active) setState((previous) => ({ ...previous, loading: false, error: error.message })); });
    return () => { active = false; };
  }, [path, version]);

  return state;
}
