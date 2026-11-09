export interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  include_in_total: number;
  archived: number;
  sort_order: number;
}

export interface DistributionItem extends Account {
  amount: number;
  asOf: string | null;
  estimated: boolean;
  previousAmount: number | null;
  delta: number;
  note: string;
  source: string;
  share: number;
}

export interface Distribution {
  date: string;
  latestRecordDate: string | null;
  items: DistributionItem[];
  groups: Array<{ key: string; label: string; amount: number; share: number }>;
  positionsByAccount: Record<string, number>;
  totals: {
    accountTotal: number;
    positionTotal: number;
    liability: number;
    totalAssets: number;
    netAssets: number;
  };
}

export interface TrendPoint {
  date: string;
  total_assets: number;
  total_liability: number;
  net_assets: number;
  account_total: number;
  position_total: number;
  estimated: boolean;
  delta: number;
  balanceDelta: number;
  marketDelta: number;
  liabilityDelta: number;
}

export interface Trend {
  from: string;
  to: string;
  points: TrendPoint[];
  series: Array<{ key: string; name: string; data: number[] }>;
}

export interface Summary {
  date: string | null;
  netAssets: number;
  totalAssets: number;
  liability: number;
  accountTotal: number;
  positionTotal: number;
  dayChange: number;
  dayChangeRate: number;
  monthChange: number;
  monthChangeRate: number;
  estimated: boolean;
  latestRecordDate: string | null;
  accountCount: number;
  pendingAlerts: number;
  holdingPositions: number;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  maturity_date: string | null;
  target_return_rate: number | null;
  note: string;
  position_count?: number;
}

export interface Position {
  id: string;
  product_id: string;
  account_id: string | null;
  quantity: number;
  cost_price: number;
  current_price: number;
  opened_at: string;
  closed_at: string | null;
  status: string;
  note: string;
  product_name: string;
  code: string;
  category: string;
  maturity_date: string | null;
  account_name: string | null;
  value: number;
  cost: number;
  profit: number;
  rate: number;
  daysLeft: number | null;
  maturityState: 'NONE' | 'OVERDUE' | 'SOON' | 'NORMAL';
}

export interface Rule {
  id: string;
  name: string;
  rule_type: string;
  scope: Record<string, unknown>;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  enabled: boolean;
}

export interface AlertEvent {
  id: string;
  rule_id: string | null;
  dedupe_key: string;
  level: string;
  title: string;
  message: string;
  state: string;
  context: string;
  fired_at: string;
  acked_at: string | null;
  snoozed_until: string | null;
}

export interface BalanceRecord {
  id: string;
  account_id: string;
  recorded_on: string;
  amount: number;
  note: string;
  source: string;
  account_name: string;
  account_type: string;
}

export interface Holding {
  id: string;
  name: string;
  code: string;
  category: string;
  maturityDate: string | null;
  daysLeft: number | null;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  value: number;
  cost: number;
  profit: number;
  rate: number;
  status: string;
  accountName: string | null;
}

export interface Analysis {
  date: string;
  holdings: Holding[];
  maturityCalendar: Array<{
    id: string; name: string; maturityDate: string | null; daysLeft: number | null; value: number; overdue: boolean;
  }>;
  concentration: {
    top1Share: number; top3Share: number; hhi: number;
    ranked: Array<{ name: string; amount: number; type: string; share: number }>;
  };
  allocation: Array<{
    key: string; label: string; amount: number; current: number; expected: number; gap: number; drifted: boolean;
  }>;
  idleCash: {
    total: number; threshold: number;
    items: Array<{ id: string; name: string; amount: number; asOf: string | null }>;
  };
  cashflow: { balanceDelta: number; marketDelta: number; netChange: number; days: number };
  insights: Array<{ level: 'INFO' | 'WARN'; text: string }>;
  disclaimer: string;
}

export interface ImportPreview {
  mode: 'WIDE' | 'LONG';
  headers: string[];
  rows: Array<{ date: string; account: string; amount: number; note: string }>;
  errors: string[];
}

export interface ImportResult extends ImportPreview {
  imported: number;
  createdAccounts: string[];
  affectedFrom: string | null;
  dates: string[];
  distribution: Distribution;
  event: { affectedFrom: string; snapshotDays: number; newAlerts: number };
}
