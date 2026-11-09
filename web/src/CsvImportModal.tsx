import { useRef, useState } from 'react';
import { api } from './api';
import { Badge, Button, Field, Modal, useToast } from './components';
import type { ImportPreview, ImportResult } from './types';
import { money, shiftDate, todayStr } from './utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate?: (route: string) => void;
}

const wideSample = () => {
  const d = (n: number) => shiftDate(todayStr(), -n);
  return [
    'date,微信,支付宝,招商银行卡,现金,券商账户,信用卡欠款',
    `${d(3)},3200,8600,48000,1500,12000,2300`,
    `${d(2)},3100,8750,48000,1500,12350,2100`,
    `${d(1)},3050,9000,48500,1400,12600,1900`
  ].join('\n');
};

const longSample = () => {
  const d = (n: number) => shiftDate(todayStr(), -n);
  return [
    'date,account,amount,note',
    `${d(2)},微信,3200,工资入账`,
    `${d(2)},支付宝,8600,`,
    `${d(1)},微信,3050,消费`,
    `${d(1)},招商银行卡,48500,`
  ].join('\n');
};

export default function CsvImportModal({ open, onClose, onNavigate }: Props) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

  const reset = () => { setPreview(null); setResult(null); setError(null); };

  const doPreview = async () => {
    setBusy(true); setError(null);
    try {
      const data = await api.post<ImportPreview>('/api/data/import/preview', { csv });
      setPreview(data); setResult(null);
      if (!data.rows.length) setError(data.errors[0] ?? '未解析到有效数据行');
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  const doImport = async () => {
    setBusy(true); setError(null);
    try {
      const data = await api.post<ImportResult>('/api/data/import', { csv });
      setResult(data);
      toast(`导入 ${data.imported} 条记录，趋势与资金分布已同步`);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title="导入历史资产数据（CSV）"
      onClose={onClose}
      width={760}
      footer={<>
        <Button onClick={onClose}>关闭</Button>
        <Button variant="primary" loading={busy} disabled={!csv.trim()} onClick={doImport}>确认导入并同步</Button>
      </>}
    >
      <div className="notice">
        支持宽表 <b>date, 微信, 支付宝, …</b> 与长表 <b>date, account, amount, note</b>。
        导入后会从最早日期重算全部每日快照，并立即更新资金分布、趋势与分析页面。
      </div>

      <div className="row">
        <Button size="sm" onClick={() => { setCsv(wideSample()); reset(); }}>填入宽表示例</Button>
        <Button size="sm" onClick={() => { setCsv(longSample()); reset(); }}>填入长表示例</Button>
        <Button size="sm" onClick={() => fileRef.current?.click()}>选择 .csv 文件</Button>
        <input
          ref={fileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { setCsv(String(reader.result ?? '')); reset(); };
            reader.readAsText(file, 'UTF-8');
          }}
        />
        <div className="spacer" />
        <Button size="sm" variant="ghost" disabled={!csv.trim() || busy} onClick={doPreview}>解析预览</Button>
      </div>

      <Field label="CSV 内容" hint="同一天同一账户重复导入会覆盖原值；空白单元格表示不修改该账户当日余额。">
        <textarea className="input" value={csv} placeholder={wideSample()} onChange={(event) => { setCsv(event.target.value); reset(); }} />
      </Field>

      {error && <div className="error-hint">{error}</div>}

      {preview && !result && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="row">
            <Badge tone="info">{preview.mode === 'WIDE' ? '宽表格式' : '长表格式'}</Badge>
            <span className="small muted">解析 {preview.rows.length} 条记录</span>
            {preview.errors.length > 0 && <Badge tone="warning">{preview.errors.length} 行被跳过</Badge>}
          </div>
          <div className="table-wrap" style={{ maxHeight: 190, border: '1px solid var(--line)', borderRadius: 10 }}>
            <table className="data-table">
              <thead><tr><th>日期</th><th>账户</th><th className="num">金额</th><th>备注</th></tr></thead>
              <tbody>
                {preview.rows.slice(0, 6).map((row, index) => (
                  <tr key={index}>
                    <td className="mono">{row.date}</td><td>{row.account}</td>
                    <td className="num">{money(row.amount)}</td><td className="faint small">{row.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.errors.length > 0 && <div className="small faint">{preview.errors.slice(0, 3).join('；')}</div>}
        </div>
      )}

      {result && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="notice" style={{ borderColor: 'rgba(45,212,167,.35)', background: 'rgba(45,212,167,.08)', color: '#a9f3da' }}>
            导入完成：{result.imported} 条记录 · 重算 {result.event.snapshotDays} 天快照 · 趋势与资金分布已同步
          </div>
          <div className="grid grid-3" style={{ gap: 10 }}>
            <div><div className="faint small">新建账户</div><div className="list-title">{result.createdAccounts.length} 个</div></div>
            <div><div className="faint small">最早影响日期</div><div className="list-title mono">{result.affectedFrom ?? '—'}</div></div>
            <div><div className="faint small">同步后净资产</div><div className="list-title mono">{money(result.distribution.totals.netAssets)}</div></div>
          </div>
          {result.createdAccounts.length > 0 && <div className="small faint">自动创建：{result.createdAccounts.join('、')}</div>}
          {result.errors.length > 0 && <div className="small faint">跳过：{result.errors.slice(0, 3).join('；')}</div>}
          <div className="row">
            <Button size="sm" onClick={() => onNavigate?.('trend')}>查看趋势 →</Button>
            <Button size="sm" onClick={() => onNavigate?.('distribution')}>查看资金分布 →</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
