(function (root) {
  'use strict';

  const cols = 20;
  const rows = 12;
  const width = 720;
  const height = 400;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const at = (col, row) => row * cols + col;
  const validTypes = new Set(['plain', 'wall', 'mud']);
  const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(id);

  function grid(start = [2, 5], goal = [17, 5]) {
    return { type: 'grid', cols, rows, start: at(...start), goal: at(...goal), cells: Array(cols * rows).fill('plain') };
  }

  function setTiles(board, type, positions) {
    for (const [x, y] of positions) board.cells[at(x, y)] = type;
  }

  const terrain = grid();
  setTiles(terrain, 'mud', [[7,5],[8,5],[9,5],[10,5],[7,6],[8,6],[9,6],[10,6],[11,6],[8,7],[9,7]]);
  setTiles(terrain, 'wall', [[4,1],[4,2],[4,3],[4,7],[4,8],[4,9],[5,9],[6,9],[12,1],[12,2],[12,3],[13,3],[14,3],[15,3],[15,7],[15,8],[15,9],[16,9],[17,9]]);

  const trap = grid([2, 5], [15, 5]);
  setTiles(trap, 'wall', [
    ...Array.from({length: 9}, (_, i) => [12, i + 1]),
    ...Array.from({length: 5}, (_, i) => [i + 7, 1]),
    ...Array.from({length: 5}, (_, i) => [i + 7, 9]),
    [16,2], [16,3], [17,8], [18,8]
  ]);

  function graph(nodes, edges, start, goal) {
    return {
      type: 'graph', start, goal,
      nodes: nodes.map(([id, x, y]) => ({id, x, y})),
      edges: edges.map(([a, b, weight], i) => ({id: 'e' + (i + 1), a, b, weight}))
    };
  }

  const weighted = graph([
    ['A',80,202], ['B',203,85], ['C',209,310], ['D',350,171],
    ['E',374,324], ['F',498,76], ['G',529,272], ['H',646,169]
  ], [
    ['A','B',3], ['A','C',4], ['B','C',3], ['B','D',5], ['B','F',11],
    ['C','D',2], ['C','E',4], ['D','E',2], ['D','F',4], ['D','G',7],
    ['E','G',3], ['F','G',5], ['F','H',4], ['G','H',3]
  ], 'A', 'H');

  const islands = graph([
    ['A',105,94], ['B',244,76], ['C',148,277], ['D',281,246],
    ['E',470,109], ['F',621,103], ['G',552,284]
  ], [
    ['A','B',3], ['A','C',2], ['B','C',6], ['B','D',4], ['C','D',1],
    ['E','F',2], ['F','G',3], ['E','G',4]
  ], 'A', 'G');

  const builtins = [
    { id: 'terrain', name: '泥地捷径', board: terrain },
    { id: 'trap', name: 'U 形陷阱', board: trap },
    { id: 'empty', name: '空地', board: grid() },
    { id: 'weighted', name: '加权路网', board: weighted },
    { id: 'islands', name: '两座岛', board: islands }
  ];

  function newBoard(type) {
    if (type === 'grid') return grid();
    return graph([['A', 166, 200], ['B', 551, 200]], [], 'A', 'B');
  }

  function randomBoard(type) {
    if (type === 'grid') {
      const board = grid();
      for (let i = 0; i < board.cells.length; i += 1) {
        if (i === board.start || i === board.goal) continue;
        const draw = Math.random();
        board.cells[i] = draw < 0.18 ? 'wall' : draw < 0.32 ? 'mud' : 'plain';
      }
      return board;
    }

    const nodes = Array.from({length: 9}, (_, i) => [
      String.fromCharCode(65 + i),
      125 + (i % 3) * 236 + Math.round(Math.random() * 70 - 35),
      63 + Math.floor(i / 3) * 138 + Math.round(Math.random() * 42 - 21)
    ]);
    const edges = [];
    const weight = () => 1 + Math.floor(Math.random() * 15);
    for (let i = 0; i < nodes.length; i += 1) {
      const [id] = nodes[i];
      if (i % 3 !== 2) edges.push([id, nodes[i + 1][0], weight()]);
      if (i < 6 && (i % 3 === 1 || Math.random() > 0.35)) edges.push([id, nodes[i + 3][0], weight()]);
      if (i < 6 && i % 3 !== 2 && Math.random() > 0.4) edges.push([id, nodes[i + 4][0], weight()]);
    }
    return graph(nodes, edges, 'A', 'I');
  }

  function readBoard(data) {
    if (data?.type === 'grid') {
      const {cells, start, goal} = data;
      const isTile = (id) => Number.isInteger(id) && id >= 0 && id < cols * rows && cells[id] !== 'wall';
      if (data.cols !== cols || data.rows !== rows || !Array.isArray(cells) ||
          cells.length !== cols * rows || !cells.every((cell) => validTypes.has(cell)) ||
          !isTile(start) || !isTile(goal) || start === goal) throw new Error('网格尺寸、地形或起终点无效。');
      return {type: 'grid', cols, rows, cells: [...cells], start, goal};
    }

    if (data?.type !== 'graph' || !Array.isArray(data.nodes) || !Array.isArray(data.edges) ||
        data.nodes.length < 2 || data.nodes.length > 24 || data.edges.length > 80) {
      throw new Error('节点图应有 2–24 个节点，最多 80 条边。');
    }

    const nodes = new Map();
    for (const node of data.nodes) {
      const {id, x, y} = node ?? {};
      if (!validId(id) || nodes.has(id) || !Number.isFinite(x) || !Number.isFinite(y) ||
          x < 22 || x > width - 22 || y < 22 || y > height - 22) throw new Error('节点编号或坐标无效。');
      nodes.set(id, {id, x, y});
    }

    const edges = new Map();
    const pairs = new Set();
    for (const edge of data.edges) {
      const {id, a, b, weight} = edge ?? {};
      if (!validId(id) || edges.has(id) || !nodes.has(a) || !nodes.has(b) || a === b ||
          !Number.isFinite(weight) || weight < 0.01 || weight > 10000) throw new Error('边或边权无效。');
      const pair = [a, b].sort().join('/');
      if (pairs.has(pair)) throw new Error('同一对节点只能有一条无向边。');
      pairs.add(pair);
      edges.set(id, {id, a, b, weight});
    }

    if (!nodes.has(data.start) || !nodes.has(data.goal) || data.start === data.goal) throw new Error('请选择两个不同的起终点。');
    return {type: 'graph', nodes: [...nodes.values()], edges: [...edges.values()], start: data.start, goal: data.goal};
  }

  function readName(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name.length > 40) throw new Error('预设名称须为 1–40 个字符。');
    return name;
  }

  function decode(text) {
    const data = JSON.parse(text);
    if (data?.version !== 1) throw new Error('请选择版本为 1 的预设 JSON。');
    return {name: readName(data.name), board: readBoard(data.board)};
  }

  const api = { at, width, height, clone, builtins, newBoard, randomBoard, readName, readBoard, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphPresets = api;
})(globalThis);
