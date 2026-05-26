/**
 * Render data/graph.json into a self-contained interactive HTML file
 * (vis-network from CDN). Output: graph.html
 */

import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const GRAPH_PATH = join("data", "graph.json");
const OUT_PATH = "graph.html";

type Node = {
  id: string;
  label: string;
  name: string;
  toolkit: string;
  description: string;
  requiredInputs: string[];
  allInputs: string[];
  deprecated: boolean;
};

type Edge = {
  source: string;
  target: string;
  parameter: string;
  rationale: string;
};

const graph = JSON.parse(await readFile(GRAPH_PATH, "utf-8")) as {
  nodes: Node[];
  edges: Edge[];
};

const inDeg = new Map<string, number>();
const outDeg = new Map<string, number>();
for (const e of graph.edges) {
  inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
}

const visNodes = graph.nodes.map((n) => {
  const out = outDeg.get(n.id) ?? 0;
  const inn = inDeg.get(n.id) ?? 0;
  return {
    id: n.id,
    label: n.label,
    group: n.toolkit,
    value: 1 + out * 1.5 + inn * 0.5,
    _data: {
      name: n.name,
      description: n.description,
      requiredInputs: n.requiredInputs,
      allInputs: n.allInputs,
      toolkit: n.toolkit,
      outDegree: out,
      inDegree: inn,
      deprecated: n.deprecated,
    },
  };
});

const visEdges = graph.edges.map((e, i) => ({
  id: i,
  from: e.source,
  to: e.target,
  label: e.parameter,
  title: e.rationale,
  _data: e,
}));

const totalNodes = visNodes.length;
const totalEdges = visEdges.length;
const toolkits = Array.from(new Set(visNodes.map((n) => n.group))).sort();

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Composio Tool Dependency Graph</title>
  <script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
  <style>
    :root {
      --bg: #ffffff;
      --bg-2: #fafafa;
      --bg-3: #f4f4f5;
      --border: #e5e7eb;
      --border-2: #d4d4d8;
      --text: #111111;
      --text-muted: #6b7280;
      --text-dim: #9ca3af;
      --accent: #1f1f1f;
      --accent-soft: #ecfdf5;
      --green: #10b981;
      --googlesuper: #4285f4;
      --googlesuper-soft: #e8f0fe;
      --github: #24292f;
      --github-soft: #f5f5f7;
      --edge: #d4d4d8;
      --shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.05);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; overflow: hidden; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
    }
    #app {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr) 360px;
      grid-template-rows: 56px minmax(0, 1fr);
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    #app > * { min-width: 0; min-height: 0; }
    /* Top bar */
    header.topbar {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
    }
    header.topbar .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 14px;
      letter-spacing: -0.01em;
    }
    header.topbar .brand .logo {
      width: 22px; height: 22px; border-radius: 6px;
      background: linear-gradient(135deg, #111 0%, #333 100%);
      display: inline-flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 11px;
    }
    header.topbar .brand .pill {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      background: var(--accent-soft); color: var(--green); font-size: 10px;
      font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    }
    header.topbar .stats {
      font-size: 12px; color: var(--text-muted);
      display: flex; gap: 14px; align-items: center;
    }
    header.topbar .stats b { color: var(--text); font-weight: 600; }
    /* Sidebar */
    aside.sidebar {
      grid-column: 1; grid-row: 2;
      border-right: 1px solid var(--border);
      background: var(--bg-2);
      overflow-y: auto;
      padding: 14px 12px;
    }
    aside.sidebar .section { margin-bottom: 18px; }
    aside.sidebar h3 {
      margin: 0 0 8px; font-size: 11px; font-weight: 600;
      color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em;
      padding: 0 6px;
    }
    aside.sidebar .item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 8px; border-radius: 6px;
      font-size: 13px; color: var(--text); cursor: pointer;
      min-width: 0;
    }
    aside.sidebar .item:hover { background: var(--bg-3); }
    aside.sidebar .item input[type="checkbox"] {
      accent-color: var(--text); margin: 0; flex-shrink: 0;
    }
    aside.sidebar .item .dot {
      width: 8px; height: 8px; border-radius: 50%; display: inline-block;
      flex-shrink: 0;
    }
    aside.sidebar .item .dot.googlesuper { background: var(--googlesuper); }
    aside.sidebar .item .dot.github { background: var(--github); }
    aside.sidebar .item .slug {
      flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 11px;
    }
    aside.sidebar .item > span:not(.dot):not(.count):not(.slug) {
      flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    aside.sidebar .item .count {
      margin-left: auto; font-size: 11px; color: var(--text-dim);
      flex-shrink: 0;
    }
    aside.sidebar .item.active { background: var(--bg-3); }
    aside.sidebar .item.linklike {
      color: var(--text);
    }
    aside.sidebar .item.linklike:hover { color: var(--text); background: var(--bg-3); }
    aside.sidebar input[type="text"] {
      width: 100%; background: var(--bg); border: 1px solid var(--border);
      color: var(--text); padding: 7px 10px; border-radius: 6px; outline: none;
      font-size: 13px;
    }
    aside.sidebar input[type="text"]:focus { border-color: var(--accent); }

    /* Center canvas + toolbar */
    .center {
      grid-column: 2; grid-row: 2;
      position: relative; background: var(--bg-2);
      display: flex; flex-direction: column;
      min-width: 0; min-height: 0; overflow: hidden;
    }
    .center .toolbar {
      height: 44px; flex: 0 0 auto;
      display: flex; align-items: center; gap: 8px;
      padding: 0 14px; border-bottom: 1px solid var(--border);
      background: var(--bg);
    }
    .center .toolbar button, .center .toolbar select {
      background: var(--bg); border: 1px solid var(--border);
      color: var(--text); padding: 5px 10px; border-radius: 6px;
      cursor: pointer; font-size: 12px; height: 28px;
    }
    .center .toolbar button:hover { background: var(--bg-3); }
    .center .toolbar .grow { flex: 1 1 auto; }
    .center .toolbar .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 8px; border-radius: 999px;
      background: var(--bg-3); font-size: 11px; color: var(--text-muted);
    }
    .center #network {
      flex: 1 1 0;
      min-height: 200px; min-width: 200px;
      background: var(--bg-2);
      position: relative; overflow: hidden;
    }
    .center #network .vis-network { outline: none !important; }
    .center #network canvas {
      display: block !important;
      max-width: 100% !important;
      max-height: 100% !important;
    }
    .center .legend {
      position: absolute; bottom: 16px; left: 16px;
      display: flex; gap: 12px; padding: 8px 10px;
      background: rgba(255,255,255,0.95);
      border: 1px solid var(--border); border-radius: 8px;
      font-size: 11px; color: var(--text-muted);
      backdrop-filter: blur(4px); box-shadow: var(--shadow);
      pointer-events: none; z-index: 5;
    }
    .center .legend .item { display: flex; align-items: center; gap: 6px; }

    /* Right detail panel */
    aside.detail {
      grid-column: 3; grid-row: 2;
      border-left: 1px solid var(--border);
      background: var(--bg);
      overflow-y: auto;
    }
    aside.detail .header {
      padding: 14px 16px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    aside.detail .header h2 { margin: 0; font-size: 13px; font-weight: 600; }
    aside.detail .body { padding: 14px 16px; }
    aside.detail h3 {
      margin: 14px 0 6px; font-size: 11px; font-weight: 600; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    aside.detail .pill {
      display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10px;
      font-weight: 600; margin-right: 4px; vertical-align: middle;
    }
    aside.detail .pill.googlesuper { background: var(--googlesuper-soft); color: var(--googlesuper); }
    aside.detail .pill.github { background: var(--github-soft); color: var(--github); }
    aside.detail .pill.muted { background: var(--bg-3); color: var(--text-muted); }
    aside.detail .slug {
      font-family: ui-monospace, "SF Mono", monospace; font-size: 12px; font-weight: 600;
      word-break: break-word;
    }
    aside.detail .desc {
      color: var(--text-muted); line-height: 1.5; margin-top: 6px;
      background: var(--bg-2); padding: 10px; border-radius: 6px;
      border: 1px solid var(--border); font-size: 12px;
    }
    aside.detail code {
      font-family: ui-monospace, "SF Mono", monospace; font-size: 11px;
      background: var(--bg-3); padding: 1px 5px; border-radius: 4px;
      color: var(--text);
    }
    aside.detail .edge-row {
      padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px;
    }
    aside.detail .edge-row:last-child { border-bottom: none; }
    aside.detail .edge-row a {
      color: var(--text); text-decoration: none; font-family: ui-monospace, "SF Mono", monospace;
      font-size: 11px; word-break: break-word;
    }
    aside.detail .edge-row a:hover { text-decoration: underline; }
    aside.detail .edge-row .why {
      color: var(--text-muted); font-size: 11px; margin-top: 4px; line-height: 1.4;
    }
    .empty {
      color: var(--text-muted); font-size: 12px;
      padding: 30px 16px; text-align: center;
    }
    .small { font-size: 11px; color: var(--text-muted); }
    .scroll { max-height: 240px; overflow-y: auto; overflow-x: hidden; }
    /* Loading splash */
    .splash {
      position: absolute; top: 44px; right: 0; bottom: 0; left: 0;
      background: var(--bg-2);
      display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 10px; color: var(--text-muted);
      font-size: 13px; z-index: 10;
      transition: opacity .25s ease;
      pointer-events: none;
    }
    .splash.hidden { opacity: 0; }
    .splash .spinner {
      width: 28px; height: 28px; border: 2px solid var(--border);
      border-top-color: var(--text); border-radius: 50%; animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    /* Error overlay */
    #errBox {
      position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
      max-width: 80%; padding: 10px 14px; border-radius: 8px;
      background: #fff5f5; color: #b42318; border: 1px solid #fecdca;
      font-family: ui-monospace, monospace; font-size: 12px; z-index: 100;
      box-shadow: var(--shadow); display: none; white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="app">
    <header class="topbar">
      <div class="brand">
        <span class="logo">C</span>
        <span>Composio Tool Dependency Graph</span>
        <span class="pill">graph</span>
      </div>
      <div class="stats" id="stats"></div>
    </header>

    <aside class="sidebar">
      <div class="section">
        <h3>Search</h3>
        <input id="search" type="text" placeholder="Filter slugs / descriptions" />
      </div>

      <div class="section">
        <h3>Toolkits</h3>
        <div id="toolkits"></div>
      </div>

      <div class="section">
        <h3>Layout</h3>
        <label class="item linklike"><input type="checkbox" id="hierarchical" /><span>Hierarchical (LR)</span></label>
        <label class="item linklike"><input type="checkbox" id="hideIsolated" checked /><span>Hide isolated nodes</span></label>
        <label class="item linklike"><input type="checkbox" id="onlyRequired" checked /><span>Only required-input edges</span></label>
      </div>

      <div class="section">
        <h3>Top producers</h3>
        <div id="topProducers" class="scroll"></div>
      </div>

      <div class="section">
        <h3>Top consumers</h3>
        <div id="topConsumers" class="scroll"></div>
      </div>
    </aside>

    <div class="center">
      <div class="toolbar">
        <button id="fit" title="Fit graph to viewport">Fit to screen</button>
        <button id="reflow" title="Re-run physics">Reflow</button>
        <span class="grow"></span>
        <span class="badge" id="visibleStats">— visible</span>
      </div>
      <div id="network"></div>
      <div id="splash" class="splash">
        <div class="spinner"></div>
        <div>Laying out graph…</div>
      </div>
      <div id="errBox"></div>
      <div class="legend">
        <div class="item"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:var(--googlesuper);display:inline-block"></span> googlesuper</div>
        <div class="item"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:var(--github);display:inline-block"></span> github</div>
        <div class="item">Edge label = required parameter</div>
      </div>
    </div>

    <aside class="detail">
      <div class="header">
        <h2>Detail</h2>
        <span class="small" id="detailHint">Click a node to inspect</span>
      </div>
      <div class="body" id="detail">
        <div class="empty">No node selected.</div>
      </div>
    </aside>
  </div>

<script>
window.addEventListener('error', (ev) => {
  const box = document.getElementById('errBox');
  if (!box) return;
  box.style.display = 'block';
  box.textContent = 'JS error: ' + (ev.message || String(ev.error));
});
window.addEventListener('unhandledrejection', (ev) => {
  const box = document.getElementById('errBox');
  if (!box) return;
  box.style.display = 'block';
  box.textContent = 'Promise rejection: ' + (ev.reason?.message || String(ev.reason));
});

if (typeof vis === 'undefined') {
  document.getElementById('errBox').style.display = 'block';
  document.getElementById('errBox').textContent =
    'vis-network library failed to load (check network / CDN access).';
  throw new Error('vis-network not loaded');
}

const NODES = ${JSON.stringify(visNodes)};
const EDGES = ${JSON.stringify(visEdges)};
const TOOLKITS = ${JSON.stringify(toolkits)};
const TOTAL_NODES = ${totalNodes};
const TOTAL_EDGES = ${totalEdges};

document.getElementById('stats').innerHTML =
  '<span><b>' + TOTAL_NODES + '</b> tools</span>' +
  '<span><b>' + TOTAL_EDGES + '</b> edges</span>' +
  '<span>' + TOTAL_NODES + ' nodes from <b>' + TOOLKITS.join(' + ') + '</b></span>';

// Toolkit filter rows
const toolkitsEl = document.getElementById('toolkits');
const toolkitState = {};
const tkCounts = {};
for (const n of NODES) tkCounts[n.group] = (tkCounts[n.group] ?? 0) + 1;
for (const tk of TOOLKITS) {
  toolkitState[tk] = true;
  const lbl = document.createElement('label');
  lbl.className = 'item';
  lbl.innerHTML =
    '<input type="checkbox" checked />' +
    '<span class="dot ' + tk + '"></span>' +
    '<span>' + tk + '</span>' +
    '<span class="count">' + tkCounts[tk] + '</span>';
  toolkitsEl.appendChild(lbl);
  lbl.querySelector('input').addEventListener('change', (ev) => {
    toolkitState[tk] = ev.target.checked;
    rebuild();
  });
}

// Top lists
function renderTopList(elId, getter) {
  const arr = NODES.slice().sort((a, b) => getter(b) - getter(a)).slice(0, 12);
  const el = document.getElementById(elId);
  el.innerHTML = '';
  for (const n of arr) {
    const d = document.createElement('div');
    d.className = 'item linklike';
    d.dataset.id = n.id;
    d.title = n.id + ' (' + getter(n) + ')';
    d.innerHTML = '<span class="dot ' + n.group + '"></span><span class="slug">' + n.id + '</span><span class="count">' + getter(n) + '</span>';
    d.addEventListener('click', () => focusNode(n.id));
    el.appendChild(d);
  }
}
renderTopList('topProducers', (n) => n._data.outDegree);
renderTopList('topConsumers', (n) => n._data.inDegree);

// Network
const container = document.getElementById('network');
const splash = document.getElementById('splash');
const dataset = { nodes: new vis.DataSet([]), edges: new vis.DataSet([]) };
const baseOptions = {
  autoResize: true,
  nodes: {
    shape: 'dot',
    scaling: {
      min: 6,
      max: 38,
      label: {
        enabled: true,
        min: 11,
        max: 18,
        drawThreshold: 8,
        maxVisible: 22,
      },
    },
    font: {
      color: '#111111', size: 12,
      face: 'ui-monospace, SF Mono, Menlo, monospace',
      strokeWidth: 4, strokeColor: '#fafafaee',
    },
    borderWidth: 1.5,
    chosen: {
      node: function (values, id, selected, hovering) {
        if (selected || hovering) {
          values.borderWidth = 3;
          values.size = values.size * 1.15;
        }
      },
    },
  },
  edges: {
    arrows: { to: { enabled: true, scaleFactor: 0.5 } },
    color: { color: 'rgba(15,23,42,0.10)', highlight: '#111111', hover: '#6b7280', inherit: false },
    smooth: { enabled: true, type: 'continuous', roundness: 0.35 },
    font: { color: '#6b7280', size: 10, strokeWidth: 4, strokeColor: '#fafafaee', align: 'middle' },
    selectionWidth: 1.6,
    width: 0.6,
    hoverWidth: 1.2,
    chosen: {
      edge: function (values) { values.opacity = 1; },
      label: function () {},
    },
  },
  groups: {
    googlesuper: {
      color: { background: '#4285f4', border: '#1a73e8',
               highlight: { background: '#82aaff', border: '#1a73e8' },
               hover: { background: '#82aaff', border: '#1a73e8' } },
    },
    github: {
      color: { background: '#24292f', border: '#0d1117',
               highlight: { background: '#57606a', border: '#24292f' },
               hover: { background: '#57606a', border: '#24292f' } },
    },
  },
  physics: {
    enabled: true,
    solver: 'forceAtlas2Based',
    forceAtlas2Based: {
      gravitationalConstant: -55,
      centralGravity: 0.018,
      springLength: 160,
      springConstant: 0.045,
      damping: 0.6,
      avoidOverlap: 0.85,
    },
    maxVelocity: 30,
    minVelocity: 0.75,
    timestep: 0.4,
    stabilization: { enabled: true, iterations: 500, fit: true, updateInterval: 25 },
  },
  interaction: {
    hover: true, navigationButtons: false, multiselect: true,
    tooltipDelay: 200, hideEdgesOnDrag: true, hideEdgesOnZoom: true,
  },
};
const network = new vis.Network(container, dataset, baseOptions);

let splashTimer = null;
function hideSplash() {
  splash.classList.add('hidden');
  if (splashTimer) { clearTimeout(splashTimer); splashTimer = null; }
}
function armSplash(ms) {
  if (splashTimer) clearTimeout(splashTimer);
  splashTimer = setTimeout(() => {
    network.fit({ animation: false });
    hideSplash();
  }, ms);
}
network.on('stabilizationIterationsDone', () => {
  network.setOptions({ physics: { enabled: false } });
  network.fit({ animation: { duration: 250, easingFunction: 'easeOutQuad' } });
  hideSplash();
});
network.on('stabilized', () => {
  network.fit({ animation: false });
  hideSplash();
});

const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

function rebuild() {
  try {
    const search = document.getElementById('search').value.trim().toLowerCase();
    const onlyRequired = document.getElementById('onlyRequired').checked;
    const hideIsolated = document.getElementById('hideIsolated').checked;

    const passNode = (n) => {
      if (!toolkitState[n.group]) return false;
      if (search && !(n.id.toLowerCase().includes(search) || (n._data.description || '').toLowerCase().includes(search))) {
        return false;
      }
      return true;
    };

    let nodes = NODES.filter(passNode);
    let edges = EDGES.filter((e) => {
      if (!onlyRequired) return true;
      const tgt = NODE_BY_ID.get(e.to);
      return tgt && tgt._data.requiredInputs.includes(e.label);
    });

    const idSet = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));

    if (hideIsolated) {
      const used = new Set();
      for (const e of edges) { used.add(e.from); used.add(e.to); }
      nodes = nodes.filter((n) => used.has(n.id));
    }

    // Strip _data and add lightweight title for hover tooltip.
    const visNodesOut = nodes.map((n) => ({
      id: n.id,
      label: n.label,
      group: n.group,
      value: n.value,
      title:
        n._data.name + ' (' + n.group + ')\\n' +
        'in:' + n._data.inDegree + ' out:' + n._data.outDegree + '\\n' +
        'required: ' + (n._data.requiredInputs.join(', ') || '(none)') + '\\n' +
        (n._data.description || '').slice(0, 200),
    }));
    const visEdgesOut = edges.map((e) => ({
      id: e.id, from: e.from, to: e.to, label: e.label, title: e.title,
    }));

    splash.classList.remove('hidden');
    network.setOptions({ physics: { enabled: true } });

    dataset.nodes.clear(); dataset.edges.clear();
    if (visNodesOut.length) dataset.nodes.add(visNodesOut);
    if (visEdgesOut.length) dataset.edges.add(visEdgesOut);

    document.getElementById('visibleStats').textContent =
      visNodesOut.length + ' nodes · ' + visEdgesOut.length + ' edges visible';

    if (visNodesOut.length === 0) {
      // Nothing to draw — drop the splash.
      hideSplash();
      return;
    }

    // Force fit shortly after data is added so something is visible
    // even if stabilization is slow.
    requestAnimationFrame(() => network.fit({ animation: false }));
    // Safety net per rebuild: hide the splash and fit even if stabilization
    // events don't fire (e.g. already stable, sparse graph).
    const budget = Math.min(6000, 1500 + visNodesOut.length * 4);
    armSplash(budget);
  } catch (err) {
    const box = document.getElementById('errBox');
    box.style.display = 'block';
    box.textContent = 'rebuild() failed: ' + (err && err.message ? err.message : String(err));
    console.error(err);
  }
}

document.getElementById('search').addEventListener('input', () => {
  // Debounce light: rebuild on every change but wrap in requestAnimationFrame
  requestAnimationFrame(rebuild);
});
document.getElementById('hierarchical').addEventListener('change', (ev) => {
  if (ev.target.checked) {
    network.setOptions({
      layout: { hierarchical: { enabled: true, direction: 'LR', sortMethod: 'directed', levelSeparation: 220, nodeSpacing: 120, treeSpacing: 180 } },
      physics: { enabled: false },
    });
    setTimeout(() => network.fit({ animation: true }), 200);
  } else {
    network.setOptions({ layout: { hierarchical: { enabled: false } } });
    rebuild();
  }
});
document.getElementById('hideIsolated').addEventListener('change', rebuild);
document.getElementById('onlyRequired').addEventListener('change', rebuild);
document.getElementById('fit').addEventListener('click', () => network.fit({ animation: true }));
document.getElementById('reflow').addEventListener('click', () => {
  splash.classList.remove('hidden');
  network.setOptions({ physics: { enabled: true } });
  network.stabilize();
  armSplash(4000);
});

// Adjacency index for fast highlight on click
const NEIGHBORS = (() => {
  const map = new Map();
  for (const e of EDGES) {
    if (!map.has(e.from)) map.set(e.from, new Set());
    if (!map.has(e.to)) map.set(e.to, new Set());
    map.get(e.from).add(e.to);
    map.get(e.to).add(e.from);
  }
  return map;
})();

let highlightActive = false;
function applyHighlight(id) {
  const neighbors = NEIGHBORS.get(id) || new Set();
  const focus = new Set([id, ...neighbors]);
  const nodeUpdates = [];
  dataset.nodes.forEach((n) => {
    const isFocus = focus.has(n.id);
    nodeUpdates.push({
      id: n.id,
      color: isFocus ? undefined : { background: '#e5e7eb', border: '#d4d4d8' },
      font: isFocus
        ? { color: '#111', size: 14, strokeWidth: 4, strokeColor: '#fafafaee' }
        : { color: 'rgba(0,0,0,0)' },
      opacity: isFocus ? 1 : 0.35,
    });
  });
  dataset.nodes.update(nodeUpdates);

  const edgeUpdates = [];
  dataset.edges.forEach((e) => {
    const involved = e.from === id || e.to === id;
    edgeUpdates.push({
      id: e.id,
      color: involved
        ? { color: '#111', highlight: '#111' }
        : { color: 'rgba(15,23,42,0.05)' },
      width: involved ? 1.6 : 0.5,
      font: involved
        ? { color: '#111', size: 11, strokeWidth: 4, strokeColor: '#fafafaee' }
        : { color: 'rgba(0,0,0,0)' },
    });
  });
  dataset.edges.update(edgeUpdates);
  highlightActive = true;
}

function clearHighlight() {
  if (!highlightActive) return;
  const nodeUpdates = [];
  dataset.nodes.forEach((n) => {
    nodeUpdates.push({
      id: n.id,
      color: undefined,
      font: { color: '#111', size: 12, strokeWidth: 4, strokeColor: '#fafafaee' },
      opacity: 1,
    });
  });
  dataset.nodes.update(nodeUpdates);
  const edgeUpdates = [];
  dataset.edges.forEach((e) => {
    edgeUpdates.push({
      id: e.id,
      color: { color: 'rgba(15,23,42,0.10)' },
      width: 0.6,
      font: { color: '#6b7280', size: 10, strokeWidth: 4, strokeColor: '#fafafaee' },
    });
  });
  dataset.edges.update(edgeUpdates);
  highlightActive = false;
}

network.on('selectNode', (params) => {
  const id = params.nodes[0];
  if (id) {
    showDetail(id);
    applyHighlight(id);
  }
});
network.on('deselectNode', () => {
  showDetailEmpty();
  clearHighlight();
});
network.on('click', (params) => {
  if (params.nodes.length === 0 && params.edges.length === 0) {
    clearHighlight();
    showDetailEmpty();
  }
});

// Zoom-aware label density: hide labels when far out, reveal as you zoom in.
let lastLabelMode = null;
function applyLabelMode(mode) {
  if (highlightActive) return;
  if (mode === lastLabelMode) return;
  lastLabelMode = mode;
  const fontSize = mode === 'all' ? 12 : (mode === 'sparse' ? 11 : 0);
  network.setOptions({
    nodes: { font: { size: fontSize, color: '#111', strokeWidth: 4, strokeColor: '#fafafaee' } },
  });
}
network.on('zoom', (params) => {
  const s = params.scale ?? network.getScale();
  if (s < 0.45) applyLabelMode('hide');
  else if (s < 0.85) applyLabelMode('sparse');
  else applyLabelMode('all');
});
// Initial label mode
network.once('afterDrawing', () => {
  const s = network.getScale();
  if (s < 0.45) applyLabelMode('hide');
  else if (s < 0.85) applyLabelMode('sparse');
  else applyLabelMode('all');
});

function focusNode(id) {
  network.selectNodes([id]);
  network.focus(id, { scale: 1.6, animation: { duration: 350, easingFunction: 'easeOutQuad' } });
  showDetail(id);
}

function showDetailEmpty() {
  document.getElementById('detail').innerHTML = '<div class="empty">No node selected.</div>';
  document.getElementById('detailHint').textContent = 'Click a node to inspect';
}

function showDetail(id) {
  const n = NODES.find((x) => x.id === id);
  if (!n) return showDetailEmpty();
  const incoming = EDGES.filter((e) => e.to === id);
  const outgoing = EDGES.filter((e) => e.from === id);
  const renderEdges = (arr, dir) => {
    if (arr.length === 0) return '<div class="small">none</div>';
    return arr.map((e) => {
      const other = dir === 'in' ? e.from : e.to;
      const why = (e.title || '').replace(/</g,'&lt;');
      return '<div class="edge-row">' +
        (dir === 'in'
          ? '<a href="#" data-id="' + other + '">' + other + '</a> <span class="small">→</span> <code>' + e.label + '</code>'
          : '<span class="small">→</span> <code>' + e.label + '</code> <a href="#" data-id="' + other + '">' + other + '</a>') +
        (why ? '<div class="why">' + why + '</div>' : '') +
      '</div>';
    }).join('');
  };
  const desc = (n._data.description || '').replace(/</g,'&lt;');
  const html =
    '<div><span class="pill ' + n.group + '">' + n.group + '</span>' +
    (n._data.deprecated ? '<span class="pill muted">deprecated</span>' : '') + '</div>' +
    '<div class="slug" style="margin-top:8px">' + n.id + '</div>' +
    '<div class="small" style="margin-top:2px">' + n._data.name + '</div>' +
    '<div class="desc">' + desc + '</div>' +
    '<h3>Required inputs</h3>' +
    (n._data.requiredInputs.length ? n._data.requiredInputs.map((p) => '<code>' + p + '</code>').join(' ') : '<div class="small">none</div>') +
    '<h3>Producers (incoming · ' + incoming.length + ')</h3>' + renderEdges(incoming, 'in') +
    '<h3>Consumers (outgoing · ' + outgoing.length + ')</h3>' + renderEdges(outgoing, 'out');
  document.getElementById('detail').innerHTML = html;
  document.getElementById('detailHint').textContent = n.id;
  document.getElementById('detail').querySelectorAll('a[data-id]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      focusNode(a.dataset.id);
    });
  });
}

// Initial build — wait two frames so the grid layout has computed sizes.
requestAnimationFrame(() => requestAnimationFrame(rebuild));
// Final safety: if for any reason the canvas is still empty after 4s, force re-render.
setTimeout(() => {
  if (dataset.nodes.length === 0) rebuild();
}, 4000);
</script>
</body>
</html>
`;

await writeFile(OUT_PATH, html, "utf-8");
console.log(`Wrote ${OUT_PATH} (${(html.length / 1024).toFixed(1)} KB).`);
console.log(`Open it: file://${process.cwd()}/${OUT_PATH}`);
