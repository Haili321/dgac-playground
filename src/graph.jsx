// DGAC demo graphs: two variants
// - "hetero": Texas/Wisc style — cross-cluster edges common (low homophily)
// - "homo":  Cora-style — mostly intra-cluster edges (high homophily)
// Both use the SAME 20 nodes / 4 clusters / attribute positions,
// only the edge set differs → demonstrates that DGAC handles both.

function buildGraph(mode){
  const clusters = [
    { color: "oklch(0.62 0.14 25)",  label: "C1", cx: 0.22, cy: 0.28 },
    { color: "oklch(0.62 0.14 160)", label: "C2", cx: 0.78, cy: 0.28 },
    { color: "oklch(0.62 0.14 260)", label: "C3", cx: 0.22, cy: 0.78 },
    { color: "oklch(0.62 0.14 90)",  label: "C4", cx: 0.78, cy: 0.78 },
  ];
  const nodes = [];
  const jitter = [
    [-0.09,-0.06],[0.07,-0.08],[0.08,0.07],[-0.06,0.09],[0.00,-0.02],
    [-0.08,-0.05],[0.08,-0.06],[0.06,0.08],[-0.07,0.07],[0.01,0.00],
    [-0.07,-0.07],[0.08,-0.07],[0.06,0.08],[-0.08,0.06],[0.00,0.01],
    [-0.08,-0.04],[0.07,-0.08],[0.07,0.07],[-0.07,0.08],[0.00,-0.01],
  ];
  for (let c=0;c<4;c++){
    for (let i=0;i<5;i++){
      const idx = c*5+i;
      nodes.push({
        id: idx, cluster: c, color: clusters[c].color,
        ax: clusters[c].cx + jitter[idx][0]*0.6,
        ay: clusters[c].cy + jitter[idx][1]*0.6,
      });
    }
  }

  // HETERO: many cross edges
  const heteroEdges = [
    [0,1],[1,2],[2,3],[3,4],[0,2],[1,4],
    [5,6],[6,7],[7,8],[8,9],[5,7],
    [10,11],[11,12],[12,13],[13,14],[10,12],[11,14],
    [15,16],[16,17],[17,18],[18,19],[15,19],[16,18],
    [0,5],[2,7],[4,10],[3,15],[6,11],[9,14],[8,16],
    [12,17],[13,18],[5,15],[1,10],[7,19],
  ];
  // HOMO: few cross edges, denser intra
  const homoEdges = [
    [0,1],[1,2],[2,3],[3,4],[0,2],[1,4],[0,3],[2,4],
    [5,6],[6,7],[7,8],[8,9],[5,7],[5,9],[6,8],[7,9],
    [10,11],[11,12],[12,13],[13,14],[10,12],[11,14],[10,13],[12,14],
    [15,16],[16,17],[17,18],[18,19],[15,19],[16,18],[15,17],[17,19],
    // just a few bridges
    [4,5],[9,10],[14,15],
  ];
  const edgeList = mode==="homo" ? homoEdges : heteroEdges;

  const pos = nodes.map(n => ({ x: clusters[n.cluster].cx, y: clusters[n.cluster].cy }));
  nodes.forEach((n, i) => {
    pos[i].x += jitter[i][0]; pos[i].y += jitter[i][1];
  });
  for (let iter=0; iter<12; iter++){
    edgeList.forEach(([a,b]) => {
      const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
      pos[a].x += dx*0.02; pos[a].y += dy*0.02;
      pos[b].x -= dx*0.02; pos[b].y -= dy*0.02;
    });
  }
  nodes.forEach((n, i) => {
    n.tx = Math.max(0.06, Math.min(0.94, pos[i].x));
    n.ty = Math.max(0.08, Math.min(0.92, pos[i].y));
  });
  const N = nodes.length;
  // homophily ratio
  const sameCount = edgeList.filter(([a,b])=>nodes[a].cluster===nodes[b].cluster).length;
  const homoRatio = sameCount / edgeList.length;

  return { nodes, edges: edgeList, clusters, N, homoRatio, mode };
}

const DEMO_GRAPHS = {
  hetero: buildGraph("hetero"),
  homo:   buildGraph("homo"),
};

function initialKmeans(nodes, mode){
  // hetero: more misassignments if relying on topology alone
  const miss = mode==="homo"
    ? new Set([7, 15])                // few errors
    : new Set([2, 7, 13, 15, 1, 18]); // more errors
  return nodes.map((n,i) => ({
    pred: miss.has(i) ? (n.cluster + 1) % 4 : n.cluster,
    correct: !miss.has(i),
  }));
}

window.DEMO_GRAPHS = DEMO_GRAPHS;
window.initialKmeans = initialKmeans;
