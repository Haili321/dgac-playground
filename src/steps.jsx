// Step definitions — the narrative backbone of the playground.
// Each step knows which pipeline elements are "active" (highlighted),
// which formula block to highlight, and what's shown on the graph.

const STEPS = [
  {
    id: "input",
    title: "输入",
    subtitle: "节点特征 X 与邻接矩阵 A",
    active: ["input-x", "input-a"],
    formula: "input",
    desc: "DGAC 处理带属性的图 G=(A, X)。不同于传统 GNN，它不需要标签就能聚类，并在同质 (Cora) 与异质 (Texas / Wisc) 图上都能稳定工作。",
  },
  {
    id: "encode",
    title: "输入编码",
    subtitle: "SVD / MLP 低秩编码",
    active: ["input-x", "input-a", "s-enc", "a-enc"],
    formula: "encode",
    desc: "两条分支分别用 SVD 或 MLP 把邻接相关矩阵 (A_norm) 和属性相似矩阵 (S_norm = X̂ X̂ᵀ) 压到低维，得到 H₀ᵗ 和 H₀ᵃ，作为两条扩散链的初值。",
  },
  {
    id: "topology",
    title: "拓扑分支扩散",
    subtitle: "Hᵗ ← α · Â · Hᵗ + H₀ᵗ  (迭代 L 次)",
    active: ["s-enc", "top-diff"],
    formula: "topology",
    desc: "拓扑分支沿归一化邻接矩阵 Â 做 L 步 APPNP 风格扩散：每一步都把当前表示在邻居上做加权平均，再加一个与初值 H₀ 的残差项，得到 Hᵗ。",
  },
  {
    id: "attribute",
    title: "属性分支扩散",
    subtitle: "Hᵃ ← α · Ŝ · Hᵃ + H₀ᵃ  (迭代 L 次)",
    active: ["a-enc", "attr-diff"],
    formula: "attribute",
    desc: "属性分支沿 属性相似图 Ŝ 做相同形式的扩散。Ŝ = X̂ X̂ᵀ 把特征接近的节点视作“邻居”，哪怕它们在原图里没有连边 —— 这就是对异质图友好的关键。",
  },
  {
    id: "fusion",
    title: "双分支融合",
    subtitle: "H = β·Hᵗ + (1-β)·Hᵃ",
    active: ["top-diff", "attr-diff", "fusion"],
    formula: "fusion",
    desc: "两条分支都走完后，用可调权重 β 线性融合 (或 concat / max)。β 靠近 1 更信任拓扑，靠近 0 更信任属性。异质图通常需要更小的 β。",
  },
  {
    id: "kmeans",
    title: "K-means 初分配",
    subtitle: "在 H 上做 k-means 得 C₀",
    active: ["fusion", "kmeans"],
    formula: "kmeans",
    desc: "对融合表示 H 做一次余弦 k-means，得到硬分配矩阵 C₀ ∈ {0,1}ᴺˣᴷ。这是一次“粗糙”的分配，可能有不少节点被分错。",
  },
  {
    id: "cprop",
    title: "簇分配扩散 (C-prop)",
    subtitle: "C ← α · Â · C + C₀  (迭代 Lc 次)",
    active: ["kmeans", "cprop"],
    formula: "cprop",
    desc: "DGAC 的点睛之笔：把硬分配 C₀ 也放回图上扩散 —— 错误分配的节点被邻居“纠正”，形成软分配 C。这一步不需要任何梯度，靠扩散本身平滑。",
  },
  {
    id: "loss",
    title: "自监督目标",
    subtitle: "L = L_cont + L_cluster + L_recons",
    active: ["fusion", "cprop", "loss"],
    formula: "loss",
    desc: "论文 Section 5.3 的三项顶层损失：(1) L_cont — 分层对比，三粒度（节点/邻居/簇）一致性 + 去相关 L_dec；(2) L_cluster — InfoNCE 式簇心对比；(3) L_recons — Scaled Cosine Error，H 与 X̂ 对齐。无需标签。",
  },
  {
    id: "output",
    title: "输出聚类",
    subtitle: "argmax(C)",
    active: ["cprop", "output"],
    formula: "output",
    desc: "训练收敛后，argmax(C) 就是最终聚类结果。在 Cora / Citeseer / Texas / Wisc 等 12 个图数据集上，DGAC 在 ACC / NMI / ARI / F1 四项指标上都达到 SOTA。",
  },
];

window.STEPS = STEPS;
