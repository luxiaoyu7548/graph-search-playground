(() => {
  'use strict';

  const P = window.GraphPresets;
  const S = window.GraphSearch;
  const $ = (id) => document.getElementById(id);
  const stateKey = 'graph-search-playground.v1';
  const algorithms = {
    astar: ['A*', 'g + h 最小', '到达终点'],
    bfs: ['BFS', '按发现顺序', '到达终点'],
    dfs: ['DFS', '优先沿分支深入', '到达终点'],
    ucs: ['UCS', '累计代价 g 最小', '到达终点'],
    greedy: ['贪心', '估计代价 h 最小', '到达终点'],
    dijkstra: ['Dijkstra', '累计代价 g 最小', '全部可达节点'],
    prim: ['Prim', '连接当前树的最轻边', '覆盖所有分量'],
    kruskal: ['Kruskal', '按边权检查是否成环', '检查全部边']
  };
  const pathAlgorithms = ['astar', 'bfs', 'dfs', 'ucs', 'greedy', 'dijkstra'];
  const treeAlgorithms = ['prim', 'kruskal'];
  const hNames = {manhattan: '曼哈顿距离', euclidean: '欧氏距离', zero: '恒为 0', over: '5 倍曼哈顿'};
  const tileTools = {wall: '画墙', mud: '铺泥地', plain: '擦除', start: '起点', goal: '终点'};
  const treePrinciple = '最小生成树用总权重最低的一组边连通所有顶点。最短路则关注指定起点与终点之间的路径代价。';
  const pathPrinciple = '路径搜索从同一对起终点出发，比较经过几条边、累计代价和展开规模。最小生成树关注整张图的连通成本。';
  const template = (id, html) => { $(id).innerHTML = html; };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
    {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]
  ));
  const fmt = (value) => Number.isFinite(value) ? String(Number(value.toFixed(3))) : '–';
  const button = (text, action, options = {}) => {
    const {className = '', value = '', pressed, title = '', disabled = false, id = ''} = options;
    return '<button type="button" class="button ' + className + '" data-action="' + action +
      '" data-value="' + esc(value) + '"' + (pressed === undefined ? '' : ' aria-pressed="' + pressed + '"') +
      (id ? ' id="' + id + '"' : '') + (title ? ' title="' + esc(title) + '"' : '') +
      (disabled ? ' disabled' : '') + '>' + text + '</button>';
  };
  const segment = (items, action, selected) => '<div class="segment">' + items.map(([value, label]) =>
    button(label, action, {value, pressed: selected === value, className: selected === value ? 'selected' : ''})
  ).join('') + '</div>';
  const selectOptions = (list, selected) => list.map(([id, name]) =>
    '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(name) + '</option>'
  ).join('');

  function readState() {
    const initial = {presets: [], working: {}};
    try {
      const data = JSON.parse(localStorage.getItem(stateKey));
      if (!data || !Array.isArray(data.presets)) return initial;
      for (const preset of data.presets) {
        try {
          if (typeof preset.id !== 'string' || !/^custom-[a-z0-9-]+$/.test(preset.id) ||
              initial.presets.some((item) => item.id === preset.id)) continue;
          initial.presets.push({id: preset.id, name: P.readName(preset.name), board: P.readBoard(preset.board)});
        } catch { /* A malformed preset does not affect other saved maps. */ }
      }
      for (const type of ['grid', 'graph']) {
        try {
          const item = data.working?.[type];
          const board = P.readBoard(item?.board);
          if (board.type === type) initial.working[type] = {id: item.id, board};
        } catch { /* Built-in example will be used. */ }
      }
    } catch { /* The lab remains usable if localStorage is unavailable. */ }
    return initial;
  }

  const saved = readState();
  const working = {};
  for (const type of ['grid', 'graph']) {
    const example = P.builtins.find((item) => item.board.type === type);
    const prior = saved.working[type];
    const ids = [...P.builtins, ...saved.presets].map((item) => item.id);
    working[type] = prior ? {id: ids.includes(prior.id) ? prior.id : '', board: prior.board} :
      {id: example.id, board: P.clone(example.board)};
  }

  let page = location.hash === '#compare' ? 'compare' : 'lab';
  let group = 'paths';
  let type = 'grid';
  let pathType = 'grid';
  let algorithm = 'astar';
  let heuristics = {grid: 'manhattan', graph: 'euclidean'};
  let step = 0;
  let speed = 6;
  let timer = null;
  let tileTool = 'wall';
  let editGraph = false;
  let graphTool = 'move';
  let selectedNode = '';
  let selectedEdge = '';
  let edgeFrom = '';
  let pointer = null;
  let trace;
  let comparisons = [];
  let noticeTimeout;

  const mode = () => page === 'compare' && group === 'trees' ? 'graph' : type;
  const active = () => working[mode()];
  const board = () => active().board;
  const algo = () => page === 'lab' ? 'astar' : algorithm;
  const isTree = () => page === 'compare' && group === 'trees';
  const h = () => heuristics[mode()];
  const frame = () => trace.frames[step];
  const last = () => step === trace.frames.length - 1;
  const nodeLabel = (id) => id == null ? '—' : mode() === 'grid' ?
    '(' + (id % board().cols + 1) + ', ' + (Math.floor(id / board().cols) + 1) + ')' : id;
  const isCustom = (id) => saved.presets.some((item) => item.id === id);
  const allPresets = () => [...P.builtins, ...saved.presets].filter((item) => item.board.type === mode());

  function announce(message, error = false) {
    const notice = $('notice');
    clearTimeout(noticeTimeout);
    notice.hidden = false;
    notice.classList.toggle('error', error);
    notice.textContent = message;
    noticeTimeout = setTimeout(() => { notice.hidden = true; }, 4400);
  }

  function save() {
    try {
      localStorage.setItem(stateKey, JSON.stringify({presets: saved.presets, working}));
    } catch {
      announce('浏览器无法写入本地存储。本次编辑仍可用，请导出 JSON 留存。', true);
    }
  }

  function snapshot() {
    const changes = saved.presets.find((item) => item.id === active().id);
    if (changes) changes.board = P.clone(board());
    save();
  }

  function stop() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  function resetSelection() {
    selectedNode = '';
    selectedEdge = '';
    edgeFrom = '';
  }

  function recompute(reset = true) {
    stop();
    const runner = isTree() ? (name) => S.mst(board(), name) : (name) => S.search(board(), name, h());
    if (page === 'compare') {
      const names = isTree() ? treeAlgorithms : pathAlgorithms;
      comparisons = names.map((name) => ({name, trace: runner(name)}));
      trace = comparisons.find((item) => item.name === algo()).trace;
    } else {
      comparisons = [];
      trace = runner('astar');
    }
    if (reset) step = 0;
    step = Math.min(step, trace.frames.length - 1);
  }

  function setPage(next) {
    stop();
    page = next;
    if (page === 'compare' && group === 'trees') algorithm = 'prim';
    if (page === 'lab' && group === 'trees') type = pathType;
    editGraph = false;
    resetSelection();
    recompute();
    render();
  }

  function changeBoard(next, id = '') {
    working[mode()] = {id, board: P.clone(next)};
    resetSelection();
    save();
    recompute();
    render();
  }

  function customPreset(name, value) {
    const created = {id: 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9), name, board: P.clone(value)};
    saved.presets.push(created);
    changeBoard(created.board, created.id);
    return created;
  }

  function askName(title, label, suggested, onSave) {
    const dialog = $('preset-dialog');
    $('dialog-title').textContent = title;
    $('dialog-label').textContent = label;
    $('dialog-name').value = suggested.slice(0, 40);
    $('dialog-name').setCustomValidity('');
    $('dialog-accept').textContent = '保存';
    $('dialog-input-wrap').hidden = false;
    $('dialog-description').hidden = true;
    dialog.showModal();
    $('dialog-name').focus();
    $('dialog-name').select();
    const form = $('preset-form');
    form.onsubmit = (event) => {
      event.preventDefault();
      try {
        const name = P.readName($('dialog-name').value);
        dialog.close();
        onSave(name);
      } catch (error) {
        $('dialog-name').setCustomValidity(error.message);
        $('dialog-name').reportValidity();
      }
    };
  }

  function removePreset() {
    const preset = saved.presets.find((item) => item.id === active().id);
    if (!preset) return;
    const dialog = $('preset-dialog');
    $('dialog-title').textContent = '删除预设';
    $('dialog-input-wrap').hidden = true;
    $('dialog-name').required = false;
    $('dialog-name').setCustomValidity('');
    $('dialog-description').hidden = false;
    $('dialog-description').textContent = '删除「' + preset.name + '」？可先导出 JSON 留存。';
    $('dialog-accept').textContent = '删除';
    dialog.showModal();
    $('dialog-cancel').focus();
    $('preset-form').onsubmit = (event) => {
      event.preventDefault();
      dialog.close();
      saved.presets = saved.presets.filter((item) => item !== preset);
      const example = P.builtins.find((item) => item.board.type === mode());
      changeBoard(example.board, example.id);
      announce('已删除预设。');
    };
  }

  function exportPreset() {
    const name = allPresets().find((entry) => entry.id === active().id)?.name ?? '自定义地图';
    const data = JSON.stringify({version: 1, name, board: board()}, null, 2);
    const file = URL.createObjectURL(new Blob([data + '\n'], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = file;
    link.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-') + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(file), 1000);
    announce('已导出当前地图。');
  }

  function renderChrome() {
    const comparison = page === 'compare';
    document.body.dataset.view = page;
    for (const [id, value] of [['nav-lab', 'lab'], ['nav-compare', 'compare']]) {
      $(id).setAttribute('aria-current', page === value ? 'page' : 'false');
    }
    $('page-heading').textContent = comparison ? '算法对比' : 'A* 搜索实验台';
    $('page-copy').textContent = comparison ?
      '把不同算法放进同一张地图，比较搜索顺序、结果与代价。' :
      '从起点到目标，观察已走代价与启发式估计如何共同决定下一步。';

    $('compare-controls').hidden = !comparison;
    $('compare-results').hidden = !comparison;
    if (comparison) {
      template('compare-controls',
        '<div class="comparison-switch">' + segment([['paths','最短路与路径搜索'], ['trees','最小生成树']], 'group', group) +
        '<p>' + (isTree() ? treePrinciple : pathPrinciple) + '</p></div>');
      renderComparison();
    }

    let settings = isTree() ? '<span class="tag">加权无向图</span>' :
      segment([['grid','网格地图'],['graph','节点图']], 'mode', mode());
    if (!isTree()) {
      const choices = mode() === 'grid' ? Object.entries(hNames) : [['euclidean','缩放欧氏距离'],['zero','恒为 0']];
      const activeHeuristic = !comparison || ['astar','greedy'].includes(algo());
      settings += '<label class="field heuristic-field" title="' +
        (activeHeuristic ? '估计从当前节点到目标的剩余代价' : '此算法不使用启发式，设置仍应用于对比中的 A* 和贪心') +
        '"><span>启发式</span><select id="heuristic-choice">' + selectOptions(choices, h()) + '</select></label>';
    }
    template('lab-settings', settings);
    $('workspace').dataset.mode = mode();
  }

  function renderPresets() {
    const custom = isCustom(active().id);
    const dirty = !custom && allPresets().some((item) => item.id === active().id && JSON.stringify(item.board) !== JSON.stringify(board()));
    const entries = allPresets().map((item) => [item.id, item.name + (item.id === active().id && dirty ? '（已修改）' : '')]);
    if (!active().id) entries.unshift(['', '当前草图']);
    template('preset-bar',
      '<label class="field preset-field"><span>地图预设</span><select id="preset-choice">' +
      selectOptions(entries, active().id) + '</select></label>' +
      '<div class="preset-actions toolbar">' +
      button('随机地图', 'random', {className: 'quiet'}) +
      button('管理预设', 'presets-dialog', {className: 'quiet'}) + '</div>');
  }

  function showPresets() {
    const custom = isCustom(active().id);
    template('preset-options',
      '<div class="preset-menu-grid">' +
      button('新增空白预设', 'new-preset') + button('复制当前地图', 'duplicate-preset') +
      button('重命名预设', 'rename-preset', {disabled: !custom}) + button('删除预设', 'delete-preset', {disabled: !custom}) +
      button('导入 JSON', 'import-preset') + button('导出 JSON', 'export-preset') + '</div>');
    $('preset-manager').showModal();
  }

  function renderTools() {
    if (mode() === 'grid') {
      template('plot-tools', '<span class="tool-label">绘图</span>' + segment(Object.entries(tileTools), 'tile-tool', tileTool));
    } else {
      const tools = [['move','移动'], ['node','加节点'], ['edge','加边'], ['start','设起点'], ['goal','设终点']];
      template('plot-tools', button(editGraph ? '结束编辑' : '编辑节点图', 'edit-graph', {
        className: editGraph ? 'primary' : '', pressed: editGraph
      }) + (editGraph ? segment(tools, 'graph-tool', graphTool) : ''));
    }
    const states = isTree() ? [['plain','候选边'], ['current','当前边'], ['path','已选边'], ['rejected','成环边']] :
      [['start','起点'], ['goal','终点'],
      ...(mode() === 'grid' ? [['wall','墙'], ['mud','泥地 · 5']] : []),
      ['open','Open'], ['closed','Closed'], ['path','最终路径']];
    template('legend', states.map(([key, label]) => '<span><i class="legend-swatch is-' + key + '"></i>' + label + '</span>').join(''));
  }

  function renderEditor() {
    const visible = mode() === 'graph' && editGraph;
    $('editor-panel').hidden = !visible;
    if (!visible) return;

    const edge = board().edges.find(({id}) => id === selectedEdge);
    const node = board().nodes.find(({id}) => id === selectedNode);
    const input = '<label class="field"><span>边权</span><input id="edge-weight" type="number" min=".01" max="10000" step="any" value="' +
      (edge?.weight ?? 1) + '"></label>';
    const guidance = {
      move: '拖动节点改布局，点击节点或边可选中。',
      node: '点击图中空白位置添加节点。',
      edge: edgeFrom ? '已选 ' + edgeFrom + '。点击另一个节点连接。' : '依次点击两个节点创建无向边。',
      start: '点击节点设为起点。',
      goal: '点击节点设为终点。'
    };
    template('editor-panel', '<div class="editor-help"><strong>节点图编辑</strong><p>' + guidance[graphTool] +
      '</p></div><div class="toolbar editor-actions">' +
      (edge ? '<span class="tag">' + edge.a + ' ↔ ' + edge.b + '</span>' + input +
        button('删除边', 'delete-edge', {className: 'quiet'}) :
        node ? '<span class="tag">节点 ' + node.id + '</span>' + button('删除节点', 'delete-node', {
          className: 'quiet', disabled: board().nodes.length <= 2
        }) : '<span class="mono editor-count">' + board().nodes.length + ' 个节点 / ' + board().edges.length + ' 条边</span>') +
      '</div>');
  }

  function renderPlayback() {
    const total = trace.frames.length - 1;
    const controls = $('playback');
    if (!controls.querySelector('#timeline')) {
      template('playback', '<div class="playback-buttons toolbar">' +
        button('↺', 'reset', {id:'reset-step', title:'回到开头（R）'}) +
        button('←', 'previous', {id:'previous-step', title:'上一步（左方向键）'}) +
        button('播放', 'play', {id:'play-step', className:'primary'}) +
        button('→', 'next', {id:'next-step', title:'下一步（右方向键）'}) +
        button('末尾', 'last', {id:'last-step', title:'跳到末尾（End）'}) + '</div>' +
        '<label class="timeline-field"><span class="sr-only">回放进度</span><input id="timeline" type="range" min="0" value="0"></label>' +
        '<output id="step-count" class="mono"></output><label class="field speed-field"><span>速度</span>' +
        '<select id="speed-choice">' + selectOptions([[2,'慢速'], [6,'正常'], [12,'快速'], [24,'极速']], speed) + '</select></label>');
      for (const [id, label] of [['reset-step','回到开头'],['previous-step','上一步'],['next-step','下一步'],['last-step','跳到末尾']]) {
        $(id).setAttribute('aria-label', label);
      }
    }
    $('timeline').max = total;
    $('timeline').value = step;
    $('timeline').setAttribute('aria-valuetext', '第 ' + step + ' 步，共 ' + total + ' 步');
    $('step-count').textContent = step + ' / ' + total;
    $('play-step').textContent = timer === null ? (last() ? '重播' : '播放') : '暂停';
    $('reset-step').disabled = step === 0 && timer === null;
    $('previous-step').disabled = step === 0;
    $('next-step').disabled = last();
    $('last-step').disabled = last();
  }

  function renderComparison() {
    const selectAlgorithm = (name) => button(algorithms[name][0], 'algorithm', {
      value: name, pressed: algo() === name, className: algo() === name ? 'selected' : ''
    });
    const minimum = Math.min(...comparisons.filter(({trace: item}) => item.result.found).map(({trace: item}) => item.result.cost));
    const treeRows = () => comparisons.map(({name, trace: item}) => '<tr' + (algo() === name ? ' class="active-row"' : '') +
      '><th scope="row">' + selectAlgorithm(name) + '</th><td>' + algorithms[name][1] + '</td><td class="mono">' +
      item.result.selected.length + '</td><td class="mono">' + fmt(item.result.cost) +
      '</td><td>' + item.result.components + (item.result.components === 1 ? ' 个分量 · 生成树' : ' 个分量 · 森林') + '</td></tr>').join('');
    const routeRows = () => comparisons.map(({name, trace: item}) => {
      const result = item.result;
      const cost = result.found ? fmt(result.cost) : '不可达';
      const best = result.found && Math.abs(result.cost - minimum) < 1e-8;
      return '<tr' + (algo() === name ? ' class="active-row"' : '') + '><th scope="row">' + selectAlgorithm(name) +
        '</th><td>' + algorithms[name][1] + '</td><td class="mono' + (best ? ' best-cost' : '') + '">' + cost +
        '</td><td class="mono">' + fmt(result.steps) + '</td><td class="mono">' + result.expanded +
        '</td><td>' + (name === 'dijkstra' ? '全部可达节点' : result.found ? '到达终点' : '耗尽候选') + '</td></tr>';
    }).join('');
    const headings = isTree() ? ['算法','选边规则','已选边','总权重','连通性'] :
      ['算法','展开规则','路径代价','步数','展开次数','停止范围'];
    template('compare-results', '<div class="comparison-heading"><h2>同图运行结果</h2><p>点击算法名称，查看下方的逐步回放。</p></div>' +
      '<div class="table-scroll"><table class="data-table"><thead><tr>' +
      headings.map((name) => '<th scope="col">' + name + '</th>').join('') +
      '</tr></thead><tbody>' + (isTree() ? treeRows() : routeRows()) + '</tbody></table></div>');
  }

  function renderGrid() {
    const map = board();
    const current = frame().current;
    const open = new Set(frame().open.map((entry) => entry.id));
    const closed = new Set(frame().closed);
    const path = new Set(frame().path ?? (last() ? trace.result.path : []));
    let grid = $('board').querySelector('.grid-map');
    if (!grid || grid.children.length !== map.cells.length) {
      template('board', '<div class="grid-map" style="--cols:' + map.cols + ';--rows:' + map.rows +
        '" role="group" aria-label="可编辑网格地图">' + map.cells.map((_, id) => '<button type="button" class="grid-cell" data-cell="' +
        id + '" tabindex="' + (id === map.start ? 0 : -1) + '"></button>').join('') + '</div>');
      grid = $('board').querySelector('.grid-map');
    }
    for (const [id, cell] of Array.from(grid.children).entries()) {
      const tile = map.cells[id];
      const classes = ['grid-cell'];
      const start = id === map.start;
      const goal = id === map.goal;
      if (tile !== 'plain') classes.push('is-' + tile);
      if (open.has(id)) classes.push('is-open');
      if (closed.has(id)) classes.push('is-closed');
      if (path.has(id)) classes.push('is-path');
      if (id === current) classes.push('is-current');
      if (start) classes.push('is-start');
      if (goal) classes.push('is-goal');
      const category = start ? '起点' : goal ? '终点' : {plain:'空地', wall:'墙', mud:'泥地'}[tile];
      const text = start ? 'S' : goal ? 'G' : path.has(id) ? '·' : tile === 'mud' ? '5' : '';
      cell.className = classes.join(' ');
      if (cell.textContent !== text) cell.textContent = text;
      cell.setAttribute('aria-label', nodeLabel(id) + ' ' + category +
        (id === current ? '，当前展开' : path.has(id) ? '，路径' : closed.has(id) ? '，Closed' : open.has(id) ? '，Open' : ''));
    }
  }

  function renderGraph() {
    const map = board();
    const status = frame();
    const route = status.path ?? (last() && !isTree() ? trace.result.path : []);
    const edgeKeys = new Set();
    for (let i = 1; i < route.length; i += 1) edgeKeys.add([route[i - 1], route[i]].sort().join('/'));
    const path = new Set(route);
    const open = new Set((status.open ?? []).map((entry) => entry.id));
    const closed = new Set(status.closed ?? []);
    const chosen = new Set(status.selected ?? []);
    const nodes = new Map(map.nodes.map((node) => [node.id, node]));

    const edges = map.edges.map((edge) => {
      const a = nodes.get(edge.a);
      const b = nodes.get(edge.b);
      const current = edge.id === status.currentEdge;
      const routeEdge = edgeKeys.has([edge.a, edge.b].sort().join('/'));
      const classes = ['graph-edge'];
      if (chosen.has(edge.id) || routeEdge) classes.push('is-path');
      if (current) classes.push('is-current');
      if (current && (status.rejected === true || status.rejected === edge.id || status.accepted === false)) classes.push('is-rejected');
      if (edge.id === selectedEdge) classes.push('is-selected');
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const label = fmt(edge.weight);
      const labelWidth = Math.max(26, label.length * 9 + 12);
      return '<g class="' + classes.join(' ') + '" data-edge="' + edge.id + '"' +
        (editGraph ? ' tabindex="0" role="button" aria-label="选择边 ' + edge.a + ' 到 ' + edge.b + '，权重 ' + label + '"' : '') +
        '><line class="edge-hit" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>' +
        '<line class="edge-line" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>' +
        '<rect class="edge-label-bg" x="' + (x - labelWidth / 2) + '" y="' + (y - 12) +
        '" width="' + labelWidth + '" height="24" rx="6"/><text class="edge-label" x="' + x + '" y="' + y + '">' + label + '</text></g>';
    }).join('');

    const vertices = map.nodes.map((node) => {
      const id = node.id;
      const classes = ['graph-node'];
      if (open.has(id)) classes.push('is-open');
      if (closed.has(id)) classes.push('is-closed');
      if (path.has(id)) classes.push('is-path');
      if (status.current === id) classes.push('is-current');
      if (id === selectedNode || id === edgeFrom) classes.push('is-selected');
      if (!isTree() && id === map.start) classes.push('is-start');
      if (!isTree() && id === map.goal) classes.push('is-goal');
      const label = id.length <= 6 ? id : id.slice(0, 5) + '…';
      return '<g class="' + classes.join(' ') + '" data-node="' + id + '" transform="translate(' + node.x + ' ' + node.y +
        ')"' + (editGraph ? ' role="button" tabindex="0" aria-label="节点 ' + id + '"' : '') +
        '><title>' + id + '</title><circle r="18"/><text' + (label.length > 3 ? ' class="small-node-label"' : '') + '>' + label + '</text></g>';
    }).join('');

    template('board', '<svg xmlns="http://www.w3.org/2000/svg" class="graph-map' + (editGraph ? ' editing' : '') +
      '" viewBox="0 0 ' + P.width + ' ' + P.height + '" role="' + (editGraph ? 'group' : 'img') +
      '" aria-label="加权无向节点图">' + edges + vertices + '</svg>');
  }

  function metric(label, value) {
    return '<div class="metric"><dt>' + label + '</dt><dd class="mono">' + value + '</dd></div>';
  }

  function renderSummary() {
    const result = trace.result;
    const current = frame();
    const name = algorithms[algo()][0];
    const completed = last();
    const tree = isTree();
    const status = completed ? (tree ? result.components === 1 ? '生成树完成' : '生成森林完成' :
      result.found ? '找到路径' : '终点不可达') : step ? '回放中' : '等待展开';
    const metrics = tree ? [
      metric('总权重', completed ? fmt(result.cost) : '—'),
      metric('选中边', (current.selected ?? []).length),
      metric('连通分量', completed ? result.components : '—')
    ] : [
      metric('路径代价', completed && result.found ? fmt(result.cost) : '—'),
      metric('路径步数', completed && result.found ? fmt(result.steps) : '—'),
      metric('已展开', completed ? result.expanded : current.expanded ?? current.closed.length)
    ];
    template('summary', '<div class="summary-head"><h2>' + name + ' 运行结果</h2><span class="tag status-tag' +
      (completed && !tree && !result.found ? ' warning' : '') + '">' + status + '</span></div>' +
      '<dl class="metrics">' + metrics.join('') + '</dl>');
  }

  function renderInspector() {
    const current = frame();
    if (isTree()) {
      const edge = board().edges.find((item) => item.id === current.currentEdge);
      const selected = (current.selected ?? []).map((id) => board().edges.find((item) => item.id === id));
      template('inspector', '<div class="inspector-inner"><h2>选边过程</h2><p class="inspector-caption">' +
        esc(current.message) + '</p>' + (edge ? '<div class="score-row">' +
        '<div class="score"><span>当前边</span><strong>' + edge.a + ' ↔ ' + edge.b + '</strong></div>' +
        '<div class="score"><span>权重</span><strong class="mono">' + fmt(edge.weight) + '</strong></div></div>' : '') +
        '<div class="queue-block"><h3>已选边 <span class="mono">' + selected.length + '</span></h3><div class="queue-scroll">' +
        (selected.length ? selected.map((item) => '<div class="queue-line"><span>' + item.a + ' ↔ ' + item.b +
          '</span><span class="mono">' + fmt(item.weight) + '</span></div>').join('') : '<p>等待选择第一条边。</p>') +
        '</div></div></div>');
      return;
    }

    const name = algo();
    const currentId = current.current;
    const detail = current.chosen ?? current.node ?? trace.frames[step - 1]?.open.find(({id}) => id === currentId) ??
      current.open.find(({id}) => id === currentId);
    const scores = detail && detail.id === currentId ? [['g','已走', detail.g],['h','估计', detail.h],['f','合计', detail.f]] : [];
    const showScores = name === 'astar' || name === 'greedy';
    const distances = last() && name === 'dijkstra' ? Object.entries(trace.result.distances ?? {}).filter(([, distance]) => Number.isFinite(distance)) : [];
    const openTitle = 'Open <span class="mono">' + current.open.length + '</span>';
    const closedTitle = 'Closed <span class="mono">' + current.closed.length + '</span>';
    const queue = current.open.length ? '<table class="data-table queue-table"><thead><tr><th scope="col">节点</th><th scope="col">g</th>' +
      (showScores ? '<th scope="col">h</th><th scope="col">f</th>' : '') + '</tr></thead><tbody>' +
      current.open.map((entry) => '<tr><td>' + nodeLabel(entry.id) + '</td><td>' + fmt(entry.g) + '</td>' +
        (showScores ? '<td>' + fmt(entry.h) + '</td><td>' + fmt(entry.f) + '</td>' : '') + '</tr>').join('') + '</tbody></table>' :
      '<p>候选队列为空。</p>';
    const note = name === 'astar' && h() === 'over' ? '<p class="heuristic-warning">当前使用夸大估计，路径可能次优。</p>' : '';
    const eventText = page === 'lab' && currentId != null && scores.length ?
      '展开 ' + nodeLabel(currentId) + '，它的 f 最小。' : esc(current.message);
    template('inspector', '<div class="inspector-inner"><h2>' + (page === 'lab' ? '为什么走这一步？' : '展开过程') +
      '</h2><p class="inspector-caption">' + eventText + '</p>' +
      (showScores && scores.length ? '<div class="score-row">' + scores.map(([symbol, label, value]) =>
        '<div class="score"><span><b class="mono">' + symbol + '</b> ' + label + '</span><strong class="mono">' + fmt(value) + '</strong></div>').join('') +
        '</div>' : page === 'lab' ? '<div class="formula mono">f(n) = g(n) + h(n)</div>' : '') + note +
      '<div class="queue-block"><h3>' + openTitle + '</h3><div class="queue-scroll">' + queue + '</div></div>' +
      '<div class="queue-block"><h3>' + closedTitle + '</h3><div class="queue-scroll closed-queue">' +
      (current.closed.length ? current.closed.map((id) => '<span class="tag mono">' + nodeLabel(id) + '</span>').join('') : '<p>等待展开。</p>') +
      '</div></div>' + (distances.length ? '<div class="queue-block"><h3>最短距离 <span class="mono">' + distances.length + '</span></h3>' +
        '<div class="queue-scroll">' + distances.sort((a, b) => a[1] - b[1]).map(([id, distance]) =>
          '<div class="queue-line"><span>' + nodeLabel(mode() === 'grid' ? Number(id) : id) + '</span><span class="mono">' +
          fmt(distance) + '</span></div>').join('') + '</div></div>' : '') + '</div>');
  }

  function renderFrame() {
    if (mode() === 'grid') renderGrid();
    else renderGraph();
    renderPlayback();
    renderSummary();
    renderInspector();
  }

  function render() {
    renderChrome();
    renderPresets();
    renderTools();
    renderEditor();
    renderFrame();
  }

  function goTo(index) {
    step = Math.min(trace.frames.length - 1, Math.max(0, index));
    if (last()) stop();
    renderFrame();
  }

  function play() {
    if (timer !== null) {
      stop();
      renderPlayback();
      return;
    }
    if (last()) step = 0;
    timer = setInterval(() => goTo(step + 1), 1000 / speed);
    renderFrame();
  }

  function editDone() {
    snapshot();
    recompute();
    render();
  }

  function tileAt(cell) {
    const map = board();
    if (tileTool === 'start' || tileTool === 'goal') {
      const other = tileTool === 'start' ? 'goal' : 'start';
      if (cell === map[other]) return false;
      if (cell === map[tileTool]) return false;
      map[tileTool] = cell;
      if (map.cells[cell] === 'wall') map.cells[cell] = 'plain';
    } else {
      if (cell === map.start || cell === map.goal || map.cells[cell] === tileTool) return false;
      map.cells[cell] = tileTool;
    }
    return true;
  }

  function graphPoint(svg, event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const result = point.matrixTransform(svg.getScreenCTM().inverse());
    return {
      x: Math.max(22, Math.min(P.width - 22, Math.round(result.x))),
      y: Math.max(22, Math.min(P.height - 22, Math.round(result.y)))
    };
  }

  function chooseGraphNode(id) {
    const map = board();
    if (graphTool === 'start' || graphTool === 'goal') {
      const other = graphTool === 'start' ? 'goal' : 'start';
      if (map[other] === id) {
        announce('起点和终点须为两个不同节点。', true);
        return;
      }
      map[graphTool] = id;
      editDone();
      return;
    }

    if (graphTool === 'edge') {
      if (!edgeFrom || edgeFrom === id) {
        edgeFrom = edgeFrom === id ? '' : id;
        renderEditor();
        renderGraph();
        return;
      }
      if (map.edges.length >= 80 || map.edges.some((edge) =>
        (edge.a === edgeFrom && edge.b === id) || (edge.b === edgeFrom && edge.a === id))) {
        announce('该边已存在，或已达到 80 条边。', true);
        return;
      }
      const nextId = nextEdgeId(map.edges);
      map.edges.push({id: nextId, a: edgeFrom, b: id, weight: 1});
      edgeFrom = '';
      selectedEdge = nextId;
      selectedNode = '';
      editDone();
      $('edge-weight').focus();
      return;
    }

    selectedNode = id;
    selectedEdge = '';
    renderEditor();
    renderGraph();
  }

  function nextEdgeId(edges) {
    const taken = new Set(edges.map((edge) => edge.id));
    let sequence = 1;
    while (taken.has('e' + sequence)) sequence += 1;
    return 'e' + sequence;
  }

  function chooseEdge(id) {
    selectedNode = '';
    selectedEdge = id;
    renderEditor();
    renderGraph();
  }

  function addNode(point) {
    const map = board();
    if (map.nodes.length >= 24) {
      announce('节点图最多支持 24 个顶点。', true);
      return;
    }
    const occupied = new Set(map.nodes.map((node) => node.id));
    let offset = 0;
    while (offset < 26 && occupied.has(String.fromCharCode(65 + offset))) offset += 1;
    const id = String.fromCharCode(65 + offset);
    map.nodes.push({id, ...point});
    selectedNode = id;
    selectedEdge = '';
    editDone();
  }

  function deleteGraphNode() {
    const map = board();
    if (map.nodes.length <= 2 || !selectedNode) return;
    const id = selectedNode;
    map.nodes = map.nodes.filter((node) => node.id !== id);
    map.edges = map.edges.filter((edge) => edge.a !== id && edge.b !== id);
    if (map.start === id) map.start = map.nodes.find((node) => node.id !== map.goal).id;
    if (map.goal === id) map.goal = map.nodes.find((node) => node.id !== map.start).id;
    resetSelection();
    editDone();
  }

  function updateGraphWeight(control) {
    const edge = board().edges.find((item) => item.id === selectedEdge);
    const weight = control.valueAsNumber;
    if (!edge) return;
    if (!Number.isFinite(weight) || weight < 0.01 || weight > 10000) {
      control.value = edge.weight;
      announce('边权须在 0.01 到 10000 之间。', true);
      return;
    }
    if (weight !== edge.weight) {
      edge.weight = weight;
      snapshot();
      recompute();
      renderComparisonIfVisible();
      renderFrame();
    }
  }

  function renderComparisonIfVisible() {
    if (page === 'compare') renderComparison();
  }

  function boardPointerDown(event) {
    if (event.button !== 0) return;
    const cell = event.target.closest('[data-cell]');
    if (cell) {
      event.preventDefault();
      stop();
      pointer = {kind: 'grid', id: event.pointerId, changed: false, last: Number(cell.dataset.cell)};
      pointer.changed = tileAt(pointer.last);
      if (pointer.changed) {
        recompute();
        renderFrame();
      }
      $('board').setPointerCapture(event.pointerId);
      return;
    }
    if (!editGraph) return;

    const svg = event.target.closest('.graph-map');
    if (!svg) return;
    const node = event.target.closest('[data-node]');
    const edge = event.target.closest('[data-edge]');
    if (graphTool === 'move' && node) {
      const id = node.dataset.node;
      selectedNode = id;
      selectedEdge = '';
      renderEditor();
      node.classList.add('is-selected');
      svg.querySelectorAll('[data-node].is-selected').forEach((item) => {
        if (item !== node) item.classList.remove('is-selected');
      });
      svg.querySelectorAll('[data-edge].is-selected').forEach((item) => item.classList.remove('is-selected'));
      pointer = {kind: 'node', id: event.pointerId, nodeId: id, last: graphPoint(svg, event), changed: false};
      $('board').setPointerCapture(event.pointerId);
      stop();
    } else if (node) chooseGraphNode(node.dataset.node);
    else if (graphTool === 'node' && !edge) addNode(graphPoint(svg, event));
    else if (edge && graphTool === 'move') chooseEdge(edge.dataset.edge);
  }

  function boardPointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (pointer.kind === 'grid') {
      const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]');
      if (!cell) return;
      const id = Number(cell.dataset.cell);
      if (pointer.last === id) return;
      pointer.last = id;
      if (tileTool === 'start' || tileTool === 'goal' || !tileAt(id)) return;
      pointer.changed = true;
      recompute();
      renderFrame();
    } else {
      const svg = $('board').querySelector('svg');
      const {x, y} = graphPoint(svg, event);
      if (!pointer.changed && Math.hypot(x - pointer.last.x, y - pointer.last.y) < 3) return;
      const item = board().nodes.find((node) => node.id === pointer.nodeId);
      item.x = x;
      item.y = y;
      pointer.changed = true;
      renderGraph();
    }
  }

  function boardPointerUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const finished = pointer;
    pointer = null;
    if (finished.changed) editDone();
    else renderPlayback();
  }

  function boardKey(event) {
    const cell = event.target.closest('[data-cell]');
    if (cell) {
      const id = Number(cell.dataset.cell);
      const {cols, rows} = board();
      const directions = {
        ArrowLeft: id % cols > 0 ? id - 1 : id,
        ArrowRight: id % cols < cols - 1 ? id + 1 : id,
        ArrowUp: id >= cols ? id - cols : id,
        ArrowDown: id < (rows - 1) * cols ? id + cols : id
      };
      if (Object.hasOwn(directions, event.key)) {
        event.preventDefault();
        const next = $('board').querySelector('[data-cell="' + directions[event.key] + '"]');
        cell.tabIndex = -1;
        next.tabIndex = 0;
        next.focus();
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (tileAt(id)) editDone();
      }
      return;
    }

    if (!editGraph || !['Enter', ' '].includes(event.key)) return;
    const node = event.target.closest('[data-node]');
    const edge = event.target.closest('[data-edge]');
    if (!node && !edge) return;
    event.preventDefault();
    if (node) chooseGraphNode(node.dataset.node);
    else chooseEdge(edge.dataset.edge);
    const updated = node ? '[data-node="' + node.dataset.node + '"]' : '[data-edge="' + edge.dataset.edge + '"]';
    if (document.activeElement === document.body) $('board').querySelector(updated)?.focus();
  }

  const clicks = {
    group(value) {
      if (group === value) return;
      group = value;
      type = pathType;
      algorithm = isTree() ? 'prim' : 'astar';
      editGraph = false;
      resetSelection();
      recompute();
      render();
    },
    mode(value) {
      if (type === value) return;
      type = pathType = value;
      editGraph = false;
      resetSelection();
      recompute();
      render();
    },
    algorithm(value) {
      stop();
      algorithm = value;
      trace = comparisons.find((item) => item.name === value).trace;
      step = 0;
      render();
      $('compare-results').querySelector('[data-value="' + value + '"]').focus({preventScroll: true});
    },
    random() { changeBoard(P.randomBoard(mode())); },
    'presets-dialog'() { showPresets(); },
    'new-preset'() {
      $('dialog-name').required = true;
      askName('新增空白预设', '名称', mode() === 'grid' ? '新网格' : '新节点图',
        (name) => { customPreset(name, P.newBoard(mode())); announce('已新增预设。'); });
    },
    'duplicate-preset'() {
      $('dialog-name').required = true;
      const original = allPresets().find((item) => item.id === active().id)?.name ?? '当前草图';
      askName('复制当前地图', '副本名称', original.slice(0, 35) + ' 副本',
        (name) => { customPreset(name, board()); announce('已复制预设。'); });
    },
    'rename-preset'() {
      $('dialog-name').required = true;
      const original = saved.presets.find((item) => item.id === active().id);
      askName('重命名预设', '新名称', original.name,
        (name) => { original.name = name; save(); renderPresets(); announce('已重命名预设。'); });
    },
    'delete-preset'() { removePreset(); },
    'import-preset'() { $('import-file').click(); },
    'export-preset'() { exportPreset(); },
    'tile-tool'(value) { tileTool = value; renderTools(); },
    'edit-graph'() {
      stop();
      editGraph = !editGraph;
      graphTool = 'move';
      resetSelection();
      renderTools();
      renderEditor();
      renderFrame();
    },
    'graph-tool'(value) {
      graphTool = value;
      resetSelection();
      renderTools();
      renderEditor();
      renderGraph();
    },
    'delete-node'() { deleteGraphNode(); },
    'delete-edge'() {
      const map = board();
      map.edges = map.edges.filter((edge) => edge.id !== selectedEdge);
      resetSelection();
      editDone();
    },
    reset() { stop(); goTo(0); },
    previous() { stop(); goTo(step - 1); },
    next() { stop(); goTo(step + 1); },
    last() { stop(); goTo(trace.frames.length - 1); },
    play
  };

  function readImport(control) {
    const file = control.files[0];
    control.value = '';
    if (!file) return;
    if (file.size > 256 * 1024) {
      announce('预设 JSON 大小超过 256 KB。', true);
      return;
    }
    file.text().then((text) => {
      const {name, board: imported} = P.decode(text);
      if (isTree() && imported.type === 'grid') {
        group = 'paths';
        algorithm = 'astar';
      }
      if (!isTree()) type = pathType = imported.type;
      editGraph = false;
      customPreset(name, imported);
      announce('已导入「' + name + '」。');
    }).catch((error) => {
      announce(error instanceof SyntaxError ? '文件不是可读取的 JSON。' : error.message, true);
    });
  }

  function switchPage(next) {
    const target = next === 'compare' ? '#compare' : '#lab';
    if (location.hash !== target) history.pushState(null, '', target);
    if (page !== next) setPage(next);
  }

  function wire() {
    for (const [id, value] of [['nav-lab', 'lab'], ['nav-compare', 'compare']]) {
      $(id).addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        switchPage(value);
      });
    }
    window.addEventListener('hashchange', () => {
      const target = location.hash === '#compare' ? 'compare' : 'lab';
      if (target !== page) setPage(target);
    });
    const boardElement = $('board');
    boardElement.addEventListener('pointerdown', boardPointerDown);
    boardElement.addEventListener('pointermove', boardPointerMove);
    boardElement.addEventListener('pointerup', boardPointerUp);
    boardElement.addEventListener('pointercancel', boardPointerUp);
    boardElement.addEventListener('keydown', boardKey);
    $('dialog-name').addEventListener('input', () => $('dialog-name').setCustomValidity(''));
    $('dialog-cancel').addEventListener('click', () => $('preset-dialog').close());
    $('preset-manager-close').addEventListener('click', () => $('preset-manager').close());

    document.addEventListener('click', (event) => {
      const control = event.target.closest('[data-action]');
      if (!control || control.disabled) return;
      if (control.closest('#preset-manager')) $('preset-manager').close();
      clicks[control.dataset.action]?.(control.dataset.value);
    });

    document.addEventListener('change', ({target}) => {
      if (target.id === 'preset-choice') {
        const chosen = allPresets().find((entry) => entry.id === target.value);
        if (chosen) changeBoard(chosen.board, chosen.id);
      }
      if (target.id === 'heuristic-choice') {
        heuristics[mode()] = target.value;
        recompute();
        renderComparisonIfVisible();
        renderFrame();
      }
      if (target.id === 'speed-choice') {
        speed = Number(target.value);
        if (timer !== null) { stop(); play(); }
      }
      if (target.id === 'edge-weight') updateGraphWeight(target);
      if (target.id === 'import-file') readImport(target);
    });

    $('board').addEventListener('click', (event) => {
      const cell = event.target.closest('[data-cell]');
      if (!cell || event.detail !== 0) return;
      if (tileAt(Number(cell.dataset.cell))) editDone();
    });

    document.addEventListener('input', ({target}) => {
      if (target.id === 'timeline') { stop(); goTo(Number(target.value)); }
    });

    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || document.querySelector('dialog[open]') ||
          event.target.closest('button,input,select,textarea,a,[contenteditable]')) return;
      const key = {' ': 'play', ArrowLeft: 'previous', ArrowRight: 'next', End: 'last', r: 'reset', R: 'reset'}[event.key];
      if (!key) return;
      event.preventDefault();
      clicks[key]();
    });
  }

  wire();
  recompute();
  render();
})();
