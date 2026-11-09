# Asset Ledger · 个人资产台账可视化 Demo

![Deploy to GitHub Pages](https://github.com/Stefanie781/-demo/actions/workflows/deploy.yml/badge.svg)

一个**无需后端**的资产记录 Web 平台演示：记录资产趋势、资金分布、理财信息，并通过规则引擎给出到期、止盈止损等提醒。打开页面即可看到完整的演示数据，不需要配置数据库或服务。

**在线预览**：<https://stefanie781.github.io/-demo/>
（首次使用需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**）

> 本项目是可视化 Demo。所有盈亏与「机会」结论均基于内置演示数据计算，不构成投资建议。

## 功能

| 模块 | 能力 |
| --- | --- |
| 资产趋势 | 每日净资产快照、净值曲线、资产构成堆叠、每日变化归因、快照明细表、CSV 历史数据导入与导出 |
| 资金分布 | 渠道账户台账（微信 / 支付宝 / 银行卡 / 券商 / 负债）、批量余额录入、占比环形图、历史日期回看、余额流水 |
| 理财与提醒 | 产品与持仓、报价录入、盈亏与到期状态、机会盘点（集中度 / 闲置资金 / 配置偏离）、规则中心、提醒确认与静默 |

**数据联动**：余额录入、CSV 导入、报价更新都会写入本地台账 → 自动重算全部每日快照 → 趋势、资金分布、机会分析、提醒在同一时刻刷新。CSV 导入历史数据后会补建未知账户，并可回看任意日期的资金分布。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # 类型检查
npm run build      # 静态产物输出到 web/dist
npm run preview    # 本地预览构建产物
```

要求 Node.js 20+（开发验证环境为 Node 22）。

## 导入 CSV

支持两种格式，空白单元格表示不修改该账户当日余额：

```csv
date,微信,支付宝,招商银行卡
2026-11-01,3200,8600,48000
2026-11-02,3100,8750,48000
```

```csv
date,account,amount,note
2026-11-01,微信,3200,工资入账
2026-11-02,招商银行卡,48000,
```

同一天同一账户重复导入会覆盖原值；日期也兼容 `2026/11/1` 写法。

## 部署到 GitHub Pages

仓库已包含 `.github/workflows/deploy.yml`：push 到 `main` / `master` 时自动执行 `npm ci` → `npm run build` → 发布 `web/dist`。

1. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；
2. push 代码后等待 Actions 完成；
3. 访问 `https://<用户名>.github.io/<仓库名>/`。

`vite.config.ts` 使用 `base: './'` 相对路径，因此更换仓库名无需改配置；页面使用 hash 路由（`#/trend`），静态托管不需要额外的 404 重写规则。

## 数据说明

- 所有数据保存在浏览器 `localStorage`，不上传任何服务器；每个访客看到的是各自独立的一份数据。
- 首次打开自动生成近 90 天的演示数据；在「设置与数据」页可重新生成或清空台账。
- 你在本地录入的数据不会同步到线上，也不会出现在其他访客的页面里。
- 接口层 `web/src/api.tsx` 保留了 `/api/*` 的调用形状，后续接入真实后端时替换其实现即可，页面无需重写。

## 目录结构

```
.
├── .github/workflows/deploy.yml   # GitHub Pages 自动部署
├── package.json                  # 根脚本（npm workspaces）
└── web/
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── mock.ts               # 本地数据层：演示数据、快照重算、规则评估、CSV
        ├── api.tsx               # 数据访问层 + 全局联动刷新
        ├── charts.ts             # ECharts 图表配置
        ├── components.tsx        # 通用 UI 组件
        ├── CsvImportModal.tsx    # CSV 导入弹窗
        ├── pages/                # 总览 / 趋势 / 分布 / 理财与提醒 / 设置
        ├── types.ts
        ├── utils.ts
        └── styles.css
```

## 技术栈

React 18 · TypeScript · Vite 6 · ECharts 5，纯前端、零后端依赖。
