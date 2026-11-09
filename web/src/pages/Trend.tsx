import { useMemo, useState } from 'react';
import { downloadFile, useApi, useData } from '../api';
import CsvImportModal from '../CsvImportModal';
import { compositionOption, deltaOption, netWorthOption } from '../charts';
import { Badge, Button, Card, Chart, Empty, Input, Kpi, Loading, Modal, Tabs, useToast } from '../components';
import type { Distribution, Trend, TrendPoint } from '../types';
import { compact, money, pct, reasonLabel, shiftDate, signed, todayStr, toneOf } from '../utils';

type Range = '7D' | '30D' | '90D' | '1Y' | 'ALL';
const DAYS: Record<Range, number | null> = { '7D': 6, '30D': 29, '90D': 89, '1Y': 364, ALL: null };

interface SnapshotItem {
  accountId: string | null; positionId: string | null;
  kind: 'ACCOUNT' | 'POSITION' | 'LIABILITY';
  name: string; groupKey: string; amount: number; estimated: boolean;
}

interface Props { onNavigate: (route: string) => void }

export default function Trend({ onNavigate }: Props) {
  const [range, setRange] = useState<Range>('90D');
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(shiftDate(todayStr(), -89));
  const [to, setTo] = useState(todayStr());
  const [importOpen, setImportOpen] = useState(false);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const { lastEvent } = useData();
  const toast = useToast();

  const days = DAYS[range];
  const start = custom ? from : days === null ? '2000-01-01' : shiftDate(todayStr(), -days);
  const end = custom ? to : todayStr();
  const trend = useApi<Trend>(`/api/trend?from=${start}&to=${end}`);
  const distribution = useApi<Distribution>(`/api/distribution?date=${todayStr()}`);
  const detail = useApi<{ snapshot: unknown; items: SnapshotItem[] }>(detailDate ? `/api/snapshots?date=${detailDate}` : null);

  const points = trend.data?.points ?? [];
  const latest = points.at(-1);
  const first = points[0];
  const periodChange = latest && first ? Math.round((latest.net_assets - first.net_assets) * 100) / 100 : 0;
  const changeRate = first?.net_assets ? Math.round((periodChange / Math.abs(first.net_assets)) * 10000) / 100 : 0;
  const estimatedDays = points.filter((p) => p.estimated).length;

  const rows = useMemo(() => [...points].reverse().slice(0, 14), [points]);

  const exportCsv = async (dataset: string) => {
    try {
      downloadFile(`/api/data/export?dataset=${dataset}`, `${dataset}-${todayStr()}.csv`);
      toast('CSV 已导出');
    } catch (error) { toast((error as Error).message, 'error'); }
  };

  return (
    <>
      <div className="grid grid-4">
        <Kpi label="区间净资产" value={money(latest?.net_assets)} mark={latest?.date ?? '—'} sub={`区间内共 ${points.length} 天快照`} />
        <Kpi label="区间变化" value={signed(periodChange)} tone={toneOf(periodChange) === 'positive' ? 'positive' : 'negative'} sub={`较区间起点 ${pct(changeRate)}`} />
        <Kpi label="结转估算天数" value={estimatedDays} sub="无当日登记时沿用最近一次余额" />
        <Kpi label="当前资金分布" value={compact(distribution.data?.totals.accountTotal)} sub={`持仓市值 ${compact(distribution.data?.totals.positionTotal)} · 负债 ${compact(distribution.data?.totals.liability)}`} />
      </div>

      <Card
        title="趋势与数据联动"
        subtitle="CSV 导入或余额录入后，快照会立即重算，资金分布页面同步刷新"
        extra={<>
          <Button size="sm" variant="primary" onClick={() => setImportOpen(true)}>导入 CSV</Button>
          <Button size="sm" onClick={() => exportCsv('snapshots')}>导出快照</Button>
          <Button size="sm" onClick={() => exportCsv('balances')}>导出余额流水</Button>
        </>}
      >
        <div className="grid grid-3" style={{ gap: 12 }}>
          <div className="notice">
            <b>最近一次同步</b><br />
            {lastEvent
              ? `${reasonLabel[lastEvent.reason] ?? lastEvent.reason} · 重算 ${lastEvent.snapshotDays ?? 0} 天`
              : '当前为内置演示数据，可在设置页重新生成'}
          </div>
          <div className="notice">
            <b>最新台账日期</b><br />
            {distribution.data?.latestRecordDate ?? '—'} · 渠道余额 {compact(distribution.data?.totals.accountTotal)}
          </div>
          <div className="notice" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div><b>查看分布</b><br />导入历史数据后可回看任意日期的分布</div>
            <Button size="sm" onClick={() => onNavigate('distribution')}>前往 →</Button>
          </div>
        </div>
      </Card>

      <div className="row-between">
        <Tabs value={custom ? ('ALL' as Range) : range} onChange={(value) => { setRange(value); setCustom(false); }} items={[
          { value: '7D', label: '近 7 天' }, { value: '30D', label: '近 30 天' }, { value: '90D', label: '近 90 天' },
          { value: '1Y', label: '近 1 年' }, { value: 'ALL', label: '全部' }
        ]} />
        <div className="row">
          <div className="inline-field"><span className="field-label">从</span><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setCustom(true); }} /></div>
          <div className="inline-field"><span className="field-label">至</span><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setCustom(true); }} /></div>
        </div>
      </div>

      {trend.loading && !trend.data ? <Loading height={260} /> : trend.error ? <div className="error-hint">{trend.error}</div> : (
        <>
          <Card title="净资产走势" subtitle="每日快照 · 鼠标悬停可查看当日资产与变化">
            {points.length ? <Chart option={netWorthOption(points)} height={300} /> : <Empty title="该区间暂无快照" description="换一个时间范围，或导入历史数据。" />}
          </Card>

          <div className="grid grid-2">
            <Card title="资产构成变化" subtitle="按账户类型与产品类别堆叠">
              {trend.data?.series.length ? <Chart option={compositionOption(trend.data)} height={280} /> : <Empty title="暂无构成数据" />}
            </Card>
            <Card title="每日净资产变化" subtitle="柱状图区分流入流出与市值波动">
              {points.length ? <Chart option={deltaOption(points)} height={280} /> : <Empty title="暂无变化数据" />}
            </Card>
          </div>

          <Card title="每日快照明细" subtitle="点击「明细」查看当日各账户余额与持仓估值" noPadding>
            {rows.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>日期</th><th className="num">净资产</th><th className="num">渠道余额</th>
                      <th className="num">持仓市值</th><th className="num">资金变动</th><th className="num">市值变动</th>
                      <th className="num">日变化</th><th>状态</th><th className="actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((point: TrendPoint) => (
                      <tr key={point.date}>
                        <td className="mono">{point.date}</td>
                        <td className="num">{money(point.net_assets)}</td>
                        <td className="num muted">{money(point.account_total)}</td>
                        <td className="num muted">{money(point.position_total)}</td>
                        <td className={`num ${toneOf(point.balanceDelta)}`}>{signed(point.balanceDelta)}</td>
                        <td className={`num ${toneOf(point.marketDelta)}`}>{signed(point.marketDelta)}</td>
                        <td className={`num ${toneOf(point.delta)}`}>{signed(point.delta)}</td>
                        <td>{point.estimated ? <Badge tone="warning">含估算</Badge> : <Badge tone="positive">已登记</Badge>}</td>
                        <td className="actions"><Button size="sm" variant="ghost" onClick={() => setDetailDate(point.date)}>明细</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="暂无快照明细" />}
          </Card>
        </>
      )}

      <CsvImportModal open={importOpen} onClose={() => setImportOpen(false)} onNavigate={onNavigate} />

      <Modal open={Boolean(detailDate)} title={`${detailDate ?? ''} 快照明细`} onClose={() => setDetailDate(null)} width={620} footer={<Button onClick={() => setDetailDate(null)}>关闭</Button>}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>项目</th><th>类型</th><th className="num">金额</th><th>来源</th></tr></thead>
            <tbody>
              {(detail.data?.items ?? []).map((item, index) => (
                <tr key={index}>
                  <td>{item.name}</td>
                  <td className="faint small">{item.kind === 'POSITION' ? '持仓估值' : item.kind === 'LIABILITY' ? '负债' : '账户余额'}</td>
                  <td className="num">{money(item.amount)}</td>
                  <td>{item.estimated ? <Badge tone="warning">结转估算</Badge> : <Badge tone="positive">当日登记</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!detail.data?.items.length && <Empty title="当日没有明细" />}
      </Modal>
    </>
  );
}
