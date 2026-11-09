/**
 * 纯前端本地数据层（Demo）
 * ------------------------------------------------------------
 * 所有数据保存在 localStorage，不依赖任何服务端。
 * 核心链路：余额台账 / 报价 → 每日快照重算 → 趋势、分布、分析、提醒同时更新。
 * 接口形状与真实后端保持一致，后续接入服务端时只需替换 api.tsx 的调用实现。
 */
import type {
  Account, AlertEvent, Analysis, BalanceRecord, Distribution, DistributionItem,
  ImportPreview, ImportResult, Position, Product, Rule, Summary, Trend, TrendPoint
} from './types';
import { shiftDate, todayStr } from './utils';

const STORAGE_KEY = 'asset-visual-demo-v1';

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CASH: '现金 / 活期', BANK: '银行存款', BROKERAGE: '证券账户',
  FUND: '基金平台', OTHER: '其他', LIABILITY: '负债'
};
export const PRODUCT_CATEGORY_LABELS: Record<string, string> = {
  FUND: '基金', STOCK: '股票', FIXED: '定期 / 理财', BOND: '债券', OTHER: '其他'
};
export const RULE_TYPE_LABELS: Record<string, string> = {
  MATURITY: '到期提醒', TAKE_PROFIT: '止盈提醒', STOP_LOSS: '止损提醒',
  PRICE_MOVE: '价格异动', ALLOCATION_DRIFT: '配置偏离', IDLE_CASH: '闲置资金', DATA_STALE: '久未记账'
};

export interface BalanceRow { id: string; accountId: string; date: string; amount: number; note: string; source: string }
export interface QuoteRow { id: string; productId: string; date: string; price: number }
export interface RawPosition {
  id: string; product_id: string; account_id: string | null; quantity: number;
  cost_price: number; current_price: number; opened_at: string; closed_at: string | null;
  status: string; note: string;
}
export interface SnapshotItem {
  accountId: string | null; positionId: string | null;
  kind: 'ACCOUNT' | 'POSITION' | 'LIABILITY';
  name: string; groupKey: string; amount: number; estimated: boolean;
}
export interface Snapshot extends TrendPoint { items: SnapshotItem[] }
export interface ChangeEvent {
  reason: string; affectedFrom?: string; snapshotDays?: number; newAlerts?: number; at: string;
}
export interface DemoSettings {
  target_allocation: string; idle_cash_threshold: string; stale_days: string;
  scan_time: string; drift_tolerance: string;
}
export interface DemoState {
  accounts: Account[];
  balances: BalanceRow[];
  products: Product[];
  positions: RawPosition[];
  quotes: QuoteRow[];
  rules: Rule[];
  alerts: AlertEvent[];
  settings: DemoSettings;
  snapshots: Snapshot[];
  lastEvent: ChangeEvent | null;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
const round = (n: number, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const labelOf = (key: string) => ACCOUNT_TYPE_LABELS[key] ?? PRODUCT_CATEGORY_LABELS[key] ?? key;
const currency = (n: number) => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DEFAULT_SETTINGS: DemoSettings = {
  target_allocation: JSON.stringify({ CASH: 20, BANK: 30, BROKERAGE: 25, FUND: 20, OTHER: 5 }),
  idle_cash_threshold: '50000',
  stale_days: '3',
  scan_time: '09:00',
  drift_tolerance: '10'
};

function defaultAccounts(): Account[] {
  return [
    ['微信', 'CASH'], ['支付宝', 'CASH'], ['招商银行卡', 'BANK'],
    ['现金', 'CASH'], ['券商账户', 'BROKERAGE'], ['信用卡欠款', 'LIABILITY']
  ].map(([name, type], index) => ({
    id: `acc-${index + 1}`, name, type, currency: 'CNY',
    include_in_total: 1, archived: 0, sort_order: index
  }));
}

function defaultRules(): Rule[] {
  const base: Array<[string, string, Record<string, unknown>, Record<string, unknown>]> = [
    ['到期前 7 天提醒', 'MATURITY', { daysBefore: 7, includeOverdue: true }, { level: 'WARN' }],
    ['止盈提醒（收益率 ≥ 15%）', 'TAKE_PROFIT', { rate: 15 }, { level: 'WARN' }],
    ['止损提醒（收益率 ≤ -10%）', 'STOP_LOSS', { rate: -10 }, { level: 'URGENT' }],
    ['单日涨跌幅超过 5%', 'PRICE_MOVE', { rate: 5 }, { level: 'INFO' }],
    ['资产配置偏离目标 10 个百分点', 'ALLOCATION_DRIFT', { tolerance: 10 }, { level: 'INFO' }],
    ['闲置活期资金过多', 'IDLE_CASH', { days: 7 }, { level: 'INFO' }],
    ['超过 3 天未记账', 'DATA_STALE', { days: 3 }, { level: 'INFO' }]
  ];
  return base.map(([name, rule_type, condition, action]) => ({
    id: uid(), name, rule_type, scope: {}, condition, action, enabled: true
  }));
}

function buildDemoState(): DemoState {
  const today = todayStr();
  const start = shiftDate(today, -89);
  const accounts = defaultAccounts();
  const bases: Record<string, number> = {
    'acc-1': 3200, 'acc-2': 8600, 'acc-3': 48600,
    'acc-4': 1500, 'acc-5': 12500, 'acc-6': 2300
  };
  const balances: BalanceRow[] = [];
  for (let i = 0; i < 90; i += 1) {
    const date = shiftDate(start, i);
    accounts.forEach((account, index) => {
      const base = bases[account.id];
      const wave = Math.sin(i * 0.21 + index * 1.7) * base * 0.028;
      const growth = i * base * 0.0016 + (i >= 60 && account.id === 'acc-3' ? 8600 : 0);
      const decay = account.type === 'LIABILITY' ? -i * 18 : 0;
      balances.push({
        id: uid(), accountId: account.id, date,
        amount: Math.max(0, round(base + wave + growth + decay)),
        note: '', source: 'DEMO'
      });
    });
  }

  const products: Product[] = [
    { id: 'prod-1', name: '稳盈 90 天债券基金', code: 'FUND-001', category: 'FUND', maturity_date: shiftDate(today, 5), target_return_rate: 3.2, note: '' },
    { id: 'prod-2', name: '科技 ETF 联接', code: 'ETF-002', category: 'STOCK', maturity_date: null, target_return_rate: null, note: '' },
    { id: 'prod-3', name: '季季盈定期理财', code: 'FIXED-003', category: 'FIXED', maturity_date: shiftDate(today, -2), target_return_rate: 3.6, note: '' }
  ];
  const positions: RawPosition[] = [
    { id: 'pos-1', product_id: 'prod-1', account_id: 'acc-5', quantity: 20000, cost_price: 1, current_price: 1.042, opened_at: shiftDate(today, -80), closed_at: null, status: 'HOLDING', note: '' },
    { id: 'pos-2', product_id: 'prod-2', account_id: 'acc-5', quantity: 3000, cost_price: 2.8, current_price: 3.19, opened_at: shiftDate(today, -70), closed_at: null, status: 'HOLDING', note: '' },
    { id: 'pos-3', product_id: 'prod-3', account_id: 'acc-3', quantity: 10000, cost_price: 1, current_price: 1.021, opened_at: shiftDate(today, -85), closed_at: null, status: 'HOLDING', note: '' }
  ];
  const quotes: QuoteRow[] = [];
  const series: Record<string, (i: number) => number> = {
    'prod-1': (i) => 1 + i * 0.00048,
    'prod-2': (i) => 2.8 + Math.sin(i * 0.32) * 0.16 + i * 0.0045,
    'prod-3': (i) => 1 + i * 0.00023
  };
  for (let i = 0; i < 90; i += 1) {
    const date = shiftDate(start, i);
    for (const product of products) {
      quotes.push({ id: uid(), productId: product.id, date, price: round(series[product.id](i), 4) });
    }
  }
  for (const position of positions) {
    const last = quotes.filter((q) => q.productId === position.product_id).at(-1);
    if (last) last.price = position.current_price;
  }

  const state: DemoState = {
    accounts, balances, products, positions, quotes,
    rules: defaultRules(), alerts: [],
    settings: { ...DEFAULT_SETTINGS }, snapshots: [], lastEvent: null
  };
  recomputeSnapshots(state);
  evaluateRules(state);
  return state;
}

function emptyState(): DemoState {
  return {
    accounts: defaultAccounts(), balances: [], products: [], positions: [], quotes: [],
    rules: defaultRules(), alerts: [], settings: { ...DEFAULT_SETTINGS },
    snapshots: [], lastEvent: null
  };
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (Array.isArray(parsed.accounts) && Array.isArray(parsed.balances)) return parsed;
    }
  } catch { /* 忽略损坏的本地数据 */ }
  const fresh = buildDemoState();
  save(fresh);
  return fresh;
}

function save(target: DemoState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(target)); } catch { /* 存储不可用时仍可运行 */ }
}

let state: DemoState = load();
export const getState = () => state;

/** 台账 → 每日快照：Demo 的联动核心，任何写入后都会全量重算 */
export function recomputeSnapshots(target: DemoState = state): { from: string; to: string; days: number } {
  const end = todayStr();
  const earliest = [
    ...target.balances.map((b) => b.date),
    ...target.positions.map((p) => p.opened_at)
  ].sort()[0];
  let start = earliest ?? end;
  if (dayDiff(start, end) > 1095) start = shiftDate(end, -1095);
  const dates: string[] = [];
  for (let date = start; date <= end && dates.length < 1100; date = shiftDate(date, 1)) dates.push(date);

  const changes = new Map<string, BalanceRow[]>();
  for (const row of target.balances) {
    const list = changes.get(row.date) ?? [];
    list.push(row);
    changes.set(row.date, list);
  }
  const quoteMap = new Map<string, QuoteRow[]>();
  for (const quote of [...target.quotes].sort((a, b) => a.date.localeCompare(b.date))) {
    const list = quoteMap.get(quote.productId) ?? [];
    list.push(quote);
    quoteMap.set(quote.productId, list);
  }
  const cursor = new Map<string, number>();
  const priceAt = (productId: string, date: string, fallback: number) => {
    const list = quoteMap.get(productId) ?? [];
    let index = cursor.get(productId) ?? 0;
    while (index < list.length && list[index].date <= date) index += 1;
    cursor.set(productId, index);
    return index > 0 ? { price: list[index - 1].price, estimated: false } : { price: fallback, estimated: true };
  };

  const carry = new Map<string, { amount: number; asOf: string | null }>();
  for (const account of target.accounts) {
    const prior = target.balances
      .filter((b) => b.accountId === account.id && b.date < start)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1);
    carry.set(account.id, prior ? { amount: prior.amount, asOf: prior.date } : { amount: 0, asOf: null });
  }

  const products = new Map(target.products.map((p) => [p.id, p]));
  const snapshots: Snapshot[] = [];
  for (const date of dates) {
    for (const change of changes.get(date) ?? []) carry.set(change.accountId, { amount: change.amount, asOf: date });
    const items: SnapshotItem[] = [];
    let accountTotal = 0, positionTotal = 0, liability = 0;

    for (const account of target.accounts) {
      if (!account.include_in_total) continue;
      const current = carry.get(account.id) ?? { amount: 0, asOf: null };
      if (!current.asOf && current.amount === 0) continue;
      const kind: SnapshotItem['kind'] = account.type === 'LIABILITY' ? 'LIABILITY' : 'ACCOUNT';
      const amount = round(current.amount);
      if (kind === 'LIABILITY') liability += amount; else accountTotal += amount;
      items.push({
        accountId: account.id, positionId: null, kind, name: account.name,
        groupKey: account.type, amount, estimated: current.asOf !== date
      });
    }
    for (const position of target.positions) {
      if (position.opened_at > date || position.status === 'CLOSED') continue;
      if (position.closed_at && position.closed_at < date) continue;
      const product = products.get(position.product_id);
      const { price, estimated } = priceAt(position.product_id, date, position.current_price || position.cost_price);
      const amount = round(position.quantity * price);
      positionTotal += amount;
      items.push({
        accountId: position.account_id, positionId: position.id, kind: 'POSITION',
        name: product?.name ?? '未命名产品', groupKey: product?.category ?? 'OTHER', amount, estimated
      });
    }

    accountTotal = round(accountTotal);
    positionTotal = round(positionTotal);
    liability = round(liability);
    const previous = snapshots.at(-1);
    snapshots.push({
      date,
      total_assets: round(accountTotal + positionTotal),
      total_liability: liability,
      net_assets: round(accountTotal + positionTotal - liability),
      account_total: accountTotal,
      position_total: positionTotal,
      estimated: items.some((item) => item.estimated),
      delta: round(accountTotal + positionTotal - liability - (previous?.net_assets ?? accountTotal + positionTotal - liability)),
      balanceDelta: round(accountTotal - (previous?.account_total ?? accountTotal)),
      marketDelta: round(positionTotal - (previous?.position_total ?? positionTotal)),
      liabilityDelta: round(liability - (previous?.total_liability ?? liability)),
      items
    });
  }
  target.snapshots = snapshots;
  return { from: start, to: end, days: snapshots.length };
}

export function latestRecordDate(target: DemoState = state): string | null {
  return target.balances.map((b) => b.date).sort().at(-1) ?? null;
}

export function getDistribution(date: string, target: DemoState = state): Distribution {
  const targetDate = date || todayStr();
  const items: DistributionItem[] = target.accounts.map((account) => {
    const records = target.balances
      .filter((b) => b.accountId === account.id && b.date <= targetDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    const current = records.at(-1);
    const previous = records.at(-2);
    return {
      ...account,
      amount: round(current?.amount ?? 0),
      asOf: current?.date ?? null,
      estimated: !current || current.date !== targetDate,
      previousAmount: previous ? round(previous.amount) : null,
      delta: current && previous ? round(current.amount - previous.amount) : 0,
      note: current?.note ?? '',
      source: current?.source ?? '',
      share: 0
    };
  });
  const positiveTotal = items
    .filter((i) => i.type !== 'LIABILITY' && i.include_in_total)
    .reduce((sum, i) => sum + Math.max(0, i.amount), 0);
  for (const item of items) {
    item.share = positiveTotal > 0 && item.type !== 'LIABILITY'
      ? round((Math.max(0, item.amount) / positiveTotal) * 100) : 0;
  }

  const positionsByAccount: Record<string, number> = {};
  let positionTotal = 0;
  for (const position of target.positions) {
    if (position.status === 'CLOSED') continue;
    const value = round(position.quantity * position.current_price);
    positionTotal += value;
    if (position.account_id) positionsByAccount[position.account_id] = round((positionsByAccount[position.account_id] ?? 0) + value);
  }
  const accountTotal = round(items.filter((i) => i.type !== 'LIABILITY' && i.include_in_total).reduce((s, i) => s + i.amount, 0));
  const liability = round(items.filter((i) => i.type === 'LIABILITY').reduce((s, i) => s + i.amount, 0));
  positionTotal = round(positionTotal);

  const groupsMap = new Map<string, number>();
  for (const item of items) {
    if (item.type === 'LIABILITY' || !item.include_in_total) continue;
    groupsMap.set(item.type, (groupsMap.get(item.type) ?? 0) + Math.max(0, item.amount));
  }
  groupsMap.set('POSITION', (groupsMap.get('POSITION') ?? 0) + positionTotal);
  const baseTotal = accountTotal + positionTotal;
  const groups = [...groupsMap.entries()].map(([key, amount]) => ({
    key, label: key === 'POSITION' ? '持仓市值' : labelOf(key), amount: round(amount),
    share: baseTotal > 0 ? round((amount / baseTotal) * 100) : 0
  }));

  return {
    date: targetDate,
    latestRecordDate: latestRecordDate(target),
    items, groups, positionsByAccount,
    totals: {
      accountTotal, positionTotal, liability,
      totalAssets: round(accountTotal + positionTotal),
      netAssets: round(accountTotal + positionTotal - liability)
    }
  };
}

export function getSummary(target: DemoState = state): Summary {
  const latest = target.snapshots.at(-1);
  const previous = target.snapshots.at(-2);
  const monthAgo = [...target.snapshots].reverse().find((s) => s.date <= shiftDate(todayStr(), -30));
  const net = latest?.net_assets ?? 0;
  const dayChange = latest && previous ? round(net - previous.net_assets) : 0;
  const monthChange = latest && monthAgo ? round(net - monthAgo.net_assets) : 0;
  return {
    date: latest?.date ?? null, netAssets: net, totalAssets: latest?.total_assets ?? 0,
    liability: latest?.total_liability ?? 0, accountTotal: latest?.account_total ?? 0,
    positionTotal: latest?.position_total ?? 0, dayChange,
    dayChangeRate: previous && previous.net_assets ? round((dayChange / Math.abs(previous.net_assets)) * 100) : 0,
    monthChange,
    monthChangeRate: monthAgo && monthAgo.net_assets ? round((monthChange / Math.abs(monthAgo.net_assets)) * 100) : 0,
    estimated: Boolean(latest?.estimated),
    latestRecordDate: latestRecordDate(target),
    accountCount: target.accounts.filter((a) => !a.archived).length,
    pendingAlerts: target.alerts.filter((a) => a.state === 'PENDING').length,
    holdingPositions: target.positions.filter((p) => p.status !== 'CLOSED').length
  };
}

export function getTrend(from: string, to: string, target: DemoState = state): Trend {
  const selected = target.snapshots.filter((s) => s.date >= from && s.date <= to);
  const points: TrendPoint[] = selected.map(({ items: _items, ...point }) => point);
  const keys = [...new Set(selected.flatMap((s) => s.items.filter((i) => i.kind !== 'LIABILITY').map((i) => i.groupKey)))];
  const series = keys.map((key) => ({
    key, name: labelOf(key),
    data: selected.map((snapshot) => round(snapshot.items
      .filter((i) => i.kind !== 'LIABILITY' && i.groupKey === key)
      .reduce((sum, i) => sum + i.amount, 0)))
  }));
  return { from, to, points, series };
}

export function listPositions(target: DemoState = state): Position[] {
  const today = todayStr();
  return target.positions.map((position) => {
    const product = target.products.find((p) => p.id === position.product_id);
    const account = target.accounts.find((a) => a.id === position.account_id);
    const value = round(position.quantity * position.current_price);
    const cost = round(position.quantity * position.cost_price);
    const profit = round(value - cost);
    const daysLeft = product?.maturity_date ? dayDiff(today, product.maturity_date) : null;
    return {
      ...position,
      product_name: product?.name ?? '未命名产品',
      code: product?.code ?? '',
      category: product?.category ?? 'OTHER',
      maturity_date: product?.maturity_date ?? null,
      account_name: account?.name ?? null,
      value, cost, profit,
      rate: cost > 0 ? round((profit / cost) * 100) : 0,
      daysLeft,
      maturityState: daysLeft === null ? 'NONE' : daysLeft < 0 ? 'OVERDUE' : daysLeft <= 7 ? 'SOON' : 'NORMAL'
    };
  });
}

export function getAnalysis(target: DemoState = state): Analysis {
  const today = todayStr();
  const distribution = getDistribution(today, target);
  const positions = listPositions(target);
  const holdings = positions.filter((p) => p.status !== 'CLOSED').map((p) => ({
    id: p.id, name: p.product_name, code: p.code, category: p.category,
    maturityDate: p.maturity_date, daysLeft: p.daysLeft, quantity: p.quantity,
    costPrice: p.cost_price, currentPrice: p.current_price, value: p.value,
    cost: p.cost, profit: p.profit, rate: p.rate,
    status: p.daysLeft !== null && p.daysLeft < 0 ? 'OVERDUE' : p.status,
    accountName: p.account_name
  }));
  const maturityCalendar = holdings
    .filter((h) => h.daysLeft !== null && h.daysLeft <= 60)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .map((h) => ({
      id: h.id, name: h.name, maturityDate: h.maturityDate, daysLeft: h.daysLeft,
      value: h.value, overdue: (h.daysLeft ?? 0) < 0
    }));

  const baseTotal = distribution.totals.accountTotal + distribution.totals.positionTotal;
  const ranked = [
    ...distribution.items
      .filter((i) => i.type !== 'LIABILITY' && i.include_in_total && i.amount > 0)
      .map((i) => ({ name: i.name, amount: i.amount, type: i.type })),
    ...(distribution.totals.positionTotal > 0
      ? [{ name: '持仓市值', amount: distribution.totals.positionTotal, type: 'POSITION' }] : [])
  ].map((part) => ({ ...part, share: baseTotal > 0 ? round((part.amount / baseTotal) * 100) : 0 }))
    .sort((a, b) => b.share - a.share);
  const concentration = {
    top1Share: ranked[0]?.share ?? 0,
    top3Share: round(ranked.slice(0, 3).reduce((s, p) => s + p.share, 0)),
    hhi: round(ranked.reduce((s, p) => s + p.share ** 2, 0)),
    ranked
  };

  const byType = new Map<string, number>();
  for (const item of distribution.items) {
    if (item.type === 'LIABILITY' || !item.include_in_total) continue;
    byType.set(item.type, (byType.get(item.type) ?? 0) + Math.max(0, item.amount));
  }
  const targets = JSON.parse(target.settings.target_allocation || '{}') as Record<string, number>;
  const tolerance = Number(target.settings.drift_tolerance || 10);
  const allocation = Object.entries(targets).map(([key, expected]) => {
    const amount = round(byType.get(key) ?? 0);
    const current = distribution.totals.accountTotal > 0 ? round((amount / distribution.totals.accountTotal) * 100) : 0;
    const gap = round(current - expected);
    return { key, label: labelOf(key), amount, current, expected, gap, drifted: Math.abs(gap) >= tolerance };
  });

  const idleThreshold = Number(target.settings.idle_cash_threshold || 50000);
  const idleItems = distribution.items
    .filter((i) => i.type === 'CASH' && !i.archived && i.amount >= idleThreshold)
    .map((i) => ({ id: i.id, name: i.name, amount: i.amount, asOf: i.asOf }));
  const last30 = target.snapshots.filter((s) => s.date >= shiftDate(today, -29));
  const balanceDelta = round(last30.reduce((s, p) => s + p.balanceDelta, 0));
  const marketDelta = round(last30.reduce((s, p) => s + p.marketDelta, 0));
  const liabilityDelta = round(last30.reduce((s, p) => s + p.liabilityDelta, 0));
  const netChange = round(balanceDelta + marketDelta - liabilityDelta);
  const latest = latestRecordDate(target);
  const staleDays = latest ? dayDiff(latest, today) : null;

  const insights: Array<{ level: 'INFO' | 'WARN'; text: string }> = [];
  if (concentration.top1Share >= 50) insights.push({ level: 'WARN', text: `资金集中度偏高：${ranked[0]?.name} 占总资产 ${concentration.top1Share}%，可留意分散程度。` });
  const idleTotal = round(idleItems.reduce((s, i) => s + i.amount, 0));
  if (idleTotal > 0) insights.push({ level: 'INFO', text: `活期类渠道有 ${idleItems.length} 个账户达到闲置阈值，合计 ${currency(idleTotal)}。` });
  if (maturityCalendar.some((m) => m.overdue)) insights.push({ level: 'WARN', text: `有 ${maturityCalendar.filter((m) => m.overdue).length} 笔持仓已过到期日但仍标记持有，建议核对状态。` });
  if (maturityCalendar.some((m) => !m.overdue && (m.daysLeft ?? 99) <= 7)) insights.push({ level: 'INFO', text: `未来 7 天内有 ${maturityCalendar.filter((m) => !m.overdue && (m.daysLeft ?? 99) <= 7).length} 笔产品到期，注意提前安排资金去向。` });
  if (allocation.some((a) => a.drifted)) insights.push({ level: 'INFO', text: `${allocation.filter((a) => a.drifted).map((a) => a.label).join('、')} 的实际占比偏离目标配置超过 ${tolerance} 个百分点。` });
  if (staleDays === null || staleDays >= 3) insights.push({ level: 'WARN', text: staleDays === null ? '尚无台账数据，请先录入账户余额。' : `已 ${staleDays} 天未更新余额，近期曲线为结转估算值。` });
  insights.push({ level: 'INFO', text: `近 ${last30.length} 天净资产变化 ${currency(netChange)}（资金变动 ${currency(balanceDelta)}，市值变动 ${currency(marketDelta)}）。` });

  return {
    date: today, holdings, maturityCalendar, concentration, allocation,
    idleCash: { total: idleTotal, threshold: idleThreshold, items: idleItems },
    cashflow: { balanceDelta, marketDelta, netChange, days: last30.length },
    insights,
    disclaimer: '以上为基于本地演示数据与自设阈值的量化盘点，不构成投资建议。'
  };
}

/** 规则评估：到期、止盈止损、价格异动、配置偏离、闲置资金、久未记账 */
export function evaluateRules(target: DemoState = state): number {
  const today = todayStr();
  const stamp = new Date().toISOString();
  let created = 0;
  const push = (rule: Rule, key: string, title: string, message: string, context: Record<string, unknown>) => {
    if (target.alerts.some((a) => a.dedupe_key === key && a.fired_at.slice(0, 10) === today)) return;
    if (target.alerts.some((a) => a.dedupe_key === key && a.state === 'SNOOZED' && (a.snoozed_until ?? '') > stamp)) return;
    const level = (rule.action.level as string) ?? 'INFO';
    target.alerts.unshift({
      id: uid(), rule_id: rule.id, dedupe_key: key, level, title, message,
      state: 'PENDING', context: JSON.stringify(context), fired_at: stamp,
      acked_at: null, snoozed_until: null
    });
    created += 1;
  };

  for (const rule of target.rules.filter((r) => r.enabled)) {
    const condition = rule.condition as Record<string, number | boolean>;
    const positions = listPositions(target).filter((p) => p.status !== 'CLOSED');
    switch (rule.rule_type) {
      case 'MATURITY': {
        const daysBefore = Number(condition.daysBefore ?? 7);
        for (const position of positions) {
          if (!position.maturity_date) continue;
          const left = dayDiff(today, position.maturity_date);
          if (left > daysBefore || left < -30) continue;
          push(rule, `MATURITY:${position.id}:${position.maturity_date}`,
            left < 0 ? `${position.product_name} 已到期 ${Math.abs(left)} 天` : `${position.product_name} ${left === 0 ? '今日到期' : `${left} 天后到期`}`,
            `到期日 ${position.maturity_date}，持仓市值约 ${currency(position.value)}，请及时安排赎回或续投。`,
            { positionId: position.id, daysLeft: left });
        }
        break;
      }
      case 'TAKE_PROFIT':
      case 'STOP_LOSS': {
        const threshold = Number(condition.rate ?? (rule.rule_type === 'TAKE_PROFIT' ? 15 : -10));
        for (const position of positions) {
          const hit = rule.rule_type === 'TAKE_PROFIT' ? position.rate >= threshold : position.rate <= threshold;
          if (!hit) continue;
          push(rule, `${rule.rule_type}:${position.id}:${today}`,
            `${position.product_name} 收益率 ${position.rate >= 0 ? '+' : ''}${position.rate}%`,
            `成本价 ${currency(position.cost_price)}，现价 ${currency(position.current_price)}，触发${rule.rule_type === 'TAKE_PROFIT' ? '止盈' : '止损'}阈值 ${threshold}%。请结合自己的判断决定是否调整持仓。`,
            { positionId: position.id, rate: position.rate });
        }
        break;
      }
      case 'PRICE_MOVE': {
        const threshold = Number(condition.rate ?? 5);
        for (const product of target.products) {
          const quotes = target.quotes.filter((q) => q.productId === product.id).sort((a, b) => a.date.localeCompare(b.date));
          if (quotes.length < 2) continue;
          const last = quotes.at(-1)!, previous = quotes.at(-2)!;
          if (!previous.price) continue;
          const rate = round(((last.price - previous.price) / previous.price) * 100);
          if (Math.abs(rate) < threshold) continue;
          push(rule, `PRICE_MOVE:${product.id}:${last.date}:${rate}`,
            `${product.name} ${rate >= 0 ? '上涨' : '下跌'} ${Math.abs(rate)}%`,
            `${previous.date} ${currency(previous.price)} → ${last.date} ${currency(last.price)}，超过设定的 ${threshold}% 波动阈值。`,
            { productId: product.id, rate });
        }
        break;
      }
      case 'ALLOCATION_DRIFT': {
        const tolerance = Number(condition.tolerance ?? 10);
        const distribution = getDistribution(today, target);
        if (distribution.totals.accountTotal <= 0) break;
        for (const [key, expected] of Object.entries(JSON.parse(target.settings.target_allocation || '{}') as Record<string, number>)) {
          const current = distribution.groups.find((g) => g.key === key)?.share ?? 0;
          const gap = round(current - expected);
          if (Math.abs(gap) < tolerance) continue;
          push(rule, `ALLOCATION_DRIFT:${key}:${today}`,
            `${labelOf(key)} 配置偏离 ${gap > 0 ? '+' : ''}${gap} 个百分点`,
            `当前占比 ${current}%，目标占比 ${expected}%，超出容差 ${tolerance} 个百分点。`, { key, current, expected });
        }
        break;
      }
      case 'IDLE_CASH': {
        const threshold = Number(target.settings.idle_cash_threshold || 50000);
        for (const item of getDistribution(today, target).items) {
          if (item.type !== 'CASH' || item.archived || item.amount < threshold) continue;
          push(rule, `IDLE_CASH:${item.id}:${today}`, `${item.name} 有 ${currency(item.amount)} 闲置资金`,
            `余额高于阈值 ${currency(threshold)}，可关注是否需要调整资金去向。`, { accountId: item.id, amount: item.amount });
        }
        break;
      }
      case 'DATA_STALE': {
        const days = Number(condition.days ?? 3);
        const latest = latestRecordDate(target);
        if (latest && dayDiff(latest, today) < days) break;
        push(rule, `DATA_STALE:${latest ?? 'EMPTY'}`, latest ? `已 ${dayDiff(latest, today)} 天未更新余额` : '还没有录入任何资产数据',
          '资金分布与资产趋势依赖台账数据，请及时补录最新的账户余额与产品报价。', { latest });
        break;
      }
      default: break;
    }
  }
  target.alerts = target.alerts.slice(0, 200);
  return created;
}

/** 写入统一收口：重算快照 → 评估规则 → 持久化 → 广播刷新（所有页面同步） */
export function commit(reason: string, affectedFrom?: string): ChangeEvent {
  const result = recomputeSnapshots(state);
  const newAlerts = evaluateRules(state);
  state.lastEvent = {
    reason, affectedFrom: affectedFrom ?? result.from,
    snapshotDays: result.days, newAlerts, at: new Date().toISOString()
  };
  save(state);
  window.dispatchEvent(new CustomEvent('asset:refresh', { detail: state.lastEvent }));
  return state.lastEvent;
}

export function replaceState(next: DemoState, reason: string): ChangeEvent {
  state = next;
  return commit(reason);
}

/* ------------------------------ CSV ------------------------------ */

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const delimiter = (firstLine.match(/\t/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const toCsv = (rows: Array<Array<string | number | null | undefined>>) => rows.map((row) =>
  row.map((value) => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',')
).join('\r\n');

const DATE_HEADERS = ['date', '日期', '记账日期', '时间'];
const ACCOUNT_HEADERS = ['account', '账户', '渠道', '账户名称', 'name'];
const AMOUNT_HEADERS = ['amount', '金额', '余额', '资产', 'balance'];

export function parseImport(text: string): ImportPreview {
  const table = parseCsv(text);
  if (table.length < 2) return { mode: 'WIDE', headers: [], rows: [], errors: ['CSV 内容为空或缺少数据行'] };
  const headers = table[0].map((h) => h.trim());
  const lower = headers.map((h) => h.toLowerCase());
  const find = (aliases: string[]) => lower.findIndex((h) => aliases.includes(h));
  const dateIdx = find(DATE_HEADERS), accountIdx = find(ACCOUNT_HEADERS), amountIdx = find(AMOUNT_HEADERS);
  const noteIdx = find(['note', '备注', '说明', 'memo']);
  if (dateIdx < 0) return { mode: 'WIDE', headers, rows: [], errors: ['未找到日期列（表头需包含 date / 日期）'] };
  const longMode = accountIdx >= 0 && amountIdx >= 0;
  const rows: ImportPreview['rows'] = [];
  const errors: string[] = [];
  const normalizeDate = (raw: string) => {
    const parts = raw.trim().replace(/[/.]/g, '-').split('-');
    if (parts.length !== 3) return null;
    const value = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  };
  for (let line = 1; line < table.length; line += 1) {
    const cells = table[line];
    const date = normalizeDate(cells[dateIdx] ?? '');
    if (!date) { errors.push(`第 ${line + 1} 行：日期无效，已跳过`); continue; }
    if (longMode) {
      const account = (cells[accountIdx] ?? '').trim();
      const raw = (cells[amountIdx] ?? '').trim();
      if (!account || raw === '') { errors.push(`第 ${line + 1} 行：账户或金额为空，已跳过`); continue; }
      rows.push({ date, account, amount: Number(raw.replace(/[,¥\s]/g, '')) || 0, note: noteIdx >= 0 ? (cells[noteIdx] ?? '').trim() : '' });
    } else {
      headers.forEach((account, col) => {
        if (col === dateIdx || !account) return;
        const raw = (cells[col] ?? '').trim();
        if (raw === '') return;
        rows.push({ date, account, amount: Number(raw.replace(/[,¥\s]/g, '')) || 0, note: '' });
      });
    }
  }
  return { mode: longMode ? 'LONG' : 'WIDE', headers, rows, errors };
}

function upsertBalance(accountId: string, date: string, amount: number, note: string, source: string): void {
  const existing = state.balances.find((b) => b.accountId === accountId && b.date === date);
  if (existing) { existing.amount = amount; existing.note = note; existing.source = source; }
  else state.balances.push({ id: uid(), accountId, date, amount, note, source });
}

function ensureAccount(name: string): { id: string; created: boolean } {
  const found = state.accounts.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (found) return { id: found.id, created: false };
  const type = /信用|贷款|欠款|负债|借款/.test(name) ? 'LIABILITY'
    : /证券|券商|股票/.test(name) ? 'BROKERAGE'
    : /基金|理财平台/.test(name) ? 'FUND'
    : /银行|储蓄|卡/.test(name) ? 'BANK' : 'CASH';
  const account: Account = {
    id: uid(), name, type, currency: 'CNY', include_in_total: 1, archived: 0,
    sort_order: state.accounts.length
  };
  state.accounts.push(account);
  return { id: account.id, created: true };
}

export function exportCsv(dataset: string): string {
  if (dataset === 'snapshots') {
    return toCsv([
      ['date', 'total_assets', 'total_liability', 'net_assets', 'account_total', 'position_total', 'estimated'],
      ...state.snapshots.map((s) => [s.date, s.total_assets, s.total_liability, s.net_assets, s.account_total, s.position_total, s.estimated ? 1 : 0])
    ]);
  }
  if (dataset === 'positions') {
    return toCsv([
      ['product', 'code', 'category', 'maturity_date', 'quantity', 'cost_price', 'current_price', 'opened_at', 'status'],
      ...listPositions().map((p) => [p.product_name, p.code, p.category, p.maturity_date, p.quantity, p.cost_price, p.current_price, p.opened_at, p.status])
    ]);
  }
  return toCsv([
    ['date', 'account', 'amount', 'note', 'source'],
    ...[...state.balances].sort((a, b) => a.date.localeCompare(b.date)).map((b) => [
      b.date, state.accounts.find((a) => a.id === b.accountId)?.name ?? '', b.amount, b.note, b.source
    ])
  ]);
}

/* ------------------------- 本地接口路由 ------------------------- */

const pathOf = (url: string) => url.replace(/^\/api/, '');
const queryOf = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

export function handleGet(url: string): unknown {
  const path = pathOf(url).split('?')[0];
  const query = queryOf(url);
  switch (path) {
    case '/summary': return getSummary();
    case '/trend': return getTrend(query.get('from') ?? shiftDate(todayStr(), -89), query.get('to') ?? todayStr());
    case '/distribution': return getDistribution(query.get('date') ?? todayStr());
    case '/snapshots': {
      const date = query.get('date') ?? todayStr();
      const snapshot = state.snapshots.find((s) => s.date === date) ?? null;
      return { snapshot: snapshot ? { ...snapshot, items: undefined } : null, items: snapshot?.items ?? [] };
    }
    case '/balances': {
      const accountId = query.get('accountId');
      const rows: BalanceRecord[] = state.balances
        .filter((b) => !accountId || b.accountId === accountId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 200)
        .map((b) => ({
          id: b.id, account_id: b.accountId, recorded_on: b.date, amount: b.amount,
          note: b.note, source: b.source,
          account_name: state.accounts.find((a) => a.id === b.accountId)?.name ?? '',
          account_type: state.accounts.find((a) => a.id === b.accountId)?.type ?? ''
        }));
      return rows;
    }
    case '/accounts': return [...state.accounts].sort((a, b) => a.archived - b.archived || a.sort_order - b.sort_order);
    case '/products': return state.products.map((p) => ({ ...p, position_count: state.positions.filter((x) => x.product_id === p.id && x.status !== 'CLOSED').length }));
    case '/positions': return listPositions();
    case '/quotes': {
      const productId = query.get('productId');
      return [...state.quotes].filter((q) => !productId || q.productId === productId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
    }
    case '/rules': return state.rules;
    case '/alerts': {
      const filter = query.get('state') ?? 'ALL';
      return filter === 'ALL' ? state.alerts : state.alerts.filter((a) => a.state === filter);
    }
    case '/analysis': return getAnalysis();
    case '/settings': return state.settings;
    case '/meta': return { accountTypes: ACCOUNT_TYPE_LABELS, productCategories: PRODUCT_CATEGORY_LABELS, ruleTypes: RULE_TYPE_LABELS };
    case '/audit': return [];
    default: throw new Error(`未知接口：${url}`);
  }
}

type Body = Record<string, any>;

export function handleMutation(method: string, url: string, rawBody: unknown): unknown {
  const body = (rawBody ?? {}) as Body;
  const path = pathOf(url).split('?')[0];
  const segments = path.split('/').filter(Boolean);

  if (method === 'POST' && path === '/balances/batch') {
    const date = body.date || todayStr();
    const entries = (body.entries ?? []) as Array<{ accountId: string; amount: number | string; note?: string }>;
    let saved = 0;
    for (const entry of entries) {
      if (!entry.accountId || entry.amount === '' || entry.amount === null || entry.amount === undefined) continue;
      upsertBalance(entry.accountId, date, Number(entry.amount) || 0, entry.note ?? '', 'MANUAL');
      saved += 1;
    }
    const event = commit('BALANCE_BATCH', date);
    return { saved, date, event, distribution: getDistribution(date), latestRecordDate: latestRecordDate() };
  }
  if (method === 'POST' && path === '/balances/copy-latest') {
    const date = body.date || todayStr();
    let saved = 0;
    for (const account of state.accounts.filter((a) => !a.archived)) {
      const previous = state.balances.filter((b) => b.accountId === account.id && b.date < date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      if (!previous) continue;
      upsertBalance(account.id, date, previous.amount, '', 'COPY');
      saved += 1;
    }
    const event = commit('BALANCE_COPY', date);
    return { saved, date, event, distribution: getDistribution(date) };
  }
  if (method === 'DELETE' && segments[0] === 'balances') {
    state.balances = state.balances.filter((b) => b.id !== segments[1]);
    return { ok: true, event: commit('BALANCE_DELETE') };
  }

  if (method === 'POST' && path === '/accounts') {
    const name = String(body.name ?? '').trim();
    if (!name) throw new Error('账户名称不能为空');
    if (state.accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) throw new Error('已存在同名账户');
    const account: Account = {
      id: uid(), name, type: body.type ?? 'CASH', currency: 'CNY',
      include_in_total: body.includeInTotal === false ? 0 : 1, archived: 0, sort_order: state.accounts.length
    };
    state.accounts.push(account);
    commit('ACCOUNT_CREATE');
    return account;
  }
  if (method === 'PATCH' && segments[0] === 'accounts') {
    const account = state.accounts.find((a) => a.id === segments[1]);
    if (!account) throw new Error('账户不存在');
    if (body.name !== undefined) account.name = String(body.name);
    if (body.type !== undefined) account.type = body.type;
    if (body.archived !== undefined) account.archived = body.archived ? 1 : 0;
    if (body.includeInTotal !== undefined) account.include_in_total = body.includeInTotal ? 1 : 0;
    commit('ACCOUNT_UPDATE');
    return account;
  }
  if (method === 'DELETE' && segments[0] === 'accounts') {
    state.accounts = state.accounts.filter((a) => a.id !== segments[1]);
    state.balances = state.balances.filter((b) => b.accountId !== segments[1]);
    commit('ACCOUNT_DELETE');
    return { ok: true };
  }

  if (method === 'POST' && path === '/data/import/preview') return parseImport(String(body.csv ?? ''));
  if (method === 'POST' && path === '/data/import') {
    const preview = parseImport(String(body.csv ?? ''));
    if (!preview.rows.length) throw new Error(preview.errors[0] ?? '未解析到有效数据行');
    const createdAccounts: string[] = [];
    const dates = new Set<string>();
    for (const row of preview.rows) {
      const account = ensureAccount(row.account);
      if (account.created) createdAccounts.push(row.account);
      upsertBalance(account.id, row.date, row.amount, row.note, 'CSV');
      dates.add(row.date);
    }
    const affectedFrom = [...dates].sort()[0] ?? todayStr();
    const event = commit('CSV_IMPORT', affectedFrom);
    return {
      ...preview, imported: preview.rows.length, createdAccounts, affectedFrom,
      dates: [...dates].sort(), event, distribution: getDistribution(todayStr()), summary: getSummary()
    } as ImportResult;
  }
  if (method === 'POST' && path === '/data/demo') {
    return { event: replaceState(buildDemoState(), 'DEMO_DATA'), distribution: getDistribution(todayStr()), summary: getSummary() };
  }
  if (method === 'POST' && path === '/data/reset') {
    if (body.confirm !== 'RESET') throw new Error('请确认重置操作');
    return { ok: true, event: replaceState(emptyState(), 'DATA_RESET') };
  }

  if (method === 'POST' && path === '/quotes') {
    const productId = String(body.productId ?? '');
    const date = body.date || todayStr();
    const price = Number(body.price);
    if (!productId || !Number.isFinite(price) || price < 0) throw new Error('请选择产品并填写有效价格');
    const existing = state.quotes.find((q) => q.productId === productId && q.date === date);
    if (existing) existing.price = price;
    else state.quotes.push({ id: uid(), productId, date, price });
    const latest = state.quotes.filter((q) => q.productId === productId).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    for (const position of state.positions.filter((p) => p.product_id === productId && p.status !== 'CLOSED')) {
      position.current_price = latest?.price ?? price;
    }
    const event = commit('QUOTE_UPDATE', date);
    return { productId, date, price, event };
  }

  if (method === 'POST' && path === '/products') {
    const name = String(body.name ?? '').trim();
    if (!name) throw new Error('产品名称不能为空');
    const product: Product = {
      id: uid(), name, code: body.code ?? '', category: body.category ?? 'FUND',
      maturity_date: body.maturityDate || null, target_return_rate: body.targetReturnRate === '' ? null : Number(body.targetReturnRate) || null,
      note: body.note ?? ''
    };
    state.products.push(product);
    commit('PRODUCT_UPDATE');
    return product;
  }
  if (method === 'PATCH' && segments[0] === 'products') {
    const product = state.products.find((p) => p.id === segments[1]);
    if (!product) throw new Error('产品不存在');
    Object.assign(product, {
      name: body.name ?? product.name, code: body.code ?? product.code,
      category: body.category ?? product.category,
      maturity_date: body.maturityDate === undefined ? product.maturity_date : (body.maturityDate || null)
    });
    commit('PRODUCT_UPDATE');
    return product;
  }
  if (method === 'DELETE' && segments[0] === 'products') {
    if (state.positions.some((p) => p.product_id === segments[1])) throw new Error('该产品下仍有持仓，请先删除持仓');
    state.products = state.products.filter((p) => p.id !== segments[1]);
    commit('PRODUCT_UPDATE');
    return { ok: true };
  }

  if (method === 'POST' && path === '/positions') {
    if (!state.products.some((p) => p.id === body.productId)) throw new Error('请选择有效的产品');
    const position: RawPosition = {
      id: uid(), product_id: body.productId, account_id: body.accountId || null,
      quantity: Number(body.quantity) || 0, cost_price: Number(body.costPrice) || 0,
      current_price: Number(body.currentPrice) || Number(body.costPrice) || 0,
      opened_at: body.openedAt || todayStr(), closed_at: null, status: 'HOLDING', note: body.note ?? ''
    };
    state.positions.push(position);
    commit('POSITION_CREATE', position.opened_at);
    return position;
  }
  if (method === 'PATCH' && segments[0] === 'positions') {
    const position = state.positions.find((p) => p.id === segments[1]);
    if (!position) throw new Error('持仓不存在');
    for (const [field, key] of Object.entries({ quantity: 'quantity', costPrice: 'cost_price', currentPrice: 'current_price', openedAt: 'opened_at', status: 'status', note: 'note' })) {
      if (body[field] !== undefined) (position as unknown as Record<string, unknown>)[key] = body[field];
    }
    if (body.currentPrice !== undefined) {
      const date = todayStr();
      const existing = state.quotes.find((q) => q.productId === position.product_id && q.date === date);
      if (existing) existing.price = Number(body.currentPrice);
      else state.quotes.push({ id: uid(), productId: position.product_id, date, price: Number(body.currentPrice) });
    }
    commit('POSITION_UPDATE', position.opened_at);
    return position;
  }
  if (method === 'DELETE' && segments[0] === 'positions') {
    state.positions = state.positions.filter((p) => p.id !== segments[1]);
    commit('POSITION_DELETE');
    return { ok: true };
  }

  if (method === 'POST' && path === '/rules') {
    const rule: Rule = {
      id: uid(), name: String(body.name ?? '新规则'), rule_type: String(body.ruleType ?? 'MATURITY'),
      scope: body.scope ?? {}, condition: body.condition ?? {}, action: body.action ?? {}, enabled: body.enabled !== false
    };
    state.rules.push(rule);
    commit('RULE_CREATE');
    return rule;
  }
  if (method === 'PATCH' && segments[0] === 'rules') {
    const rule = state.rules.find((r) => r.id === segments[1]);
    if (!rule) throw new Error('规则不存在');
    if (body.name !== undefined) rule.name = body.name;
    if (body.condition !== undefined) rule.condition = body.condition;
    if (body.action !== undefined) rule.action = body.action;
    if (body.enabled !== undefined) rule.enabled = Boolean(body.enabled);
    commit('RULE_UPDATE');
    return rule;
  }
  if (method === 'DELETE' && segments[0] === 'rules') {
    state.rules = state.rules.filter((r) => r.id !== segments[1]);
    commit('RULE_DELETE');
    return { ok: true };
  }
  if (method === 'POST' && path === '/rules/evaluate') {
    const newAlerts = evaluateRules(state);
    save(state);
    const event: ChangeEvent = { reason: 'MANUAL_EVALUATE', newAlerts, at: new Date().toISOString() };
    state.lastEvent = event;
    window.dispatchEvent(new CustomEvent('asset:refresh', { detail: event }));
    return { ...event, alerts: state.alerts.slice(0, 20) };
  }

  if (method === 'POST' && path === '/alerts/ack-all') {
    const count = state.alerts.filter((a) => a.state === 'PENDING').length;
    state.alerts.filter((a) => a.state === 'PENDING').forEach((a) => { a.state = 'ACKED'; a.acked_at = new Date().toISOString(); });
    save(state);
    const event: ChangeEvent = { reason: 'ALERT_ACK_ALL', at: new Date().toISOString() };
    window.dispatchEvent(new CustomEvent('asset:refresh', { detail: event }));
    return { updated: count };
  }
  if (method === 'POST' && segments[0] === 'alerts' && segments[2] === 'state') {
    const alert = state.alerts.find((a) => a.id === segments[1]);
    if (!alert) throw new Error('提醒不存在');
    const next = String(body.state);
    if (!['PENDING', 'ACKED', 'SNOOZED', 'IGNORED'].includes(next)) throw new Error('无效的提醒状态');
    alert.state = next;
    alert.acked_at = next === 'ACKED' || next === 'IGNORED' ? new Date().toISOString() : null;
    alert.snoozed_until = next === 'SNOOZED' ? new Date(Date.now() + Number(body.hours ?? 24) * 3600000).toISOString() : null;
    save(state);
    const event: ChangeEvent = { reason: 'ALERT_STATE', at: new Date().toISOString() };
    window.dispatchEvent(new CustomEvent('asset:refresh', { detail: event }));
    return alert;
  }

  if (method === 'PUT' && path === '/settings') {
    for (const [key, value] of Object.entries(body)) {
      if (key in state.settings) (state.settings as unknown as Record<string, unknown>)[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    save(state);
    const event: ChangeEvent = { reason: 'SETTINGS_UPDATE', at: new Date().toISOString() };
    window.dispatchEvent(new CustomEvent('asset:refresh', { detail: event }));
    return state.settings;
  }

  throw new Error(`暂不支持的操作：${method} ${path}`);
}
