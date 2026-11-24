# 图搜索实验室

《人工智能导论》图搜索算法交互作业。打开后进入 A* 实验台，可逐步查看当前节点的 `g`、`h`、`f` 和 Open、Closed 集合。选择「算法对比」，在同一地图上观察路径搜索与最小生成树的过程和结果。

- [在线演示](https://luxiaoyu7548.github.io/graph-search-playground/)
- [图文实验报告](docs/report.md)

## 运行

解压项目后，使用当前版本的 Chrome、Edge 或 Firefox 打开 `index.html`。页面所需文件都在仓库中，不用安装依赖。若浏览器限制本地文件的存储权限，可导出 JSON，或在根目录运行 `python -m http.server 8000` 后访问 [本机实验台](http://localhost:8000/)。

## 做三个实验

1. 在「泥地捷径」地图用曼哈顿距离运行 A*，再改用「5 倍曼哈顿」重算。比较路径步数、总代价和展开次数。
2. 点击「算法对比」，用同一地图查看 A*、BFS、DFS、UCS、贪心最佳优先和 Dijkstra。Dijkstra 会继续计算所有可达节点的最短距离。
3. 切到「最小生成树」，选「两座岛」，分别用 Prim 和 Kruskal 回放。结果包含两个连通分量的最小生成森林。

在「管理预设」里新增、复制、重命名、删除或导入导出预设。网格可拖画地形和更换起终点。节点图进入编辑后可新增、移动、删除节点，连接、删除边或修改正数权重。预设保存在当前浏览器。

## 验证

```sh
node --test tests/search.test.cjs
```

页面用原生 HTML、CSS 和 JavaScript 实现。算法核心、预设读写及交互分别位于 `search.js`、`presets.js`、`app.js`。项目恢复与协作说明见 [AGENTS.md](AGENTS.md)。
