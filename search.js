(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GraphSearch = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const TERRAIN_COST = { plain: 1, mud: 5, sand: 3, water: 8 };
  function prepare(board) {
    if (!board || !['grid', 'graph'].includes(board.type)) throw new Error('未知地图类型');
    const ids = [], positions = new Map(), adjacency = new Map();
    let edges = [], scale = 1;
    if (board.type === 'grid') {
      const { cols, rows, cells } = board;
      if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || !Array.isArray(cells) || cells.length !== cols * rows) throw new Error('网格尺寸不正确');
      for (let id = 0; id < cells.length; id++) {
        if (cells[id] === 'wall') continue;
        ids.push(id); positions.set(id, { x: id % cols, y: Math.floor(id / cols) }); adjacency.set(id, []);
      }
      for (const id of ids) {
        const { x, y } = positions.get(id);
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const nx = x + dx, ny = y + dy, next = ny * cols + nx;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !adjacency.has(next)) continue;
          adjacency.get(id).push({ id: next, weight: TERRAIN_COST[cells[next]] || 1 });
        }
      }
    } else {
      if (!Array.isArray(board.nodes) || !Array.isArray(board.edges)) throw new Error('图数据不正确');
      for (const node of board.nodes) {
        if (typeof node.id !== 'string' || adjacency.has(node.id) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new Error('节点 ID 必须唯一且坐标有效');
        ids.push(node.id); positions.set(node.id, node); adjacency.set(node.id, []);
      }
      const edgeIds = new Set();
      scale = Infinity;
      edges = board.edges.map((edge) => {
        if (typeof edge.id !== 'string' || edgeIds.has(edge.id) || !adjacency.has(edge.a) || !adjacency.has(edge.b) || !Number.isFinite(edge.weight) || edge.weight < 0) throw new Error('边 ID、端点或权重不正确');
        edgeIds.add(edge.id);
        adjacency.get(edge.a).push({ id: edge.b, weight: edge.weight, edge: edge.id });
        adjacency.get(edge.b).push({ id: edge.a, weight: edge.weight, edge: edge.id });
        const a = positions.get(edge.a), b = positions.get(edge.b), length = Math.hypot(a.x - b.x, a.y - b.y);
        if (length > 0) scale = Math.min(scale, edge.weight / length);
        return { ...edge };
      });
      if (!Number.isFinite(scale)) scale = 0;
    }
    return { ids, positions, adjacency, edges, scale };
  }
  function search(board, algorithm = 'astar', heuristic = 'manhattan') {
    if (!['astar', 'bfs', 'dfs', 'ucs', 'dijkstra', 'greedy'].includes(algorithm)) throw new Error('未知搜索算法');
    if (!['manhattan', 'euclidean', 'zero', 'over'].includes(heuristic)) throw new Error('未知启发函数');
    const model = prepare(board), { adjacency, positions } = model;
    if (!adjacency.has(board.start) || !adjacency.has(board.goal)) throw new Error('起点和终点必须是可访问节点');
    const h = (id) => {
      if (heuristic === 'zero' || (algorithm !== 'astar' && algorithm !== 'greedy')) return 0;
      const p = positions.get(id), q = positions.get(board.goal), dx = Math.abs(p.x - q.x), dy = Math.abs(p.y - q.y);
      const distance = board.type === 'graph' || heuristic === 'euclidean' ? Math.hypot(dx, dy) : dx + dy;
      return distance * model.scale * (heuristic === 'over' ? 5 : 1);
    };
    const distance = new Map([[board.start, 0]]), parent = new Map(), closed = new Set(), frontier = [board.start], inOpen = new Set(frontier), frames = [];
    let expanded = 0, found = false, serial = 0;
    const order = new Map([[board.start, serial++]]);
    const entry = (id) => ({ id, g: distance.get(id), h: h(id), f: distance.get(id) + h(id) });
    const score = (id) => algorithm === 'greedy' ? h(id) : algorithm === 'astar' ? distance.get(id) + h(id) : distance.get(id);
    const sortedOpen = () => {
      const items = frontier.slice();
      if (algorithm === 'dfs') items.reverse();
      else if (!['bfs'].includes(algorithm)) items.sort((a, b) => score(a) - score(b) || order.get(a) - order.get(b));
      return items.map(entry);
    };
    const emit = (kind, current, changes, message, path) => {
      const frame = { kind, current, open: sortedOpen(), closed: Array.from(closed), changes, message, expanded, step: expanded };
      if (path) frame.path = path.slice();
      frames.push(frame);
    };
    emit('initial', null, [{ ...entry(board.start), parent: null, status: 'open' }], '起点加入待探索集合');
    while (frontier.length) {
      let index = algorithm === 'dfs' ? frontier.length - 1 : 0;
      if (!['bfs', 'dfs'].includes(algorithm)) {
        for (let i = 1; i < frontier.length; i++) if (score(frontier[i]) < score(frontier[index]) || (score(frontier[i]) === score(frontier[index]) && order.get(frontier[i]) < order.get(frontier[index]))) index = i;
      }
      const current = frontier.splice(index, 1)[0];
      inOpen.delete(current); closed.add(current); expanded++;
      const changes = [{ ...entry(current), parent: parent.get(current) ?? null, status: 'closed' }];
      if (current === board.goal) found = true;
      if (current !== board.goal || algorithm === 'dijkstra') {
        let neighbors = adjacency.get(current);
        if (algorithm === 'dfs') neighbors = neighbors.slice().reverse();
        for (const neighbor of neighbors) {
          const candidate = distance.get(current) + neighbor.weight;
          const discovered = distance.has(neighbor.id);
          const weighted = !['bfs', 'dfs', 'greedy'].includes(algorithm);
          if (discovered && (!weighted || candidate >= distance.get(neighbor.id))) continue;
          distance.set(neighbor.id, candidate); parent.set(neighbor.id, current);
          if (closed.has(neighbor.id)) closed.delete(neighbor.id);
          if (!inOpen.has(neighbor.id)) { frontier.push(neighbor.id); inOpen.add(neighbor.id); order.set(neighbor.id, serial++); }
          changes.push({ ...entry(neighbor.id), parent: current, status: 'open' });
        }
      }
      emit('expand', current, changes, current === board.goal ? (algorithm === 'dijkstra' ? '已确定终点距离，继续计算全部可达节点' : '到达终点') : '展开节点，更新待探索集合');
      if (found && algorithm !== 'dijkstra') break;
    }
    const path = [];
    if (found) {
      let cursor = board.goal;
      while (cursor !== undefined) { path.push(cursor); cursor = parent.get(cursor); }
      path.reverse();
    }
    const distances = Object.fromEntries(distance);
    const result = { found, path, cost: found ? distance.get(board.goal) : Infinity, steps: found ? path.length - 1 : null, expanded, distances };
    emit('done', null, [], found ? '搜索完成，已还原路径' : '搜索完成，终点不可达', path);
    return { frames, result };
  }
  function mst(board, algorithm = 'prim') {
    if (board.type !== 'graph') throw new Error('最小生成树需要图地图');
    if (!['prim', 'kruskal'].includes(algorithm)) throw new Error('未知最小生成树算法');
    const { ids, edges } = prepare(board), frames = [], selected = [], representative = new Map(ids.map(id => [id, id]));
    let components = ids.length, cost = 0;
    const find = id => { let cursor = id; while (representative.get(cursor) !== cursor) cursor = representative.get(cursor); while (id !== cursor) { const next = representative.get(id); representative.set(id, cursor); id = next; } return cursor; };
    const emit = (kind, edge, message, extra = {}) => frames.push({ kind, currentEdge: edge ? edge.id : null, selected: selected.slice(), components, cost, message, ...extra });
    const accept = edge => { representative.set(find(edge.a), find(edge.b)); selected.push(edge.id); components--; cost += edge.weight; };
    const ordered = edges.map((edge, index) => ({ ...edge, index })).sort((a, b) => a.weight - b.weight || a.index - b.index);
    emit('initial', null, '初始化最小生成森林');
    if (algorithm === 'kruskal') {
      for (const edge of ordered) {
        const rejected = find(edge.a) === find(edge.b);
        if (!rejected) accept(edge);
        emit('edge', edge, rejected ? '拒绝此边：加入后会形成环' : '选择最轻的跨分量边', { rejected });
      }
    } else {
      const visited = new Set();
      const roots = ids.slice();
      if (roots.includes(board.start)) { roots.splice(roots.indexOf(board.start), 1); roots.unshift(board.start); }
      for (const root of roots) {
        if (visited.has(root)) continue;
        visited.add(root);
        emit('component', null, '从节点 ' + root + ' 开始新的连通分量', { componentRoot: root, visited: Array.from(visited) });
        while (true) {
          const edge = ordered.find(edge => visited.has(edge.a) !== visited.has(edge.b));
          if (!edge) break;
          accept(edge); visited.add(edge.a); visited.add(edge.b);
          emit('edge', edge, '选择连接当前树与未访问节点的最轻边', { rejected: false, visited: Array.from(visited) });
        }
      }
    }
    emit('done', null, components <= 1 ? '最小生成树构建完成' : '图不连通，最小生成森林构建完成');
    return { frames, result: { selected: selected.slice(), cost, components } };
  }
  function metrics(trace) {
    const { frames, result } = trace;
    return { steps: result.steps ?? frames.filter(frame => frame.kind === 'edge').length, expanded: result.expanded ?? 0, pathLength: result.path ? Math.max(0, result.path.length - 1) : 0, cost: result.cost, found: result.found, maxOpen: frames.reduce((max, frame) => Math.max(max, frame.open ? frame.open.length : 0), 0), frameCount: frames.length };
  }
  return { search, mst, metrics, TERRAIN_COST };
});
