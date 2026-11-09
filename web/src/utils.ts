export const money = (value: number | null | undefined, digits = 2) =>
  `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const compact = (value: number | null | undefined) => {
  const n = Number(value ?? 0);
  if (Math.abs(n) >= 100_000_000) return `¥${(n / 100_000_000).toFixed(2)}亿`;
  if (Math.abs(n) >= 10_000) return `¥${(n / 10_000).toFixed(2)}万`;
  return money(n);
};

export const signed = (value: number | null | undefined, suffix = '') =>
  `${Number(value ?? 0) > 0 ? '+' : ''}${Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${suffix}`;

export const pct = (value: number | null | undefined) => `${Number(value ?? 0).toFixed(2)}%`;

export const toneOf = (value: number) => (value > 0 ? 'positive' : value < 0 ? 'negative' : 'muted');

export const todayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const shortDate = (date: string | null | undefined) => (date ? date.slice(5) : '—');

export const reasonLabel: Record<string, string> = {
  BALANCE_BATCH: '余额录入',
  BALANCE_COPY: '沿用上次余额',
  BALANCE_DELETE: '删除余额记录',
  CSV_IMPORT: 'CSV 导入历史数据',
  QUOTE_UPDATE: '更新产品报价',
  POSITION_CREATE: '新增持仓',
  POSITION_UPDATE: '更新持仓',
  POSITION_DELETE: '删除持仓',
  PRODUCT_UPDATE: '更新产品',
  ACCOUNT_CREATE: '新增账户',
  ACCOUNT_UPDATE: '更新账户',
  ACCOUNT_DELETE: '删除账户',
  DEMO_DATA: '载入演示数据',
  DATA_RESET: '清空数据',
  DAILY_SCAN: '每日定时扫描',
  MANUAL_EVALUATE: '手动评估规则',
  RULE_CREATE: '新增规则',
  RULE_UPDATE: '更新规则',
  RULE_DELETE: '删除规则',
  SETTINGS_UPDATE: '更新设置',
  ALERT_STATE: '提醒状态变更',
  ALERT_ACK_ALL: '全部确认提醒',
  FULL_RECOMPUTE: '全量重算快照',
  SERVER_START: '服务启动'
};
