import { useMemo, useState } from 'react';
import { api, useApi } from '../api';
import { netWorthOption, pieOption } from '../charts';
import { Badge, Button, Card, Chart, Empty, Kpi, Loading, Progress, Tabs, useToast } from '../components';
import type { AlertEvent, Analysis, Distribution, Summary, Trend } from '../types';
import { compact, money, pct, shiftDate, signed, todayStr, toneOf } from '../utils';

type Range = '7D' | '30D' | '90D' | '1Y' | 'ALL';
const RANGE_DAYS: Record<Range, number | null> = { '7D': 6, '30D': 29, '90D': 89, '1Y': 364, ALL: null };

interface Props { onNavigate: (route: string) => void }

export default function Dashboard({ onNavigate }: Props) {
  const [range, setRange] = useState<Range>('30D');
  const toast = useToast();
  const date = todayStr();
  const days = RANGE_DAYS[range];
  const trendPath = `/api/trend?from=${days === null ? '2000-01-01' : shiftDate(date, -days)}&to=${date}`;
  const summary = useApi<Summary>('/api/summary');
  const trend = useApi<Trend>(trendPath);
  const distribution = useApi<Distribution>(`/api/distribution?date=${date}`);
  const alerts = useApi<AlertEvent[]>('/api/alerts?state=PENDING');
  const analysis = useApi<Analysis>('/api/analysis');
  const [loadingDemo, setLoadingDemo] = useState(false);

  const pieData = useMemo(
    () => (distribution.data?.items ?? [])
      .filter((item) => item.type !== 'LIABILITY' && !item.archived && item.amount > 0)
      .map((item) => ({ name: item.name, value: item.amount }))
      .concat(distribution.data?.totals.positionTotal
        ? [{ name: '持仓市值', value: distribution.data.totals.positionTotal }]
        : []),
    [distribution.data]
  );

  const loadDemo = async () => {
    setLoadingDemo(true);
    try {
      await api.post('/api/data/demo');
      toast('演示数据已载入，趋势与分布已同步');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setLoadingDemo(false);
    }
  };

  if (summary.loading && !summary.data) return <Loading height={260} />;
  const s = summary.data;
  const isEmpty = !s?.date;

  return (
    <>
      {isEmpty && (
        <div className="hero-strip">
          <div className="empty-glyph" style={{ width: 40, height: 40, margin: 0, fontSize: 18 }}>◇</div>
          <div style={{ flex: 1 }}>
            <h4>还没有资产数据，先建立第一笔台账</h4>
            <p>录入各渠道余额即可自动生成每日快照；也可以导入历史 CSV 或直接载入演示数据体验完整功能。</p>
          </div>
          <div className="row">
            <Button size="sm" loading={loadingDemo} onClick={loadDemo}>载入演示数据</Button>
            <Button size="sm" variant="primary" onClick={() => onNavigate('distribution')}>录入余额</Button>
            <Button size="sm" onClick={() => onNavigate('settings')}>导入 CSV</Button>
          </div>
        </div>
      )}

      <div className="grid grid-4">
        <Kpi label="净资产" value={money(s?.netAssets)} tone="accent" mark={s?.date ?? '暂无快照'} sub={`总资产 ${money(s?.totalAssets)} · 负债 ${money(s?.liability)}`} />
        <Kpi label="今日变化" value={signed(s?.dayChange)} tone={toneOf(s?.dayChange ?? 0) === 'positive' ? 'positive' : 'negative'} sub={`较上一快照 ${pct(s?.dayChangeRate)}`} />
        <Kpi label="近 30 天变化" value={signed(s?.monthChange)} tone={toneOf(s?.monthChange ?? 0) === 'positive' ? 'positive' : 'negative'} sub={`区间收益率 ${pct(s?.monthChangeRate)}`} />
        <Kpi label="待处理提醒" value={s?.pendingAlerts ?? 0} sub={`${s?.accountCount ?? 0} 个账户 · ${s?.holdingPositions ?? 0} 笔持仓`} />
      </div>

      <div className="grid grid-main">
        <Card
          title="净资产走势"
          subtitle={s?.estimated ? '近期含结转估算数据（沿用最近一次登记余额）' : '基于每日资产快照'}
          extra={<Tabs value={range} onChange={setRange} items={[
            { value: '7D', label: '近 7 天' }, { value: '30D', label: '近 30 天' },
            { value: '90D', label: '近 90 天' }, { value: '1Y', label: '近 1 年' }, { value: 'ALL', label: '全部' }
          ]} />}
        >
          {trend.data?.points.length
            ? <Chart option={netWorthOption(trend.data.points)} height={300} />
            : <Empty title="暂无趋势数据" description="录入余额或导入历史 CSV 后，这里会自动生成净值曲线。" action={<Button size="sm" onClick={() => onNavigate('distribution')}>去录入</Button>} />}
        </Card>

        <Card title="资金分布" subtitle={`截至 ${distribution.data?.date ?? date}`} extra={<Button size="sm" variant="ghost" onClick={() => onNavigate('distribution')}>管理 →</Button>}>
          {pieData.length
            ? <>
                <Chart option={pieOption(pieData)} height={228} />
                <div className="row-between small" style={{ padding: '4px 4px 0' }}>
                  <span className="muted">渠道余额 {compact(distribution.data?.totals.accountTotal)}</span>
                  <span className="muted">持仓市值 {compact(distribution.data?.totals.positionTotal)}</span>
                </div>
              </>
            : <Empty title="暂无分布数据" description="先在资金分布页填写各渠道余额。" />}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="待处理提醒" extra={<Button size="sm" variant="ghost" onClick={() => onNavigate('alerts')}>查看全部 →</Button>} noPadding>
          {alerts.data?.length
            ? <div className="list">
                {alerts.data.slice(0, 5).map((alert) => (
                  <div className="list-item" key={alert.id}>
                    <span className={`dot ${alert.level === 'URGENT' ? 'negative' : alert.level === 'WARN' ? 'warning' : 'info'}`}
                      style={{ background: alert.level === 'URGENT' ? 'var(--red)' : alert.level === 'WARN' ? 'var(--amber)' : 'var(--accent)' }} />
                    <div>
                      <div className="list-title">{alert.title}</div>
                      <div className="list-desc">{alert.message}</div>
                    </div>
                    <div className="list-value faint small">{alert.fired_at.slice(5, 16).replace('T', ' ')}</div>
                  </div>
                ))}
              </div>
            : <Empty title="暂时没有待处理提醒" description="规则中心可以配置到期、止盈止损等提醒。" />}
        </Card>

        <Card title="到期日历" subtitle="未来 60 天及已逾期" extra={<Button size="sm" variant="ghost" onClick={() => onNavigate('positions')}>持仓 →</Button>} noPadding>
          {analysis.data?.maturityCalendar.length
            ? <div style={{ padding: '6px 20px 14px' }}>
                {analysis.data.maturityCalendar.slice(0, 5).map((item) => (
                  <div className="calendar-item" key={item.id}>
                    <div className={`calendar-date ${item.overdue ? 'overdue' : (item.daysLeft ?? 99) <= 7 ? 'soon' : ''}`}>{item.maturityDate?.slice(5)}</div>
                    <div style={{ flex: 1 }}>
                      <div className="list-title">{item.name}</div>
                      <div className="list-desc">{item.overdue ? `已逾期 ${Math.abs(item.daysLeft ?? 0)} 天` : `${item.daysLeft} 天后到期`} · 市值 {compact(item.value)}</div>
                    </div>
                    {item.overdue && <Badge tone="negative">待处理</Badge>}
                  </div>
                ))}
              </div>
            : <Empty title="近期没有到期产品" description="为产品填写到期日后，这里会自动列出。" />}
        </Card>
      </div>

      <Card title="资金构成与盘点" subtitle="占比基于渠道余额与持仓市值，结论来自你设定的阈值">
        <div className="grid grid-2">
          <div>
            {(distribution.data?.groups ?? []).map((group, index) => (
              <div className="bar-row" key={group.key}>
                <span className="bar-label">{group.label}</span>
                <Progress value={group.share} tone={(['accent', 'positive', 'warning'] as const)[index % 3]} />
                <span className="bar-value">{compact(group.amount)} · {pct(group.share)}</span>
              </div>
            ))}
            {!distribution.data?.groups.length && <p className="faint small">暂无构成数据</p>}
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {(analysis.data?.insights ?? []).slice(0, 5).map((insight, index) => (
              <div key={index} className={`notice ${insight.level === 'WARN' ? 'notice-warn' : ''}`}>{insight.text}</div>
            ))}
            {!analysis.data?.insights.length && <p className="faint small">录入数据后，这里会显示集中度、闲置资金与配置偏离等盘点结论。</p>}
          </div>
        </div>
      </Card>
    </>
  );
}
