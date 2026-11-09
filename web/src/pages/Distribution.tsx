import { useEffect, useMemo, useState } from 'react';
import { api, useApi, useData } from '../api';
import { pieOption } from '../charts';
import { Badge, Button, Card, Chart, Empty, Field, Input, Kpi, Modal, Progress, Select, Tabs, useToast } from '../components';
import type { Account, BalanceRecord, Distribution, DistributionItem } from '../types';
import { compact, money, reasonLabel, shiftDate, signed, todayStr, toneOf } from '../utils';
import { ACCOUNT_TYPE_LABELS } from '../mock';

interface Props { onNavigate: (route: string) => void }

const TYPE_OPTIONS = Object.entries(ACCOUNT_TYPE_LABELS);

export default function Distribution({ onNavigate }: Props) {
  const [date, setDate] = useState(todayStr());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [accountModal, setAccountModal] = useState<Account | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', type: 'CASH', includeInTotal: true, archived: false });
  const { lastEvent } = useData();
  const toast = useToast();

  const distribution = useApi<Distribution>(`/api/distribution?date=${date}`);
  const balances = useApi<BalanceRecord[]>('/api/balances?limit=12');

  useEffect(() => {
    if (!distribution.data) return;
    const next: Record<string, string> = {};
    distribution.data.items.forEach((item) => { next[item.id] = String(item.amount); });
    setDraft(next);
    setInitial(next);
  }, [distribution.data]);

  const visibleItems = distribution.data?.items ?? [];
  const pieData = useMemo(() => visibleItems
    .filter((item) => item.type !== 'LIABILITY' && !item.archived && item.amount > 0)
    .map((item) => ({ name: item.name, value: item.amount }))
    .concat(distribution.data?.totals.positionTotal ? [{ name: '持仓市值', value: distribution.data.totals.positionTotal }] : []),
  [visibleItems, distribution.data]);

  const dirtyCount = Object.entries(draft).filter(([id, value]) => value !== initial[id] && value !== '').length;

  const save = async () => {
    const entries = Object.entries(draft)
      .filter(([id, value]) => value !== initial[id] && value !== '')
      .map(([accountId, value]) => ({ accountId, amount: Number(value), note: '' }));
    if (!entries.length) { toast('没有需要保存的变更', 'info'); return; }
    setSaving(true);
    try {
      await api.post('/api/balances/batch', { date, entries });
      toast(`已保存 ${entries.length} 个账户余额，趋势与分布已同步`);
    } catch (error) { toast((error as Error).message, 'error'); }
    finally { setSaving(false); }
  };

  const copyLatest = async () => {
    try {
      const result = await api.post<{ saved: number }>('/api/balances/copy-latest', { date });
      toast(result.saved ? `已沿用 ${result.saved} 个账户的上次余额` : '没有可沿用的历史余额', result.saved ? 'success' : 'info');
    } catch (error) { toast((error as Error).message, 'error'); }
  };

  const openAccount = (account?: Account) => {
    if (account) {
      setForm({ name: account.name, type: account.type, includeInTotal: Boolean(account.include_in_total), archived: Boolean(account.archived) });
      setAccountModal(account);
    } else {
      setForm({ name: '', type: 'CASH', includeInTotal: true, archived: false });
      setAccountModal('new');
    }
  };

  const submitAccount = async () => {
    try {
      if (accountModal === 'new') {
        await api.post('/api/accounts', form);
        toast('账户已新增');
      } else if (accountModal) {
        await api.patch(`/api/accounts/${accountModal.id}`, form);
        toast('账户已更新');
      }
      setAccountModal(null);
    } catch (error) { toast((error as Error).message, 'error'); }
  };

  const removeAccount = async (account: Account) => {
    if (!window.confirm(`删除「${account.name}」会同时删除其全部余额记录，确认继续？`)) return;
    try { await api.del(`/api/accounts/${account.id}`); toast('账户已删除'); }
    catch (error) { toast((error as Error).message, 'error'); }
  };

  const removeBalance = async (record: BalanceRecord) => {
    try { await api.del(`/api/balances/${record.id}`); toast('余额记录已删除，快照已重算'); }
    catch (error) { toast((error as Error).message, 'error'); }
  };

  const totals = distribution.data?.totals;

  return (
    <>
      <div className="grid grid-4">
        <Kpi label="渠道余额合计" value={money(totals?.accountTotal)} sub={`查看日期 ${date}`} />
        <Kpi label="持仓市值" value={money(totals?.positionTotal)} sub="按最新报价估算" />
        <Kpi label="负债" value={money(totals?.liability)} sub="信用卡 / 贷款等" tone="negative" />
        <Kpi label="净资产" value={money(totals?.netAssets)} tone="accent" sub={`总资产 ${compact(totals?.totalAssets)}`} />
      </div>

      <Card title="台账联动状态" subtitle="余额录入、CSV 导入与价格更新都会从这里同步到全站">
        <div className="grid grid-3" style={{ gap: 12 }}>
          <div className="notice">
            <b>最近一次数据变更</b><br />
            {lastEvent ? `${reasonLabel[lastEvent.reason] ?? lastEvent.reason} · 影响起始 ${lastEvent.affectedFrom ?? '—'} · 重算 ${lastEvent.snapshotDays ?? 0} 天` : '尚无变更，当前为演示数据'}
          </div>
          <div className="notice">
            <b>最新登记日期</b><br />
            {distribution.data?.latestRecordDate ?? '—'}
            {distribution.data?.items.some((i) => i.estimated) && ' · 当前视图含结转估算值'}
          </div>
          <div className="notice" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div><b>资产趋势</b><br />查看重算后的每日净值曲线</div>
            <Button size="sm" onClick={() => onNavigate('trend')}>前往 →</Button>
          </div>
        </div>
      </Card>

      <div className="row-between">
        <Tabs value={date === todayStr() ? 'today' : 'custom'} onChange={(value) => { if (value === 'today') setDate(todayStr()); }} items={[
          { value: 'today', label: '今天' }, { value: 'custom', label: '历史日期' }
        ]} />
        <div className="row">
          <div className="inline-field"><span className="field-label">查看日期</span><Input type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())} /></div>
          <Button size="sm" onClick={() => setDate(shiftDate(todayStr(), -7))}>7 天前</Button>
          <Button size="sm" onClick={() => setDate(shiftDate(todayStr(), -30))}>30 天前</Button>
        </div>
      </div>

      <div className="grid grid-main">
        <Card
          title="余额录入台"
          subtitle={`将变更写入 ${date} 的台账，保存后立即重算快照并同步趋势与分布`}
          extra={<>
            <Button size="sm" onClick={copyLatest}>沿用上次余额</Button>
            <Button size="sm" variant="primary" loading={saving} onClick={save}>保存并同步{dirtyCount ? ` (${dirtyCount})` : ''}</Button>
          </>}
          noPadding
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>账户</th><th>类型</th><th className="num">余额</th><th className="num">较上次登记</th><th>数据来源</th><th className="actions">管理</th></tr>
              </thead>
              <tbody>
                {visibleItems.map((item: DistributionItem) => (
                  <tr key={item.id}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="dot" style={{ background: item.type === 'LIABILITY' ? 'var(--red)' : 'var(--accent)' }} />
                        <span>{item.name}</span>
                        {item.archived ? <Badge>已归档</Badge> : null}
                      </div>
                    </td>
                    <td className="faint small">{ACCOUNT_TYPE_LABELS[item.type] ?? item.type}</td>
                    <td className="num"><input className="table-input" type="number" step="0.01" value={draft[item.id] ?? ''} onChange={(e) => setDraft({ ...draft, [item.id]: e.target.value })} /></td>
                    <td className={`num ${toneOf(item.delta)}`}>{item.previousAmount === null ? '—' : signed(item.delta)}</td>
                    <td>
                      {item.asOf ? (
                        item.estimated ? <Badge tone="warning">{item.asOf} 结转</Badge> : <Badge tone="positive">当日登记</Badge>
                      ) : <span className="faint small">未登记</span>}
                    </td>
                    <td className="actions">
                      <Button size="sm" variant="ghost" onClick={() => openAccount(item)}>编辑</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeAccount(item)}>删除</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visibleItems.length && <Empty title="还没有账户" description="新增一个渠道账户后即可录入余额。" />}
          <div className="row" style={{ padding: '12px 20px' }}>
            <Button size="sm" onClick={() => openAccount()}>+ 新增账户</Button>
            <span className="faint small">空白单元格表示不修改；填写 0 会把该账户当日余额清零。</span>
          </div>
        </Card>

        <Card title="渠道占比" subtitle={`截至 ${date}`}>
          {pieData.length ? <Chart option={pieOption(pieData)} height={250} /> : <Empty title="暂无分布数据" />}
          <div className="stack" style={{ gap: 4, marginTop: 8 }}>
            {visibleItems.filter((i) => i.type !== 'LIABILITY' && i.amount > 0).slice(0, 6).map((item, index) => (
              <div className="bar-row" key={item.id} style={{ gridTemplateColumns: '110px 1fr 78px' }}>
                <span className="bar-label">{item.name}</span>
                <Progress value={item.share} tone={(['accent', 'positive', 'warning'] as const)[index % 3]} />
                <span className="bar-value">{item.share.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="最近余额流水" subtitle="每次录入都会留痕，删除后自动重算对应日期起的快照" noPadding>
        {balances.data?.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>日期</th><th>账户</th><th className="num">金额</th><th>备注</th><th>来源</th><th className="actions">操作</th></tr></thead>
              <tbody>
                {balances.data.map((record) => (
                  <tr key={record.id}>
                    <td className="mono">{record.recorded_on}</td>
                    <td>{record.account_name}</td>
                    <td className="num">{money(record.amount)}</td>
                    <td className="faint small">{record.note || '—'}</td>
                    <td><Badge tone={record.source === 'CSV' ? 'info' : 'neutral'}>{record.source === 'CSV' ? 'CSV 导入' : record.source === 'COPY' ? '沿用' : record.source === 'DEMO' ? '演示' : '手工'}</Badge></td>
                    <td className="actions"><Button size="sm" variant="ghost" onClick={() => removeBalance(record)}>删除</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="暂无余额流水" description="在上方录入台填写并保存后，这里会显示记录。" />}
      </Card>

      <Modal
        open={Boolean(accountModal)} title={accountModal === 'new' ? '新增账户' : '编辑账户'}
        onClose={() => setAccountModal(null)} width={460}
        footer={<><Button onClick={() => setAccountModal(null)}>取消</Button><Button variant="primary" onClick={submitAccount}>保存</Button></>}
      >
        <Field label="账户名称" hint="例如：微信、支付宝、招商银行卡、券商账户"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="账户类型"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select></Field>
        <label className="row small"><input type="checkbox" checked={form.includeInTotal} onChange={(e) => setForm({ ...form, includeInTotal: e.target.checked })} /> 计入总资产</label>
        <label className="row small"><input type="checkbox" checked={form.archived} onChange={(e) => setForm({ ...form, archived: e.target.checked })} /> 归档（保留历史，不常显示）</label>
      </Modal>
    </>
  );
}
