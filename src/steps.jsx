// Step definitions — the narrative backbone of the playground.
// Each step knows which pipeline elements are "active" (highlighted),
// which formula block to highlight, and what's shown on the graph.

const STEPS = [
  {
    id: "input",
    title: "输入",
    subtitle: "带属性图 G = (V, E, X)",
    active: ["input-x", "input-a"],
    formula: "input",
    desc: "**论文 Sec. 3.1** — DGAC 处理带属性的图 G = (V, E, X)，其中 V 是 n 个节点的集合，E 是 m 条边，X ∈ ℝⁿˣᶠ 是属性矩阵（第 i 行 Xᵢ 是节点 vᵢ 的属性）。邻接矩阵 A 从 E 导出（Aᵢⱼ = 1 当且仅当 (vᵢ, vⱼ) ∈ E）。不同于传统 GNN，DGAC 不需要标签就能聚类，并在同质（Cora）与异质（Texas / Wisconsin）图上都稳定工作。",
  },
  {
    id: "encode",
    title: "输入编码",
    subtitle: "交叉模态初值：U = SVD_d(X̄)，B = eig_d(Â)",
    active: ["input-x", "input-a", "s-enc", "a-enc"],
    formula: "encode",
    desc: "**论文 Eq.12-13 / Lemma 3** — DGAC 的交叉模态设计：拓扑分支的初值 H₀ᵗ = U 来自**属性侧**（X̄ = diag(d)⁻¹ᐟ²·X 的 SVD），属性分支的初值 H₀ᵃ = B 来自**拓扑侧**（Â 的前 d 个特征向量）。两个初值把对侧的结构信息注入本分支，再各自扩散。",
  },
  {
    id: "topology",
    title: "拓扑分支扩散",
    subtitle: "Hᵗ ← α · Â · Hᵗ + H₀ᵗ  (迭代 L 次)",
    active: ["s-enc", "top-diff"],
    formula: "topology",
    desc: "**论文 Eq.12** — 拓扑分支沿归一化邻接 Â 做 L 步 APPNP 风格扩散：每一步把当前表示在邻居上做加权平均，再加一个与初值 H₀ᵗ = U 的残差项。展开得闭式 Hᵗ = Σ αℓ Âℓ U。",
  },
  {
    id: "attribute",
    title: "属性分支扩散",
    subtitle: "Hᵃ ← α · Ŝ · Hᵃ + H₀ᵃ  (迭代 L 次)",
    active: ["a-enc", "attr-diff"],
    formula: "attribute",
    desc: "**论文 Eq.13** — 属性分支沿属性相似图 Ŝ 做同形式的扩散，初值是来自拓扑侧的 B。Ŝ = X̂·X̂ᵀ 把特征接近的节点视作「虚拟邻居」，哪怕它们在原图 A 中无边 —— 这是对异质图友好的关键。",
  },
  {
    id: "fusion",
    title: "双分支融合",
    subtitle: "Z = H·W (线性变换) → H = β·Zᵗ + (1-β)·Zᵃ → L2 归一化",
    active: ["top-diff", "attr-diff", "fusion"],
    formula: "fusion",
    desc: "**论文 Eq.14** — 先分别做线性变换 Zᵗ=Hᵗ·Wᵗ、Zᵃ=Hᵃ·Wᵃ（Wᵗ/Wᵃ 可学习），再用可调权重 β 线性融合，最后每行 L2 归一化 ‖H_i‖=1。β 靠近 1 更信任拓扑，靠近 0 更信任属性；异质图通常需要更小的 β。",
  },
  {
    id: "kmeans",
    title: "K-means 初分配",
    subtitle: "在 H 上做余弦 k-means 得 C₀",
    active: ["fusion", "kmeans"],
    formula: "kmeans",
    desc: "**论文 Sec. 5.2** — 对融合表示 H 做一次余弦 k-means，得到硬分配矩阵 C₀ ∈ {0,1}ᴺˣᴷ。这是一次「粗糙」的分配，可能有不少节点被分错 —— 下一步的 C-prop 会用邻居投票纠错。",
  },
  {
    id: "cprop",
    title: "簇分配扩散 (C-prop)",
    subtitle: "C ← γ · Â · C + C₀  (迭代 Lc 次，论文 Eq.16)",
    active: ["kmeans", "cprop"],
    formula: "cprop",
    desc: "DGAC 的点睛之笔：把硬分配 C₀ 也放回图上扩散 —— 错误分配的节点被邻居「纠正」，形成软分配 C。不需要梯度，靠扩散本身平滑。系数是 γ，与分支扩散的 α 区分开（playground toy 实现共用一个滑块）。",
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
