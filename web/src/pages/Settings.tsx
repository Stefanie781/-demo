import { useEffect, useState } from 'react';
import { api, downloadFile, useApi, useData } from '../api';
import CsvImportModal from '../CsvImportModal';
import { Badge, Button, Card, Field, Input, useToast } from '../components';
import { ACCOUNT_TYPE_LABELS } from '../mock';
import { reasonLabel, todayStr } from '../utils';

interface SettingsData {
  target_allocation: string;
  idle_cash_threshold: string;
  stale_days: string;
  drift_tolerance: string;
  scan_time: string;
}

interface Props { onNavigate: (route: string) => void }

export default function Settings({ onNavigate }: Props) {
  const settings = useApi<SettingsData>('/api/settings');
  const { lastEvent } = useData();
  const toast = useToast();
  const [form, setForm] = useState<SettingsData>({
    target_allocation: '{}', idle_cash_threshold: '50000', stale_days: '3', drift_tolerance: '10', scan_time: '09:00'
  });
  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setForm(settings.data);
    try { setAllocation(JSON.parse(settings.data.target_allocation) as Record<string, number>); }
    catch { setAllocation({}); }
  }, [settings.data]);

  const save = async () => {
    try {
      await api.put('/api/settings', { ...form, target_allocation: JSON.stringify(allocation) });
      toast('设置已保存，机会分析已重新计算');
    } catch (error) { toast((error as Error).message, 'error'); }
  };

  const loadDemo = async () => {
    setBusy(true);
    try { await api.post('/api/data/demo'); toast('演示数据已重新生成'); }
    catch (error) { toast((error as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  const clearData = async () => {
    if (!window.confirm('将清空全部余额、持仓与提醒记录（保留账户与规则），确认继续？')) return;
    try { await api.post('/api/data/reset', { confirm: 'RESET' }); toast('数据已清空，可重新录入或载入演示数据'); }
    catch (error) { toast((error as Error).message, 'error'); }
  };

  const exportFile = (dataset: string) => {
    downloadFile(`/api/data/export?dataset=${dataset}`, `${dataset}-${todayStr()}.csv`);
    toast('CSV 已导出');
  };

  return (
    <>
      <div className="grid grid-2">
        <Card title="目标资产配置" subtitle="用于配置偏离提醒与机会分析" extra={<Button size="sm" variant="primary" onClick={save}>保存设置</Button>}>
          <div className="form-grid">
            {Object.entries(ACCOUNT_TYPE_LABELS).filter(([key]) => key !== 'LIABILITY').map(([key, label]) => (
              <Field key={key} label={`${label} (%)`}>
                <Input type="number" min="0" max="100" value={allocation[key] ?? 0} onChange={(e) => setAllocation({ ...allocation, [key]: Number(e.target.value) })} />
              </Field>
            ))}
          </div>
          <div className="divider" style={{ margin: '14px 0' }} />
          <div className="form-grid">
            <Field label="闲置资金阈值 (¥)" hint="活期账户余额高于该值会提示"><Input type="number" value={form.idle_cash_threshold} onChange={(e) => setForm({ ...form, idle_cash_threshold: e.target.value })} /></Field>
            <Field label="配置偏离容差 (百分点)"><Input type="number" value={form.drift_tolerance} onChange={(e) => setForm({ ...form, drift_tolerance: e.target.value })} /></Field>
            <Field label="久未记账阈值 (天)"><Input type="number" value={form.stale_days} onChange={(e) => setForm({ ...form, stale_days: e.target.value })} /></Field>
            <Field label="每日扫描时间" hint="完整版服务端会按此时间定时扫描；Demo 中数据变更时即时评估"><Input type="time" value={form.scan_time} onChange={(e) => setForm({ ...form, scan_time: e.target.value })} /></Field>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <Button variant="primary" onClick={save}>保存设置</Button>
            <span className="faint small">当前目标合计 {Object.values(allocation).reduce((a, b) => a + Number(b || 0), 0)}%</span>
          </div>
        </Card>

        <div className="stack">
          <Card title="数据管理" subtitle="演示数据保存在浏览器 localStorage，不上传任何服务器">
            <div className="stack" style={{ gap: 12 }}>
              <div className="row">
                <Button variant="primary" onClick={() => setImportOpen(true)}>导入历史 CSV</Button>
                <Button onClick={loadDemo} loading={busy}>重新生成演示数据</Button>
                <Button variant="danger" onClick={clearData}>清空台账数据</Button>
              </div>
              <div className="divider" />
              <div className="row">
                <Button size="sm" onClick={() => exportFile('balances')}>导出余额流水</Button>
                <Button size="sm" onClick={() => exportFile('snapshots')}>导出每日快照</Button>
                <Button size="sm" onClick={() => exportFile('positions')}>导出持仓</Button>
              </div>
              <div className="notice">
                CSV 支持宽表 <b>date, 微信, 支付宝, …</b> 与长表 <b>date, account, amount, note</b>；导入后自动补建未知账户、重算快照并同步全站。
              </div>
            </div>
          </Card>

          <Card title="运行状态" subtitle="最近一次数据联动">
            <div className="stack" style={{ gap: 10 }}>
              <div className="row-between">
                <span className="muted small">运行模式</span><Badge tone="positive">纯前端 Demo</Badge>
              </div>
              <div className="row-between">
                <span className="muted small">存储位置</span><span className="small mono">localStorage</span>
              </div>
              <div className="row-between">
                <span className="muted small">最近变更</span><span className="small">{lastEvent ? reasonLabel[lastEvent.reason] ?? lastEvent.reason : '—'}</span>
              </div>
              <div className="row-between">
                <span className="muted small">快照重算</span><span className="small">{lastEvent?.snapshotDays ?? 0} 天</span>
              </div>
              <div className="row">
                <Button size="sm" onClick={() => onNavigate('trend')}>查看趋势 →</Button>
                <Button size="sm" onClick={() => onNavigate('distribution')}>查看分布 →</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card title="本地运行说明" subtitle="这个 Demo 不需要后端与数据库">
        <div className="grid grid-2">
          <div className="code">{`# 项目根目录
npm install
npm run dev

# 打开 http://localhost:5173
# 构建静态包：npm run build`}</div>
          <div className="stack" style={{ gap: 10 }}>
            <div className="notice">数据链路：余额台账 / 报价 → 每日快照重算 → 趋势、分布、机会分析、提醒同步刷新。所有页面通过本地事件总线联动。</div>
            <div className="notice">后续接后端时，只需把 <b>api.tsx</b> 中的本地调用替换为 <b>fetch + SSE</b>，页面与数据结构可保持不变。</div>
          </div>
        </div>
      </Card>

      <CsvImportModal open={importOpen} onClose={() => setImportOpen(false)} onNavigate={onNavigate} />
    </>
  );
}
