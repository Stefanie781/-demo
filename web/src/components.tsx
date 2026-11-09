import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes
} from 'react';

export const PALETTE = ['#5b8cff', '#2dd4a7', '#f5b955', '#a78bfa', '#ff6b8b', '#38bdf8', '#f97362', '#84cc16', '#22d3ee'];

export const CHART_BASE: EChartsOption = {
  backgroundColor: 'transparent',
  textStyle: { color: '#9aa9c7', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif' },
  tooltip: {
    backgroundColor: 'rgba(18, 25, 44, 0.96)',
    borderColor: 'rgba(120, 145, 200, 0.3)',
    textStyle: { color: '#e8edf7', fontSize: 12 },
    axisPointer: { type: 'line', lineStyle: { color: 'rgba(120, 145, 200, 0.35)' } }
  },
  grid: { left: 56, right: 24, top: 36, bottom: 36, containLabel: false }
};

export function Chart({ option, height = 280 }: { option: EChartsOption; height?: number }) {
  const element = useRef<HTMLDivElement | null>(null);
  const instance = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    if (!element.current) return;
    const chart = echarts.init(element.current);
    instance.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.setOption(option, true);
  }, [option]);

  return <div ref={element} className="chart" style={{ height }} />;
}

interface ToastItem { id: number; message: string; tone: 'success' | 'error' | 'info' }
const ToastContext = createContext<(message: string, tone?: ToastItem['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastItem['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3600);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack">
        {items.map((item) => <div key={item.id} className={`toast toast-${item.tone}`}>{item.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function Card({
  title, subtitle, extra, children, className = '', noPadding = false
}: {
  title?: ReactNode; subtitle?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; noPadding?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || extra) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {extra && <div className="card-extra">{extra}</div>}
        </header>
      )}
      <div className={noPadding ? 'card-body flush' : 'card-body'}>{children}</div>
    </section>
  );
}

export function Kpi({
  label, value, sub, tone = 'default', mark
}: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'positive' | 'negative' | 'accent'; mark?: string;
}) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-top"><span>{label}</span>{mark && <span className="kpi-mark">{mark}</span>}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'info' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({ variant = 'default', size = 'md', loading, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} disabled={disabled || loading} {...rest}>
      {loading ? '处理中…' : children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input select" {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Modal({
  open, title, onClose, children, footer, width = 560
}: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Empty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-glyph">◇</div>
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Loading({ height = 180 }: { height?: number }) {
  return <div className="loading" style={{ height }}><span className="spinner" /> 正在加载数据…</div>;
}

export function ErrorHint({ message }: { message: string }) {
  return <div className="error-hint">加载失败：{message}</div>;
}

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T; onChange: (value: T) => void; items: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="tabs">
      {items.map((item) => (
        <button key={item.value} className={`tab ${value === item.value ? 'active' : ''}`} onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'positive' | 'warning' | 'negative' }) {
  return (
    <div className="progress"><div className={`progress-fill progress-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
  );
}
