/* Estilos do painel, injetados dentro do Shadow DOM (não afetam o Bitrix). */
(function (root) {
  'use strict';
  const NS = root.BNKA || (root.BNKA = {});
  NS.panelCss = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.root { --c-primary: #2067b0; --c-primary-2: #3bc8f5; --c-text: #333c48; --c-muted: #6a737f; --c-border: #e1e5ea;
  --c-bg: #ffffff; --c-soft: #f5f7f8; --c-danger: #e0342c; --c-danger-bg: #fdecea; --c-high: #c25400; --c-high-bg: #fff1e3;
  --c-med: #7a5b00; --c-med-bg: #fff7d6; --c-warn: #0b6aa2; --c-warn-bg: #e5f4fd; --c-ok: #2e7d32; --c-ok-bg: #e9f6ea;
  font-family: "Open Sans", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif; font-size: 13px; line-height: 1.4;
  color: var(--c-text); -webkit-font-smoothing: antialiased; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--c-primary-2); outline-offset: 2px; }

.fab { position: fixed; right: 0; top: 46%; z-index: 2147483000; display: flex; align-items: center; gap: 6px;
  padding: 9px 10px 9px 12px; border: 0; border-radius: 10px 0 0 10px; background: var(--c-primary); color: #fff;
  box-shadow: 0 4px 14px rgba(0,0,0,.22); font-weight: 600; font-size: 12px; writing-mode: horizontal-tb; }
.fab:hover { background: #18528e; }
.fab .dot { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #fff; color: var(--c-primary);
  display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
.fab.alert .dot { background: var(--c-danger); color: #fff; }
.fab.idle .dot { background: rgba(255,255,255,.3); color: #fff; }
.fab[hidden] { display: none; }

.panel { position: fixed; top: 0; right: 0; height: 100vh; width: min(460px, 100vw); z-index: 2147483001;
  background: var(--c-bg); border-left: 1px solid var(--c-border); box-shadow: -8px 0 24px rgba(0,0,0,.16);
  display: flex; flex-direction: column; }
.panel[hidden] { display: none; }
@media (max-width: 600px) { .panel { width: 100vw; border-left: 0; } }

.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: linear-gradient(90deg, #2067b0, #2a7cc7);
  color: #fff; }
.head h1 { margin: 0; font-size: 14px; font-weight: 700; flex: 1; min-width: 0; }
.head .sub { display: block; font-size: 11px; font-weight: 400; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn { border: 0; background: rgba(255,255,255,.16); color: #fff; border-radius: 6px; padding: 5px 9px; font-size: 12px; }
.icon-btn:hover { background: rgba(255,255,255,.3); }

.status { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid var(--c-border); background: var(--c-soft); }
.status.warn { background: var(--c-med-bg); color: var(--c-med); }
.status.error { background: var(--c-danger-bg); color: var(--c-danger); }
.status.info { background: var(--c-warn-bg); color: var(--c-warn); }

.tabs { display: flex; border-bottom: 1px solid var(--c-border); background: #fff; }
.tabs button { flex: 1; border: 0; background: none; padding: 9px 4px; font-size: 12px; font-weight: 600; color: var(--c-muted);
  border-bottom: 2px solid transparent; }
.tabs button[aria-selected="true"] { color: var(--c-primary); border-bottom-color: var(--c-primary); }

.body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 12px; }
.section { margin-bottom: 16px; }
.section h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--c-muted); margin: 0 0 8px; }
.muted { color: var(--c-muted); }
.small { font-size: 11px; }

.kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 10px; }
.kpi { border: 1px solid var(--c-border); border-radius: 8px; padding: 7px 8px; background: #fff; min-width: 0; }
.kpi b { display: block; font-size: 18px; line-height: 1.2; }
.kpi span { font-size: 11px; color: var(--c-muted); }
.kpi.danger b { color: var(--c-danger); } .kpi.high b { color: var(--c-high); } .kpi.warn b { color: var(--c-warn); }
.kpi.wide { grid-column: 1 / -1; }
.kpi.wide b { font-size: 14px; }

.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
.filters .full { grid-column: 1 / -1; }
.input, select.input, textarea.input { width: 100%; border: 1px solid #c6cdd3; border-radius: 6px; padding: 6px 8px; background: #fff; min-width: 0; }
.input.invalid { border-color: var(--c-danger); background: var(--c-danger-bg); }
textarea.input { resize: vertical; min-height: 54px; }
label.check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }

.list { display: flex; flex-direction: column; gap: 8px; }
.item { border: 1px solid var(--c-border); border-left: 4px solid var(--c-border); border-radius: 8px; padding: 8px 10px; background: #fff; }
.item.sev4 { border-left-color: var(--c-danger); } .item.sev3 { border-left-color: var(--c-high); }
.item.sev2 { border-left-color: #d4a600; } .item.sev1 { border-left-color: var(--c-warn); }
.item .top { display: flex; gap: 6px; align-items: baseline; }
.item .rank { font-weight: 700; color: var(--c-muted); font-size: 11px; }
.item .title { font-weight: 700; flex: 1; min-width: 0; overflow-wrap: anywhere; }
.item .meta { font-size: 12px; color: var(--c-muted); margin-top: 2px; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.chip { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 10px; background: var(--c-soft); }
.chip.sev4 { background: var(--c-danger-bg); color: var(--c-danger); } .chip.sev3 { background: var(--c-high-bg); color: var(--c-high); }
.chip.sev2 { background: var(--c-med-bg); color: var(--c-med); } .chip.sev1 { background: var(--c-warn-bg); color: var(--c-warn); }
.chip.ok { background: var(--c-ok-bg); color: var(--c-ok); } .chip.gray { background: var(--c-soft); color: var(--c-muted); }
.line { font-size: 12px; margin-top: 4px; }
.partial { font-size: 11px; color: var(--c-med); margin-top: 3px; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
.btn { border: 1px solid #c6cdd3; background: #fff; border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 600; color: var(--c-text);
  text-decoration: none; display: inline-flex; align-items: center; }
.btn:hover { background: var(--c-soft); }
.btn.primary { background: var(--c-primary); border-color: var(--c-primary); color: #fff; }
.btn.primary:hover { background: #18528e; }
.btn.danger { color: var(--c-danger); border-color: #f0b4b0; }
.btn[disabled], .btn[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
.evidence { margin-top: 8px; padding: 8px; border-radius: 6px; background: var(--c-soft); font-size: 12px; }
.evidence h3 { margin: 6px 0 2px; font-size: 12px; }
.evidence h3:first-child { margin-top: 0; }
.evidence ul { margin: 2px 0 4px 16px; padding: 0; }
.empty { padding: 18px 8px; text-align: center; color: var(--c-muted); }

table.t { width: 100%; border-collapse: collapse; font-size: 12px; }
table.t th, table.t td { text-align: left; padding: 5px 4px; border-bottom: 1px solid var(--c-border); vertical-align: middle; }
table.t th { font-size: 11px; color: var(--c-muted); font-weight: 600; }
table.t td.num { text-align: right; white-space: nowrap; }
.bar { height: 6px; border-radius: 3px; background: var(--c-primary-2); min-width: 2px; }
table.t .input { padding: 4px 6px; }
table.t td.w { width: 74px; }

.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; min-width: 0; }
.field > span { font-size: 12px; font-weight: 600; }
.field small { color: var(--c-muted); font-size: 11px; }
.days { display: flex; flex-wrap: wrap; gap: 8px; }
.errors { background: var(--c-danger-bg); color: var(--c-danger); padding: 8px 10px; border-radius: 6px; margin-bottom: 10px; font-size: 12px; }
.errors ul { margin: 4px 0 0 16px; padding: 0; }
.okmsg { background: var(--c-ok-bg); color: var(--c-ok); padding: 8px 10px; border-radius: 6px; margin-bottom: 10px; font-size: 12px; }
.sticky { position: sticky; bottom: -12px; background: #fff; padding: 8px 0; border-top: 1px solid var(--c-border); display: flex; gap: 6px; }
.suggest { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.suggest button { border: 1px dashed #9fb0c0; background: #fff; border-radius: 10px; font-size: 11px; padding: 1px 8px; }
pre.diag { white-space: pre-wrap; word-break: break-all; font-size: 10px; background: var(--c-soft); padding: 6px; border-radius: 6px; max-height: 160px; overflow: auto; }

.hl { position: fixed; z-index: 2147482999; pointer-events: none; border: 3px solid #ff9f1a; border-radius: 8px;
  box-shadow: 0 0 0 4000px rgba(0,0,0,.08), 0 0 12px rgba(255,159,26,.8); transition: all .15s ease-out; }
.hl[hidden] { display: none; }
@media (prefers-reduced-motion: reduce) { .hl { transition: none; } }
`;
})(typeof globalThis !== 'undefined' ? globalThis : this);
