import { useEffect, useRef, useState } from 'react';
import { api, useApi, useData } from './api';
import { Button, useToast } from './components';
import Dashboard from './pages/Dashboard';
import Trend from './pages/Trend';
import Distribution from './pages/Distribution';
import Wealth from './pages/Wealth';
import Settings from './pages/Settings';
import { reasonLabel } from './utils';

type Route = 'dashboard' | 'trend' | 'distribution' | 'wealth' | 'settings';
const VALID: Route[] = ['dashboard', 'trend', 'distribution', 'wealth', 'settings'];

const NAV: Array<{ group: string; items: Array<{ key: Route; label: string; icon: string }> }> = [
  { group: '资产概览', items: [
    { key: 'dashboard', label: '总览', icon: '◈' },
    { key: 'trend', label: '资产趋势', icon: '↗' },
    { key: 'distribution', label: '资金分布', icon: '◉' }
  ] },
  { group: '理财与系统', items: [
    { key: 'wealth', label: '理财与提醒', icon: '▤' },
    { key: 'settings', label: '设置与数据', icon: '⚙' }
  ] }
];

const TITLES: Record<Route, { title: string; sub: string }> = {
  dashboard: { title: '资产总览', sub: '净值、分布与待办一屏掌握' },
  trend: { title: '资产趋势', sub: '每日快照 · 变化归因 · CSV 历史数据导入' },
  distribution: { title: '资金分布', sub: '各渠道余额台账，录入后全站实时联动' },
  wealth: { title: '理财与提醒', sub: '持仓、机会盘点、规则与提醒记录' },
  settings: { title: '设置与数据', sub: '目标配置、演示数据与 CSV 导入导出' }
};

const readHash = (): Route => {
  const value = window.location.hash.replace(/^#\/?/, '') as Route;
  return VALID.includes(value) ? value : 'dashboard';
};

export default function App() {
  const [route, setRoute] = useState<Route>(readHash);
  const { lastEvent } = useData();
  const toast = useToast();
  const lastAnnounced = useRef<string>('');
  const pending = useApi<Array<{ id: string }>>('/api/alerts?state=PENDING');

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!lastEvent || lastEvent.at === lastAnnounced.current) return;
    lastAnnounced.current = lastEvent.at;
    if (['ALERT_STATE', 'ALERT_ACK_ALL', 'SETTINGS_UPDATE', 'SERVER_START'].includes(lastEvent.reason)) return;
    const parts = [reasonLabel[lastEvent.reason] ?? lastEvent.reason];
    if (lastEvent.snapshotDays) parts.push(`重算 ${lastEvent.snapshotDays} 天快照`);
    if (lastEvent.newAlerts) parts.push(`新增 ${lastEvent.newAlerts} 条提醒`);
    toast(`${parts.join(' · ')}，页面已同步`, 'info');
  }, [lastEvent, toast]);

  const navigate = (target: string) => {
    window.location.hash = `/${target}`;
    setRoute(readHash());
  };

  const evaluate = async () => {
    try {
      const result = await api.post<{ newAlerts: number }>('/api/rules/evaluate');
      toast(result.newAlerts ? `评估完成，新增 ${result.newAlerts} 条提醒` : '评估完成，暂无新提醒');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const pendingCount = pending.data?.length ?? 0;
  const pageProps = { onNavigate: navigate };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">A</div>
          <div>
            <div className="brand-name">Asset Ledger</div>
            <div className="brand-sub">可视化 Demo</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="nav-group">{group.group}</div>
              {group.items.map((item) => (
                <button key={item.key} className={`nav-item ${route === item.key ? 'active' : ''}`} onClick={() => navigate(item.key)}>
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.key === 'wealth' && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          纯前端演示 · 数据保存在浏览器<br />刷新页面不会丢失，可随时重置
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{TITLES[route].title}</h1>
            <div className="topbar-sub">{TITLES[route].sub}</div>
          </div>
          <div className="topbar-actions">
            <span className="live" title={lastEvent ? `${reasonLabel[lastEvent.reason] ?? lastEvent.reason}` : '等待数据变更'}>
              <span className="live-dot" /> 本地实时联动
            </span>
            <Button size="sm" onClick={evaluate}>立即评估</Button>
            <Button size="sm" variant="primary" onClick={() => navigate('distribution')}>录入余额</Button>
          </div>
        </header>

        <main className="content">
          {route === 'dashboard' && <Dashboard {...pageProps} />}
          {route === 'trend' && <Trend {...pageProps} />}
          {route === 'distribution' && <Distribution {...pageProps} />}
          {route === 'wealth' && <Wealth {...pageProps} />}
          {route === 'settings' && <Settings {...pageProps} />}
        </main>

        <footer className="footer">
          演示数据仅保存在本地浏览器；所有盈亏与「机会」结论基于录入数据计算，不构成投资建议。
        </footer>
      </div>
    </div>
  );
}
