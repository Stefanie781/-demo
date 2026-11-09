import { useState } from 'react';
import { api, useApi } from '../api';
import { Badge, Button, Card, Empty, Field, Input, Kpi, Modal, Progress, Select, Tabs, useToast } from '../components';
import { PRODUCT_CATEGORY_LABELS, RULE_TYPE_LABELS } from '../mock';
import type { Account, AlertEvent, Analysis, Position, Product, Rule } from '../types';
import { compact, money, pct, shortDate, signed, todayStr, toneOf } from '../utils';

type Tab = 'positions' | 'analysis' | 'rules' | 'alerts';
type AlertFilter = 'ALL' | 'PENDING' | 'ACKED' | 'SNOOZED' | 'IGNORED';

const LEVEL_TONE: Record<string, 'info' | 'warning' | 'negative'> = { INFO: 'info', WARN: 'warning', URGENT: 'negative' };
const STATE_LABEL: Record<string, string> = { PENDING: '待处理', ACKED: '已确认', SNOOZED: '已静默', IGNORED: '已忽略' };

interface Props { onNavigate: (route: string) => void }

const conditionSummary = (rule: Rule) => {
  const c = rule.condition as Record<string, unknown>;
  switch (rule.rule_type) {
    case 'MATURITY': return `到期前 ${c.daysBefore ?? 7} 天`;
    case 'TAKE_PROFIT': return `收益率 ≥ ${c.rate ?? 15}%`;
    case 'STOP_LOSS': return `收益率 ≤ ${c.rate ?? -10}%`;
    case 'PRICE_MOVE': return `单日波动 ≥ ${c.rate ?? 5}%`;
    case 'ALLOCATION_DRIFT': return `偏离 ≥ ${c.tolerance ?? 10} 个百分点`;
    case 'IDLE_CASH': return `连续 ${c.days ?? 7} 天超阈值`;
    case 'DATA_STALE': return `${c.days ?? 3} 天未记账`;
    default: return '自定义条件';
  }
};

export default function Wealth(_props: Props) {
  const [tab, setTab] = useState<Tab>('positions');
  const [filter, setFilter] = useState<AlertFilter>('PENDING');
  const [quoteModal, setQuoteModal] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [positionModal, setPositionModal] = useState(false);
  const [ruleModal, setRuleModal] = useState<Rule | 'new' | null>(null);
  const [ruleForm, setRuleForm] = useState({ name: '', ruleType: 'MATURITY', threshold: '7', level: 'WARN' });
  const [quoteForm, setQuoteForm] = useState({ productId: '', date: todayStr(), price: '' });
  const [productForm, setProductForm] = useState({ name: '', code: '', category: 'FUND', maturityDate: '', targetReturnRate: '' });
  const [positionForm, setPositionForm] = useState({ productId: '', accountId: '', quantity: '', costPrice: '', currentPrice: '', openedAt: todayStr() });
  const toast = useToast();

  const positions = useApi<Position[]>('/api/positions');
  const products = useApi<Product[]>('/api/products');
  const accounts = useApi<Account[]>('/api/accounts');
  const rules = useApi<Rule[]>('/api/rules');
  const alerts = useApi<AlertEvent[]>(`/api/alerts?state=${filter}`);
  const analysis = useApi<Analysis>('/api/analysis');

  const holdings = positions.data?.filter((p) => p.status !== 'CLOSED') ?? [];
  const totalValue = holdings.reduce((sum, p) => sum + p.value, 0);
  const totalProfit = holdings.reduce((sum, p) => sum + p.profit, 0);

  const submitQuote = async () => {
    try {
      await api.post('/api/quotes', { ...quoteForm, price: Number(quoteForm.price) });
      setQuoteModal(false); setQuoteForm({ ...quoteForm, price: '' });
      toast('报价已更新，持仓市值与趋势快照已同步');
    } catch (error) { toast((error as Error).message, 'error'); }
  };

  const submitProduct = async () => {
    try {
      const created = await api.post<Product>('/api/products', productForm);
      setProductModal(false);
      setPositionForm({ ...positionForm, productId: created.id });
      toast('产品已新增，可继续添加持仓');
    } catch (error) { toast((error as Error).message, 'error'); }
  };

  const submitPosition = async () => {
    try {
      await api.post('/api/positions', {
        ...positionForm,
        quantity: Number(positionForm.quantity),
        costPrice: Number(positionForm.costPrice),
        currentPrice: Number(positionForm.currentPrice || positionForm.costPrice)
      });
      setPositionModal(false);
      toast('持仓已新增，快照已重算');
    } catch (error) { toast((error as Error).message, 'error'); }
  };

  const openRule = (rule?: Rule) => {
    if (rule) {
      const c = rule.condition as Record<string, unknown>;
      const threshold = rule.rule_type === 'MATURITY' ? c.daysBefore
        : rule.rule_type === 'ALLOCATION_DRIFT' ? c.tolerance
        : rule.rule_type === 'IDLE_CASH' || rule.rule_type === 'DATA_STALE' ? c.days : c.rate;
      setRuleForm({ name: rule.name, ruleType: rule.rule_type, threshold: String(threshold ?? 7), level: String((rule.action as Record<string, unknown>).level ?? 'INFO') });
      setRuleModal(rule);
    } else {
      setRuleForm({ name: '', ruleType: 'MATURITY', threshold: '7', level: 'WARN' });
      setRuleModal('new');
    }
  };

  const submitRule = async () => {
    const key = ['IDLE_CASH', 'DATA_STALE'].includes(ruleForm.ruleType) ? 'days'
      : ruleForm.ruleType === 'MATURITY' ? 'daysBefore'
      : ruleForm.ruleType === 'ALLOCATION_DRIFT' ? 'tolerance' : 'rate';
    const condition = { [key]: Number(ruleForm.threshold) };
    try {
      if (ruleModal === 'new') {
        await api.post('/api/rules', {
          name: ruleForm.name || `${RULE_TYPE_LABELS[ruleForm.ruleType]}规则`,
          ruleType: ruleForm.ruleType, condition, action: { level: ruleForm.level }
        });
      } else if (ruleModal) {
        await api.patch(`/api/rules/${ruleModal.id}`, { name: ruleForm.name, condition, action: { level: ruleForm.level } });
      }
      setRuleModal(null);
      toast('规则已保存并重新评估');
    } catch (error) { toast((error as Error).message, 'error'); }
  };

  const changeAlert = async (alert: AlertEvent, state: string) => {
    try { await api.post(`/api/alerts/${alert.id}/state`, { state, hours: 24 }); toast(`提醒已${STATE_LABEL[state] ?? '更新'}`); }
    catch (error) { toast((error as Error).message, 'error'); }
  };

  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'positions', label: '理财持仓' }, { value: 'analysis', label: '机会分析' },
        { value: 'rules', label: `规则中心 (${rules.data?.length ?? 0})` },
        { value: 'alerts', label: `提醒中心 (${alerts.data?.length ?? 0})` }
      ]} />

      {tab === 'positions' && (
        <>
          <div className="grid grid-4">
            <Kpi label="持仓市值" value={money(totalValue)} sub={`${holdings.length} 笔持仓`} />
            <Kpi label="累计盈亏" value={signed(totalProfit)} tone={toneOf(totalProfit) === 'positive' ? 'positive' : 'negative'} sub="按最新报价与成本价计算" />
            <Kpi label="持仓账户" value={accounts.data?.length ?? 0} sub="含现金与负债渠道" />
            <Kpi label="60 天内到期" value={analysis.data?.maturityCalendar.filter((m) => !m.overdue).length ?? 0} sub={`逾期 ${analysis.data?.maturityCalendar.filter((m) => m.overdue).length ?? 0} 笔`} />
          </div>

          <Card title="持仓明细" subtitle="更新现价后会写入报价历史，并联动重算快照、触发止盈止损提醒" extra={<>
            <Button size="sm" onClick={() => setProductModal(true)}>新增产品</Button>
            <Button size="sm" onClick={() => setPositionModal(true)}>新增持仓</Button>
            <Button size="sm" variant="primary" onClick={() => { setQuoteForm({ ...quoteForm, productId: products.data?.[0]?.id ?? '' }); setQuoteModal(true); }}>更新现价</Button>
          </>} noPadding>
            {positions.data?.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>产品</th><th>类别</th><th>账户</th><th className="num">份额 / 数量</th><th className="num">成本 / 现价</th><th className="num">市值</th><th className="num">盈亏</th><th>到期</th><th className="actions">操作</th></tr></thead>
                  <tbody>
                    {positions.data.map((position) => (
                      <tr key={position.id}>
                        <td><div className="list-title">{position.product_name}</div><div className="list-desc mono">{position.code || '—'}</div></td>
                        <td className="faint small">{PRODUCT_CATEGORY_LABELS[position.category] ?? position.category}</td>
                        <td className="faint small">{position.account_name ?? '—'}</td>
                        <td className="num">{position.quantity.toLocaleString('zh-CN')}</td>
                        <td className="num mono">{position.cost_price} / {position.current_price}</td>
                        <td className="num">{money(position.value)}</td>
                        <td className={`num ${toneOf(position.profit)}`}>{signed(position.profit)} <span className="small">({pct(position.rate)})</span></td>
                        <td>
                          {position.maturity_date ? (
                            position.maturityState === 'OVERDUE' ? <Badge tone="negative">逾期 {Math.abs(position.daysLeft ?? 0)} 天</Badge>
                              : position.maturityState === 'SOON' ? <Badge tone="warning">{position.daysLeft} 天后</Badge>
                              : <Badge>{shortDate(position.maturity_date)}</Badge>
                          ) : <span className="faint small">无到期日</span>}
                        </td>
                        <td className="actions">
                          <Button size="sm" variant="ghost" onClick={() => { setQuoteForm({ productId: position.product_id, date: todayStr(), price: String(position.current_price) }); setQuoteModal(true); }}>改价</Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            if (!window.confirm(`删除「${position.product_name}」这笔持仓？`)) return;
                            try { await api.del(`/api/positions/${position.id}`); toast('持仓已删除'); }
                            catch (error) { toast((error as Error).message, 'error'); }
                          }}>删除</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="暂无持仓" description="新增产品与持仓后，到期提醒和盈亏分析会自动生效。" />}
          </Card>
        </>
      )}

      {tab === 'analysis' && (
        <>
          <div className="grid grid-4">
            <Kpi label="最大单项占比" value={pct(analysis.data?.concentration.top1Share)} sub={`前三合计 ${pct(analysis.data?.concentration.top3Share)}`} />
            <Kpi label="闲置活期资金" value={compact(analysis.data?.idleCash.total)} sub={`阈值 ${compact(analysis.data?.idleCash.threshold)}`} />
            <Kpi label="近 30 天净变化" value={signed(analysis.data?.cashflow.netChange)} tone={toneOf(analysis.data?.cashflow.netChange ?? 0) === 'positive' ? 'positive' : 'negative'} sub={`市值变动 ${compact(analysis.data?.cashflow.marketDelta)}`} />
            <Kpi label="到期日历" value={analysis.data?.maturityCalendar.length ?? 0} sub="未来 60 天及逾期" />
          </div>

          <div className="grid grid-2">
            <Card title="资产盘点结论" subtitle="由本地数据与自设阈值计算，不构成投资建议">
              <div className="stack" style={{ gap: 10 }}>
                {(analysis.data?.insights ?? []).map((insight, index) => (
                  <div key={index} className={`notice ${insight.level === 'WARN' ? 'notice-warn' : ''}`}>{insight.text}</div>
                ))}
                {!analysis.data?.insights.length && <Empty title="暂无盘点结论" />}
              </div>
            </Card>
            <Card title="目标配置偏离" subtitle="实际占比与目标占比对比">
              {(analysis.data?.allocation ?? []).map((item) => (
                <div className="bar-row" key={item.key} style={{ gridTemplateColumns: '110px 1fr 118px' }}>
                  <span className="bar-label">{item.label}</span>
                  <Progress value={item.current} tone={item.drifted ? 'warning' : 'accent'} />
                  <span className="bar-value">{item.current}% / {item.expected}%</span>
                </div>
              ))}
              <div className="divider" style={{ margin: '10px 0' }} />
              <p className="faint small">{analysis.data?.disclaimer}</p>
            </Card>
          </div>

          <div className="grid grid-2">
            <Card title="到期日历" subtitle="及时安排赎回或续投" noPadding>
              {(analysis.data?.maturityCalendar ?? []).length ? (
                <div style={{ padding: '6px 20px 14px' }}>
                  {analysis.data!.maturityCalendar.map((item) => (
                    <div className="calendar-item" key={item.id}>
                      <div className={`calendar-date ${item.overdue ? 'overdue' : (item.daysLeft ?? 99) <= 7 ? 'soon' : ''}`}>{item.maturityDate?.slice(5)}</div>
                      <div style={{ flex: 1 }}>
                        <div className="list-title">{item.name}</div>
                        <div className="list-desc">{item.overdue ? `已逾期 ${Math.abs(item.daysLeft ?? 0)} 天` : `${item.daysLeft} 天后到期`} · 市值 {compact(item.value)}</div>
                      </div>
                      {item.overdue ? <Badge tone="negative">待处理</Badge> : <Badge tone="info">关注</Badge>}
                    </div>
                  ))}
                </div>
              ) : <Empty title="近期没有到期产品" />}
            </Card>
            <Card title="持仓盈亏排行" subtitle="按当前报价计算">
              {(analysis.data?.holdings ?? []).sort((a, b) => b.rate - a.rate).map((item) => (
                <div className="bar-row" key={item.id} style={{ gridTemplateColumns: '130px 1fr 92px' }}>
                  <span className="bar-label">{item.name}</span>
                  <Progress value={Math.min(100, Math.abs(item.rate) * 3)} tone={item.rate >= 0 ? 'positive' : 'negative'} />
                  <span className={`bar-value ${toneOf(item.rate)}`}>{pct(item.rate)}</span>
                </div>
              ))}
              {!analysis.data?.holdings.length && <Empty title="暂无持仓数据" />}
            </Card>
          </div>
        </>
      )}

      {tab === 'rules' && (
        <Card title="提醒规则" subtitle="数据变更时即时评估，也可在顶部手动触发" extra={<>
          <Button size="sm" onClick={async () => { try { const r = await api.post<{ newAlerts: number }>('/api/rules/evaluate'); toast(r.newAlerts ? `新增 ${r.newAlerts} 条提醒` : '暂无新提醒'); } catch (e) { toast((e as Error).message, 'error'); } }}>立即评估</Button>
          <Button size="sm" variant="primary" onClick={() => openRule()}>+ 新增规则</Button>
        </>} noPadding>
          {rules.data?.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>规则名称</th><th>类型</th><th>触发条件</th><th>级别</th><th>状态</th><th className="actions">操作</th></tr></thead>
                <tbody>
                  {rules.data.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.name}</td>
                      <td><Badge tone="info">{RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type}</Badge></td>
                      <td className="muted small">{conditionSummary(rule)}</td>
                      <td><Badge tone={LEVEL_TONE[String((rule.action as Record<string, unknown>).level ?? 'INFO')] ?? 'neutral'}>{String((rule.action as Record<string, unknown>).level ?? 'INFO')}</Badge></td>
                      <td>
                        <label className="row small" style={{ gap: 6 }}>
                          <input type="checkbox" checked={rule.enabled} onChange={async (e) => {
                            try { await api.patch(`/api/rules/${rule.id}`, { enabled: e.target.checked }); toast('规则状态已更新'); }
                            catch (error) { toast((error as Error).message, 'error'); }
                          }} />
                          {rule.enabled ? '启用' : '停用'}
                        </label>
                      </td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" onClick={() => openRule(rule)}>编辑</Button>
                        <Button size="sm" variant="ghost" onClick={async () => {
                          try { await api.del(`/api/rules/${rule.id}`); toast('规则已删除'); }
                          catch (error) { toast((error as Error).message, 'error'); }
                        }}>删除</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="暂无规则" description="新增一条到期或止盈规则来体验提醒机制。" />}
        </Card>
      )}

      {tab === 'alerts' && (
        <Card title="提醒记录" subtitle="确认、静默与忽略都会记录状态，避免重复打扰" extra={<>
          <Tabs value={filter} onChange={setFilter} items={[
            { value: 'PENDING', label: '待处理' }, { value: 'ALL', label: '全部' },
            { value: 'ACKED', label: '已确认' }, { value: 'SNOOZED', label: '已静默' }, { value: 'IGNORED', label: '已忽略' }
          ]} />
          <Button size="sm" onClick={async () => { try { const r = await api.post<{ updated: number }>('/api/alerts/ack-all'); toast(`已确认 ${r.updated} 条提醒`); } catch (e) { toast((e as Error).message, 'error'); } }}>全部确认</Button>
        </>} noPadding>
          {alerts.data?.length ? (
            <div className="list">
              {alerts.data.map((alert) => (
                <div className="list-item" key={alert.id}>
                  <span className="dot" style={{ flex: '0 0 9px', background: alert.level === 'URGENT' ? 'var(--red)' : alert.level === 'WARN' ? 'var(--amber)' : 'var(--accent)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="list-title">{alert.title}</span>
                      <Badge tone={LEVEL_TONE[alert.level] ?? 'neutral'}>{alert.level}</Badge>
                      <Badge tone={alert.state === 'PENDING' ? 'warning' : 'neutral'}>{STATE_LABEL[alert.state] ?? alert.state}</Badge>
                    </div>
                    <div className="list-desc">{alert.message}</div>
                    <div className="list-desc faint">{alert.fired_at.slice(0, 16).replace('T', ' ')} · {alert.dedupe_key}</div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {alert.state === 'PENDING' ? <>
                      <Button size="sm" variant="ghost" onClick={() => changeAlert(alert, 'ACKED')}>确认</Button>
                      <Button size="sm" variant="ghost" onClick={() => changeAlert(alert, 'SNOOZED')}>静默</Button>
                      <Button size="sm" variant="ghost" onClick={() => changeAlert(alert, 'IGNORED')}>忽略</Button>
                    </> : <Button size="sm" variant="ghost" onClick={() => changeAlert(alert, 'PENDING')}>重新打开</Button>}
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty title="该状态下没有提醒" description="规则评估后产生的提醒会显示在这里。" />}
        </Card>
      )}

      {/* 报价录入 */}
      <Modal open={quoteModal} title="更新产品报价" onClose={() => setQuoteModal(false)} width={460} footer={<><Button onClick={() => setQuoteModal(false)}>取消</Button><Button variant="primary" onClick={submitQuote}>保存并同步</Button></>}>
        <Field label="产品"><Select value={quoteForm.productId} onChange={(e) => setQuoteForm({ ...quoteForm, productId: e.target.value })}>
          {(products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </Select></Field>
        <div className="form-grid">
          <Field label="报价日期"><Input type="date" value={quoteForm.date} onChange={(e) => setQuoteForm({ ...quoteForm, date: e.target.value })} /></Field>
          <Field label="最新价格"><Input type="number" step="0.0001" value={quoteForm.price} onChange={(e) => setQuoteForm({ ...quoteForm, price: e.target.value })} /></Field>
        </div>
        <div className="notice">保存后会同步该产品的持仓现价、重算历史快照，并立即评估止盈止损与价格异动规则。</div>
      </Modal>

      {/* 新增产品 */}
      <Modal open={productModal} title="新增理财产品" onClose={() => setProductModal(false)} width={520} footer={<><Button onClick={() => setProductModal(false)}>取消</Button><Button variant="primary" onClick={submitProduct}>保存</Button></>}>
        <div className="form-grid">
          <Field label="产品名称"><Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></Field>
          <Field label="代码"><Input value={productForm.code} onChange={(e) => setProductForm({ ...productForm, code: e.target.value })} /></Field>
          <Field label="类别"><Select value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
            {Object.entries(PRODUCT_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select></Field>
          <Field label="到期日"><Input type="date" value={productForm.maturityDate} onChange={(e) => setProductForm({ ...productForm, maturityDate: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* 新增持仓 */}
      <Modal open={positionModal} title="新增持仓" onClose={() => setPositionModal(false)} width={560} footer={<><Button onClick={() => setPositionModal(false)}>取消</Button><Button variant="primary" onClick={submitPosition}>保存并重算</Button></>}>
        <div className="form-grid">
          <Field label="产品"><Select value={positionForm.productId} onChange={(e) => setPositionForm({ ...positionForm, productId: e.target.value })}>
            <option value="">请选择产品</option>
            {(products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </Select></Field>
          <Field label="所属账户"><Select value={positionForm.accountId} onChange={(e) => setPositionForm({ ...positionForm, accountId: e.target.value })}>
            <option value="">不关联</option>
            {(accounts.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </Select></Field>
          <Field label="份额 / 数量"><Input type="number" value={positionForm.quantity} onChange={(e) => setPositionForm({ ...positionForm, quantity: e.target.value })} /></Field>
          <Field label="成本价"><Input type="number" step="0.0001" value={positionForm.costPrice} onChange={(e) => setPositionForm({ ...positionForm, costPrice: e.target.value })} /></Field>
          <Field label="现价"><Input type="number" step="0.0001" value={positionForm.currentPrice} onChange={(e) => setPositionForm({ ...positionForm, currentPrice: e.target.value })} /></Field>
          <Field label="买入日期"><Input type="date" value={positionForm.openedAt} onChange={(e) => setPositionForm({ ...positionForm, openedAt: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* 规则编辑 */}
      <Modal open={Boolean(ruleModal)} title={ruleModal === 'new' ? '新增规则' : '编辑规则'} onClose={() => setRuleModal(null)} width={480} footer={<><Button onClick={() => setRuleModal(null)}>取消</Button><Button variant="primary" onClick={submitRule}>保存并评估</Button></>}>
        <Field label="规则名称"><Input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label="规则类型"><Select value={ruleForm.ruleType} disabled={ruleModal !== 'new'} onChange={(e) => setRuleForm({ ...ruleForm, ruleType: e.target.value })}>
            {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select></Field>
          <Field label="阈值"><Input type="number" value={ruleForm.threshold} onChange={(e) => setRuleForm({ ...ruleForm, threshold: e.target.value })} /></Field>
          <Field label="提醒级别"><Select value={ruleForm.level} onChange={(e) => setRuleForm({ ...ruleForm, level: e.target.value })}>
            <option value="INFO">INFO · 提示</option><option value="WARN">WARN · 关注</option><option value="URGENT">URGENT · 紧急</option>
          </Select></Field>
        </div>
        <div className="notice">阈值为天数、百分比或百分点，取决于规则类型；保存后会立即重新评估并生成提醒。</div>
      </Modal>
    </>
  );
}
