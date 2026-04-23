// Formula panel — KaTeX math + rich click-to-explain popovers.

const { useState: useStateF, useRef: useRefF, useEffect: useEffectF } = React;

// Each entry:  tex  — small chip + popover header
//              name — bilingual short title
//              formula — optional longer KaTeX rendered in popover body
//              desc — rich multi-line description (supports \n)
//              role — one-line "role in DGAC" pill
const GLOSSARY = {
  "X":    { tex:"X", name:"节点特征矩阵 · Node features",
           formula:"X\\in\\mathbb R^{N\\times F}",
           desc:"每行 $X_i$ 是第 $i$ 个节点的 $F$ 维属性向量。\nCora 是 1433 维词袋，Texas 是 1703 维。\nDGAC 不假设属性是否与图同质。",
           role:"输入之一" },
  "A":    { tex:"A", name:"邻接矩阵 · Adjacency",
           formula:"A\\in\\{0,1\\}^{N\\times N},\\; A_{ij}=1 \\iff (i,j)\\in E",
           desc:"无向图的邻接矩阵。DGAC 先加自环 $A+I$，再对称归一化得到 $\\hat A$。\n只依赖结构，不用边权。",
           role:"输入之一" },
  "N":    { tex:"N", name:"节点数", formula:"N=|V|",
           desc:"图中节点数目。代码里 $N = X.\\text{shape}[0]$。\nDGAC 的扩散复杂度 $O(N\\cdot L)$ 对稀疏图友好。", role:"标量" },
  "F":    { tex:"F", name:"特征维度", formula:"F=\\dim(X_i)",
           desc:"节点属性维度。\n常见：Cora $F=1433$，Texas $F=1703$，Wisconsin $F=1703$。", role:"标量" },
  "K":    { tex:"K", name:"簇数", formula:"K=\\# \\text{clusters}",
           desc:"目标簇数。由数据集事先给定（Cora $K=7$，Texas $K=5$），DGAC 本身不估计 $K$。", role:"超参" },

  "Ahat": { tex:"\\hat A", name:"对称归一化邻接 · Normalized adjacency",
           formula:"\\hat A=D^{-1/2}(A+I)\\,D^{-1/2}",
           desc:"$D$ 是 $A+I$ 的度对角矩阵。\n$\\hat A$ 是对称半正定扩散算子，特征值 $\\in [0, 1]$，最大特征值 $=1$ 对应恒等向量，保证迭代稳定。\n这个算子与 APPNP / GCN / Personalized PageRank 一脉相承。",
           role:"扩散算子（拓扑）" },
  "Xhat": { tex:"\\hat X", name:"L2 归一化特征",
           formula:"\\hat X_i = X_i\\,/\\,\\|X_i\\|_2",
           desc:"逐行除以 L2 范数，把每个特征向量放到单位球面。\n这一步让 $\\hat X\\hat X^\\top$ 直接等于余弦相似度，不必再写除法。",
           role:"预处理" },
  "Shat": { tex:"\\hat S", name:"属性相似矩阵 · Attribute graph",
           formula:"\\hat S=\\hat X\\hat X^\\top\\;\\in\\;\\mathbb R^{N\\times N}",
           desc:"$\\hat S_{ij}=\\cos(X_i, X_j)$。\n把「属性相似」也当作一种邻接，构成第二张图。\n代码里用低秩分解 $\\text{half\\_}S$ 规避 $O(N^2)$ 存储。\n这是 DGAC 在异质图上好用的根本原因：属性邻居可能比结构邻居更干净。",
           role:"扩散算子（属性）" },

  "H0t":  { tex:"H_0^{\\,t}", name:"拓扑分支初值",
           formula:"H_0^{\\,t}=\\mathrm{SVD}_d(\\hat A)\\;\\text{或}\\;\\mathrm{MLP}(\\hat A)",
           desc:"$\\hat A$ 的 $d$ 维低秩编码，是拓扑扩散链的初始态，也会在每一步作为 residual 加回。\n初值反复加入 $\\Rightarrow$ 扩散不会退化成一团均匀向量（避免 over-smoothing）。",
           role:"初值（拓扑）" },
  "H0a":  { tex:"H_0^{\\,a}", name:"属性分支初值",
           formula:"H_0^{\\,a}=\\mathrm{SVD}_d(\\hat S)\\;\\text{或}\\;\\mathrm{MLP}(\\hat S)",
           desc:"$\\hat S$ 的 $d$ 维低秩编码，是属性扩散链的初始态。\n与 $H_0^{\\,t}$ 同一维度 $d$，方便后面融合。",
           role:"初值（属性）" },
  "Ht":   { tex:"H^{\\,t}", name:"拓扑分支表示",
           formula:"H^{\\,t(L)}=\\sum_{\\ell=0}^{L-1}\\alpha^\\ell\\,\\hat A^{\\,\\ell}H_0^{\\,t}",
           desc:"经过 $L$ 步扩散后，每个节点的表示融合了最多 $L$ 跳的邻居信息。\n展开后就是 PageRank 式的加权求和 —— 越远的邻居权重越小（$\\alpha^\\ell$ 衰减）。",
           role:"分支输出" },
  "Ha":   { tex:"H^{\\,a}", name:"属性分支表示",
           formula:"H^{\\,a(L)}=\\sum_{\\ell=0}^{L-1}\\alpha^\\ell\\,\\hat S^{\\,\\ell}H_0^{\\,a}",
           desc:"属性图上的对应物。\n节点即使结构上无连接，只要属性接近，也会被 $\\hat S$ 聚到一起。",
           role:"分支输出" },
  "H":    { tex:"H", name:"融合表示 · Fused embedding",
           formula:"H=\\beta\\,H^{\\,t}+(1-\\beta)\\,H^{\\,a}",
           desc:"$\\beta$ 控制两条分支的混合比例。\n可换成 $\\text{concat}$、$\\max$、gated MLP —— 论文消融里 add 常常最优。\n最终 k-means 和所有损失都作用在 $H$ 上。",
           role:"最终嵌入" },

  "alpha":{ tex:"\\alpha", name:"扩散步长 · Teleport",
           formula:"H^{(\\ell+1)}=\\alpha\\,\\hat A\\,H^{(\\ell)}+H_0",
           desc:"对应 APPNP 的 $(1-\\alpha_{\\text{teleport}})$ 系数。\n$\\alpha$ 大 $\\Rightarrow$ 更多邻居、更平滑；$\\alpha$ 小 $\\Rightarrow$ 更贴近初值、保结构。\nDGAC 默认 $\\alpha\\approx 0.5$。",
           role:"超参 (0, 1)" },
  "beta": { tex:"\\beta",  name:"融合系数",
           formula:"H=\\beta\\,H^{\\,t}+(1-\\beta)\\,H^{\\,a}",
           desc:"$\\beta\\in[0,1]$。\n同质图（Cora, Citeseer）最优 $\\beta$ 偏大 —— 拓扑更可信。\n异质图（Texas, Wisconsin）最优 $\\beta$ 偏小 —— 属性更可信。\n是 DGAC graph-agnostic 的旋钮。",
           role:"超参 [0, 1]" },
  "L":    { tex:"L",  name:"扩散层数",
           formula:"\\ell=0,1,\\dots,L-1",
           desc:"APPNP 风格迭代次数。\n感受野 $\\approx L$ 跳。\n太大会 over-smoothing，但 DGAC 靠 residual $H_0$ 相对耐折磨。",
           role:"超参" },
  "Lc":   { tex:"L_c", name:"C-prop 层数",
           formula:"C^{(\\ell+1)}=\\alpha\\,\\hat A\\,C^{(\\ell)}+C_0,\\quad \\ell<L_c",
           desc:"簇分配扩散的迭代次数。\n小数据集 $L_c\\in\\{2,3\\}$ 足够。\n这是 DGAC 的标志性设计：让分配本身在图上扩散。",
           role:"超参" },

  "C0":   { tex:"C_0", name:"初始硬分配",
           formula:"C_0=\\mathrm{one\\_hot}\\bigl(\\mathrm{k\\text{-}means}(H,K,\\cos)\\bigr)",
           desc:"第一次 k-means 得到的 one-hot 矩阵 $\\in\\{0,1\\}^{N\\times K}$。\n可能含噪声（误分配节点），但随后的 C-prop 会用邻居投票「纠错」。",
           role:"中间量" },
  "C":    { tex:"C", name:"软分配矩阵",
           formula:"C^{(\\ell+1)}=\\alpha\\,\\hat A\\,C^{(\\ell)}+C_0",
           desc:"C-prop 扩散后的软分配 $\\in[0,1]^{N\\times K}$，每行近似概率。\n被多数邻居属于某簇的节点会被自动「拉回」正确簇。\n这个过程不涉及梯度。",
           role:"中间量" },
  "Xprop":{ tex:"X_{\\text{prop}}", name:"扩散后的特征",
           formula:"X_{\\text{prop}}=\\mathrm{SVD}_d\\!\\left(\\sum_\\ell \\alpha^\\ell\\,\\hat A^{\\,\\ell}\\hat X\\right)",
           desc:"对 $\\hat X$ 做 $L$ 步扩散再做 SVD，作为 $H$ 的自监督对齐目标。\n相当于「用图平滑过的特征」当无标签的 teacher。",
           role:"自监督目标" },
  "mu":   { tex:"\\mu", name:"簇中心",
           formula:"\\mu = C^\\top H\\;\\in\\;\\mathbb R^{K\\times d}",
           desc:"用软分配 $C$ 加权计算 $K$ 个簇中心。\n训练时 $H\\mu^\\top$ 得到每个节点对每个中心的相似度 $\\Rightarrow$ 用作 CE 的 logits。",
           role:"中间量" },
  "tau":  { tex:"\\tau", name:"温度",
           formula:"\\mathrm{softmax}(H\\mu^\\top/\\tau)",
           desc:"对比学习温度。\n$\\tau$ 小 $\\Rightarrow$ 分布尖，分类边界硬。\n$\\tau$ 大 $\\Rightarrow$ 分布平，鼓励多样性。",
           role:"超参" },
  "gamma":{ tex:"\\gamma", name:"锐化指数",
           formula:"\\mathcal L_{\\text{prop}}=(1-\\cos(H,X_{\\text{prop}}))^\\gamma",
           desc:"$\\gamma>1$ 时，余弦距离小的 easy 样本损失趋近 $0$，难样本被放大。\n类似 focal loss 的思想。",
           role:"超参" },

  "Lprop":{ tex:"\\mathcal L_{\\text{prop}}", name:"扩散对齐损失",
           formula:"\\mathcal L_{\\text{prop}}=\\bigl(1-\\cos(H,\\,X_{\\text{prop}})\\bigr)^{\\gamma}",
           desc:"让融合表示 $H$ 与图平滑特征 $X_{\\text{prop}}$ 在余弦上对齐。\n$\\gamma$ 控制难样本聚焦程度。\n这是最主要的无监督信号。",
           role:"损失项" },
  "Lkm":  { tex:"\\mathcal L_{\\text{km}}", name:"中心对比损失",
           formula:"\\mathcal L_{\\text{km}}=\\mathrm{CE}\\!\\left(H\\mu^\\top/\\tau,\\;\\arg\\max_k C\\right)",
           desc:"以当前 $C$ 的硬分配为伪标签，\n把 $H$ 对 $\\mu$ 做带温度的 softmax 分类。\n相当于可微的 k-means 更新。",
           role:"损失项" },
  "LSSG": { tex:"\\mathcal L_{\\text{SSG}}", name:"SSG 三粒度一致性",
           formula:"\\mathcal L_{\\text{SSG}}=\\lambda_1\\,\\mathrm{MSE}(H^{\\,t},H^{\\,a})+\\lambda_2\\,\\mathcal L_{\\text{nbr}}+\\lambda_3\\,\\mathcal L_{\\text{clu}}",
           desc:"Self（节点级）：两分支在节点上对齐 $H^t\\approx H^a$。\nSibling（邻居级）：两分支的邻居相似矩阵对齐。\nGroup（簇级）：两分支的簇中心对齐。\n这是 DGAC 从双视图取一致性的理论支撑。",
           role:"损失项（复合）" },
  "Lort": { tex:"\\mathcal L_{\\text{ort}}", name:"正交正则",
           formula:"\\mathcal L_{\\text{ort}}=\\bigl\\|H^\\top H-I\\bigr\\|_F^{\\,2}",
           desc:"迫使 $H$ 的列近似正交 $\\Rightarrow$ 避免表示坍缩到低秩子空间。\n在无监督聚类里尤其重要，否则 k-means 可能退化成单点。",
           role:"正则项" },
  "I":    { tex:"I", name:"单位矩阵", formula:"I\\in\\mathbb R^{d\\times d}",
           desc:"$d\\times d$ 单位矩阵。仅在正交正则 $\\mathcal L_{\\text{ort}}$ 里出现。", role:"常量" },

  // ---- Operators & functions ----
  "SVDd": { tex:"\\mathrm{SVD}_d", name:"截断奇异值分解 · Truncated SVD",
           formula:"M\\approx U_d\\,\\Sigma_d\\,V_d^\\top,\\qquad \\mathrm{SVD}_d(M)=U_d\\Sigma_d^{1/2}",
           desc:"取最大的 $d$ 个奇异值及其对应左右奇异向量，得到 $M$ 的最佳低秩近似（Eckart–Young）。\n在 DGAC 中用来把 $\\hat A\\in\\mathbb R^{N\\times N}$、$\\hat S\\in\\mathbb R^{N\\times N}$ 压到 $\\mathbb R^{N\\times d}$，得到两条分支的初值 $H_0^{\\,t}$、$H_0^{\\,a}$。\n相比随机初始化，SVD 能保留最多的全局结构信息。",
           role:"编码算子" },
  "MLP":  { tex:"\\mathrm{MLP}", name:"多层感知机",
           formula:"\\mathrm{MLP}(x)=W_2\\,\\sigma(W_1 x+b_1)+b_2",
           desc:"$\\sigma$ 通常取 ReLU 或 GELU。\n作为 $\\mathrm{SVD}_d$ 的可学习替代：两层全连接把 $\\hat A$ / $\\hat S$ 压到 $d$ 维。\n参数量小，但能让初值「自适应」当前训练目标。",
           role:"可学习编码" },
  "kmeans":{ tex:"\\mathrm{k\\text{-}means}", name:"余弦 K-means",
           formula:"\\min_{\\{\\mu_k\\}}\\sum_{i}\\bigl(1-\\cos(H_i,\\,\\mu_{c(i)})\\bigr)",
           desc:"DGAC 用余弦距离版本的 k-means，而不是 $\\ell_2$。\n对 $H$ 先做 L2 归一化，再用球面上的 $\\cos$ 度量迭代。\n仅用来产生 $C_0$ —— 训练过程中会被 C-prop 平滑修正。",
           role:"初始化算法" },
  "onehot":{ tex:"\\mathrm{one\\_hot}", name:"独热编码",
           formula:"\\mathrm{one\\_hot}(c)_{ik}=\\begin{cases}1 & k=c_i\\\\ 0 & \\text{otherwise}\\end{cases}",
           desc:"把硬分配 $c\\in\\{1,\\dots,K\\}^N$ 写成矩阵 $\\{0,1\\}^{N\\times K}$，每行只有一个 $1$。\n这样它可以和 $\\hat A$ 相乘，直接参与 C-prop 的扩散。",
           role:"辅助" },
  "cos":  { tex:"\\cos", name:"余弦相似度",
           formula:"\\cos(u,v)=\\frac{u^\\top v}{\\|u\\|_2\\,\\|v\\|_2}",
           desc:"取值 $\\in[-1,1]$。\n在 DGAC 里无处不在：$\\hat S$ 的定义、k-means 的距离、$\\mathcal L_{\\text{prop}}$ 的对齐目标，都是余弦。\n对高维稀疏特征（词袋 1433 / 1703 维）比 $\\ell_2$ 更稳健。",
           role:"度量" },
  "argmax":{ tex:"\\arg\\max", name:"最大值位置",
           formula:"\\hat y_i=\\arg\\max_{k\\in\\{1,\\dots,K\\}} C_{ik}",
           desc:"对每一行 $C_i$ 取最大分量的索引 $\\Rightarrow$ 硬聚类标签。\n训练时同样用 $\\arg\\max_k C$ 为 $\\mathcal L_{\\text{km}}$ 提供伪标签（但 gradient 不回传给 $\\arg\\max$ 本身）。",
           role:"选择算子" },
  "CE":   { tex:"\\mathrm{CE}", name:"交叉熵 · Cross entropy",
           formula:"\\mathrm{CE}(z,\\,y)=-\\sum_i\\log\\frac{\\exp z_{i,y_i}}{\\sum_k\\exp z_{i,k}}",
           desc:"标准 softmax 交叉熵。\n在 $\\mathcal L_{\\text{km}}$ 里，$z=H\\mu^\\top/\\tau$ 是 logits，$y=\\arg\\max_k C$ 是伪标签。\n等价于让每个节点的表示贴近它所在簇的中心。",
           role:"损失函数" },
  "MSE":  { tex:"\\mathrm{MSE}", name:"均方误差",
           formula:"\\mathrm{MSE}(X,Y)=\\tfrac{1}{N}\\sum_i\\|X_i-Y_i\\|_2^2",
           desc:"$\\mathcal L_{\\text{SSG}}$ 的「Self」粒度用 MSE 让 $H^{\\,t}\\approx H^{\\,a}$ —— 两分支在节点级直接对齐。",
           role:"距离" },
  "Frob": { tex:"\\|\\cdot\\|_F", name:"Frobenius 范数",
           formula:"\\|M\\|_F=\\sqrt{\\sum_{i,j} M_{ij}^{\\,2}}",
           desc:"矩阵所有元素的平方和再开方，等价于把矩阵拉直成向量的 $\\ell_2$ 范数。\n在 $\\mathcal L_{\\text{ort}}=\\|H^\\top H-I\\|_F^{\\,2}$ 里作为正交偏离度的度量。",
           role:"矩阵范数" },
  "L2":   { tex:"\\|\\cdot\\|_2", name:"L2 范数",
           formula:"\\|x\\|_2=\\sqrt{\\sum_i x_i^{\\,2}}",
           desc:"标准欧氏范数。\nDGAC 用它做特征归一化 $\\hat X_i=X_i/\\|X_i\\|_2$，把每个节点放到单位球面。",
           role:"向量范数" },
  "D":    { tex:"D", name:"度对角矩阵",
           formula:"D_{ii}=\\sum_{j}(A+I)_{ij}",
           desc:"$A+I$ 每行之和放在对角线上。\n对称归一化 $\\hat A = D^{-1/2}(A+I)D^{-1/2}$ 用它把每行/每列的范数压到 $1$ 附近。",
           role:"预处理" },
  "softmax":{ tex:"\\mathrm{softmax}", name:"Softmax",
           formula:"\\mathrm{softmax}(z)_k=\\frac{\\exp z_k}{\\sum_j\\exp z_j}",
           desc:"把 logits 转成概率。\n温度 $\\tau$ 出现在 $\\mathcal L_{\\text{km}}$ 的 $\\mathrm{softmax}(H\\mu^\\top/\\tau)$ 里：$\\tau$ 小 $\\Rightarrow$ 更尖、更接近 one-hot；$\\tau$ 大 $\\Rightarrow$ 更平。",
           role:"激活" },
  "SigmaK":{ tex:"\\sum_{\\ell=0}^{L-1}", name:"扩散累加",
           formula:"H^{(L)}=\\sum_{\\ell=0}^{L-1}\\alpha^\\ell\\,\\hat A^{\\,\\ell}\\,H_0",
           desc:"APPNP 迭代 $H^{(\\ell+1)}=\\alpha\\hat A H^{(\\ell)}+H_0$ 展开后的闭式。\n几何级数的权重 $\\alpha^\\ell$ 保证收敛（$\\|\\hat A\\|\\le 1$, $\\alpha<1$）。",
           role:"展开式" },
};

// Chips shown at the bottom of each popover — click to drill into a related symbol.
const RELATED = {
  X:      ["Ahat","Xhat","N","F"],
  A:      ["Ahat","D","I","N"],
  N:      ["X","A"],
  F:      ["X"],
  K:      ["C","C0","mu"],
  Ahat:   ["A","D","alpha","L"],
  Xhat:   ["X","L2","Shat"],
  Shat:   ["Xhat","cos","Ahat"],
  H0t:    ["Ahat","SVDd","MLP","Ht"],
  H0a:    ["Shat","SVDd","MLP","Ha"],
  Ht:     ["alpha","Ahat","H0t","L","SigmaK"],
  Ha:     ["alpha","Shat","H0a","L","SigmaK"],
  H:      ["beta","Ht","Ha"],
  alpha:  ["Ahat","L","SigmaK"],
  beta:   ["Ht","Ha","H"],
  L:      ["alpha","SigmaK","Ht","Ha"],
  Lc:     ["alpha","Ahat","C","C0"],
  C0:     ["kmeans","onehot","H","K"],
  C:      ["C0","alpha","Ahat","Lc"],
  Xprop:  ["alpha","Ahat","Xhat","SVDd","SigmaK"],
  mu:     ["C","H","tau","Lkm"],
  tau:    ["mu","softmax","Lkm"],
  gamma:  ["Lprop","Xprop"],
  Lprop:  ["H","Xprop","gamma","cos"],
  Lkm:    ["mu","C","H","tau","CE","softmax","argmax"],
  LSSG:   ["Ht","Ha","MSE"],
  Lort:   ["H","I","Frob"],
  I:      ["Lort"],
  SVDd:   ["H0t","H0a","Xprop"],
  MLP:    ["H0t","H0a"],
  kmeans: ["C0","H","cos"],
  onehot: ["C0","kmeans"],
  cos:    ["Shat","kmeans","Lprop"],
  argmax: ["C","Lkm"],
  CE:     ["Lkm","softmax"],
  MSE:    ["LSSG","Ht","Ha"],
  Frob:   ["Lort"],
  L2:     ["Xhat"],
  D:      ["Ahat","A"],
  softmax:["Lkm","tau"],
  SigmaK: ["Ht","Ha","Xprop","alpha"],
};

// ---- KaTeX renderer ---------------------------------------------------
function Katex({ tex, display }) {
  const ref = useRefF(null);
  useEffectF(() => {
    const render = () => {
      if (window.katex && ref.current) {
        try {
          window.katex.render(tex, ref.current, {
            displayMode: !!display, throwOnError: false, strict: "ignore",
          });
        } catch (e) { ref.current.textContent = tex; }
      }
    };
    if (window.katex) render();
    else {
      const id = setInterval(()=>{ if (window.katex){ clearInterval(id); render(); } }, 50);
      return ()=>clearInterval(id);
    }
  }, [tex, display]);
  return <span ref={ref}/>;
}

// Parse "text with $x_i$ math $\\mathcal L$ inside" → mix of text + KaTeX.
function InlineMath({ text }) {
  const parts = [];
  const re = /\$([^$]+)\$/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({t:"txt", v: text.slice(last, m.index)});
    parts.push({t:"tex", v: m[1]});
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({t:"txt", v: text.slice(last)});
  return <>
    {parts.map((p,i)=> p.t === "tex"
      ? <span key={i} style={{fontSize:"1.05em", color:"oklch(0.92 0.06 85)"}}>
          <Katex tex={p.v}/>
        </span>
      : <span key={i}>{p.v}</span>
    )}
  </>;
}

function SymChip({ id, onOpen }) {
  const e = GLOSSARY[id]; if (!e) return null;
  return (
    <button
      onClick={ev=>{ ev.stopPropagation(); onOpen(id, ev.currentTarget); }}
      style={{
        display:"inline-flex", alignItems:"center", gap:6,
        padding:"3px 10px 3px 9px",
        background:"#faf7f1", border:"1px solid #e3ddd2",
        borderRadius:14, cursor:"pointer",
        fontFamily:"'Inter',sans-serif", fontSize:11, color:"#3d3a35",
        transition:"background .15s, border-color .15s",
      }}
      onMouseEnter={ev=>{ ev.currentTarget.style.background="#fff"; ev.currentTarget.style.borderColor="#c8c1b4"; }}
      onMouseLeave={ev=>{ ev.currentTarget.style.background="#faf7f1"; ev.currentTarget.style.borderColor="#e3ddd2"; }}
      title={e.name}
    >
      <span style={{fontSize:13.5, color:"#1b1a18"}}><Katex tex={e.tex}/></span>
      <span style={{color:"#827d75"}}>{e.name.split(" · ")[0]}</span>
    </button>
  );
}

function Eq({ tex, hl }) {
  return (
    <div style={{
      fontSize: 17, padding:"10px 14px",
      background: hl ? "oklch(0.965 0.03 85)" : "#fdfaf3",
      borderRadius: 6, margin:"6px 0",
      border: hl ? "1px solid oklch(0.88 0.06 85)" : "1px solid transparent",
      overflowX:"auto",
      transition:"background .3s, border-color .3s",
    }}>
      <Katex tex={tex} display/>
    </div>
  );
}

function Block({ active, color, eyebrow, children, syms, onOpen, note }) {
  if (!active) return null;
  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      paddingLeft: 16, marginBottom: 22,
      animation: "fmlFade .35s ease",
    }}>
      <div style={{fontSize:10.5, color, letterSpacing:"0.14em", marginBottom:8, fontWeight:700,
        fontFamily:"'Inter',sans-serif"}}>{eyebrow}</div>
      {children}
      {note && <div style={{fontSize:12, color:"#827d75", marginTop:6, lineHeight:1.6}}>{note}</div>}
      {syms && syms.length>0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:6, marginTop:10}}>
          {syms.map(s => <SymChip key={s} id={s} onOpen={onOpen}/>)}
        </div>
      )}
    </div>
  );
}

function Popover({ id, anchor, onClose, onOpen }){
  const [expandedId, setExpandedId] = useStateF(null);
  useEffectF(() => { setExpandedId(null); }, [id]);
  if (!id || !anchor) return null;
  const e = GLOSSARY[id]; if (!e) return null;
  const r = anchor.getBoundingClientRect();
  const W = 380;
  const H_est = 460;
  const left = Math.min(window.innerWidth-W-12, Math.max(12, r.left-10));
  // position BELOW if there's room, else ABOVE — use viewport coords (fixed)
  const spaceBelow = window.innerHeight - r.bottom;
  const top = spaceBelow > H_est + 20
    ? r.bottom + 10
    : Math.max(12, r.top - H_est - 10);
  const parts = e.desc.split("\n");
  const [zh, en] = e.name.split(" · ");
  const content = (
    <div onClick={ev=>ev.stopPropagation()}
      style={{
        position:"fixed", left, top, width:W, zIndex:9999,
        maxHeight: window.innerHeight - 24, overflowY:"auto",
        background:"#1b1a18", color:"#fffdf7",
        borderRadius:12,
        boxShadow:"0 20px 48px -10px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.25)",
        border:"1px solid oklch(0.3 0.02 80)",
        fontFamily:"'Inter',sans-serif",
      }}>
      {/* header */}
      <div style={{padding:"18px 22px 14px", background:"oklch(0.18 0.01 80)",
        borderBottom:"1px solid oklch(0.28 0.02 80)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8}}>
          <div style={{fontSize:14, color:"#fffdf7", fontWeight:600, letterSpacing:"0.01em"}}>{zh}</div>
          <button onClick={onClose}
            style={{background:"transparent", border:"none", color:"#a8a194", cursor:"pointer",
              fontSize:20, lineHeight:1, padding:"0 2px"}}>×</button>
        </div>
        {en && <div style={{fontSize:10.5, color:"#a8a194", letterSpacing:"0.14em",
          textTransform:"uppercase", marginTop:4, fontFamily:"'JetBrains Mono',monospace"}}>{en}</div>}
        {e.role && (
          <div style={{display:"inline-block", marginTop:12, padding:"3px 10px",
            background:"oklch(0.28 0.04 85)", color:"oklch(0.9 0.08 85)",
            borderRadius:10, fontSize:10, letterSpacing:"0.06em",
            fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>
            {e.role}
          </div>
        )}
      </div>

      {/* symbol + formula */}
      <div style={{padding:"18px 22px 16px", background:"oklch(0.215 0.012 80)",
        borderBottom:"1px solid oklch(0.28 0.02 80)"}}>
        <div style={{fontSize:10, color:"#827d75", letterSpacing:"0.18em", marginBottom:10,
          fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>Symbol</div>
        <div style={{fontSize:34, color:"oklch(0.94 0.1 85)", marginBottom:4, minHeight:42,
          display:"flex", alignItems:"center", justifyContent:"center",
          padding:"10px 0"}}>
          <Katex tex={e.tex} display/>
        </div>
        {e.formula && <>
          <div style={{fontSize:10, color:"#827d75", letterSpacing:"0.18em", marginTop:14, marginBottom:8,
            fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>Definition</div>
          <div style={{fontSize:15.5, color:"#f5f0e4",
            padding:"14px 14px",
            background:"oklch(0.14 0.008 80)", borderRadius:8,
            border:"1px solid oklch(0.28 0.02 80)",
            overflowX:"auto",
            display:"flex", alignItems:"center", justifyContent:"center",
            minHeight:48}}>
            <Katex tex={e.formula} display/>
          </div>
        </>}
      </div>

      {/* desc */}
      <div style={{padding:"16px 22px 20px"}}>
        <div style={{fontSize:10, color:"#827d75", letterSpacing:"0.18em", marginBottom:10,
          fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>Description</div>
        <div style={{fontSize:12.5, lineHeight:1.8, color:"#e6dfce"}}>
          {parts.map((p,i)=>(
            <div key={i} style={{marginBottom:8}}>
              <InlineMath text={p}/>
            </div>
          ))}
        </div>
      </div>

      {/* related symbols — click chip to expand inline; re-click to collapse */}
      {(() => {
        const rels = (RELATED[id] || []).filter(k => GLOSSARY[k]);
        if (!rels.length) return null;
        const exp = expandedId && GLOSSARY[expandedId] ? GLOSSARY[expandedId] : null;
        return (
          <div style={{padding:"14px 22px 18px",
            borderTop:"1px solid oklch(0.28 0.02 80)",
            background:"oklch(0.16 0.008 80)"}}>
            <div style={{fontSize:10, color:"#827d75", letterSpacing:"0.18em", marginBottom:10,
              fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>Related · 继续追问</div>
            <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
              {rels.map(k => {
                const r = GLOSSARY[k];
                const zhName = (r.name||"").split(" · ")[0];
                const isExp = expandedId === k;
                return (
                  <button key={k}
                    onClick={ev => { ev.stopPropagation(); setExpandedId(isExp ? null : k); }}
                    title={zhName}
                    style={{
                      cursor:"pointer",
                      padding:"5px 12px",
                      background: isExp ? "oklch(0.36 0.06 85)" : "oklch(0.24 0.02 80)",
                      color:"oklch(0.94 0.1 85)",
                      border: isExp ? "1px solid oklch(0.58 0.1 85)" : "1px solid oklch(0.32 0.03 85)",
                      borderRadius:999,
                      fontSize:13,
                      lineHeight:1.2,
                      display:"inline-flex",
                      alignItems:"center",
                      gap:6,
                      transition:"all 0.12s",
                    }}>
                    <Katex tex={r.tex} display={false}/>
                    <span style={{fontSize:10.5, color: isExp ? "oklch(0.9 0.1 85)" : "#a8a194",
                      fontFamily:"'Inter',sans-serif"}}>{zhName}</span>
                  </button>
                );
              })}
            </div>

            {/* inline expansion: formula + desc of the picked related symbol */}
            {exp && (
              <div style={{marginTop:14, padding:"12px 14px 14px",
                background:"oklch(0.12 0.008 80)",
                borderRadius:8,
                border:"1px solid oklch(0.32 0.03 85)",
                animation:"fmlFade 0.16s ease-out"}}>
                <div style={{display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:10, paddingBottom:8,
                  borderBottom:"1px dashed oklch(0.26 0.02 80)"}}>
                  <div style={{display:"flex", alignItems:"baseline", gap:8}}>
                    <span style={{fontSize:18, color:"oklch(0.94 0.1 85)"}}>
                      <Katex tex={exp.tex} display={false}/>
                    </span>
                    <span style={{fontSize:12, color:"#e6dfce", fontWeight:600}}>
                      {(exp.name||"").split(" · ")[0]}
                    </span>
                  </div>
                  {onOpen && (
                    <button
                      onClick={ev => { ev.stopPropagation(); onOpen(expandedId, ev.currentTarget); }}
                      style={{
                        padding:"3px 10px",
                        background:"transparent",
                        color:"#a8a194",
                        border:"1px solid oklch(0.34 0.03 85)",
                        borderRadius:6,
                        fontSize:10.5,
                        cursor:"pointer",
                        fontFamily:"'JetBrains Mono',monospace",
                        letterSpacing:"0.04em",
                      }}
                      title="打开完整说明卡（含它的相关符号）">
                      ↗ 完整
                    </button>
                  )}
                </div>
                {exp.formula && (
                  <div style={{fontSize:14.5, color:"#f5f0e4",
                    padding:"10px 12px",
                    background:"oklch(0.09 0.008 80)",
                    borderRadius:6,
                    marginBottom:10,
                    overflowX:"auto",
                    display:"flex", justifyContent:"center", alignItems:"center",
                    minHeight:40}}>
                    <Katex tex={exp.formula} display/>
                  </div>
                )}
                <div style={{fontSize:12, lineHeight:1.75, color:"#d4cbb8"}}>
                  {exp.desc.split("\n").map((p,i)=>(
                    <div key={i} style={{marginBottom:5}}>
                      <InlineMath text={p}/>
                    </div>
                  ))}
                </div>

                {/* nested related chips — drill further without leaving this card */}
                {(() => {
                  const subRels = (RELATED[expandedId] || []).filter(k => GLOSSARY[k]);
                  if (!subRels.length) return null;
                  return (
                    <div style={{marginTop:12, paddingTop:10,
                      borderTop:"1px dashed oklch(0.26 0.02 80)"}}>
                      <div style={{fontSize:9.5, color:"#827d75", letterSpacing:"0.18em",
                        marginBottom:8, fontFamily:"'JetBrains Mono',monospace",
                        textTransform:"uppercase"}}>继续 →</div>
                      <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                        {subRels.map(k => {
                          const r = GLOSSARY[k];
                          const zhName = (r.name||"").split(" · ")[0];
                          return (
                            <button key={k}
                              onClick={ev => { ev.stopPropagation(); setExpandedId(k); }}
                              title={zhName}
                              style={{
                                cursor:"pointer",
                                padding:"3px 9px",
                                background:"oklch(0.18 0.008 80)",
                                color:"#d4cbb8",
                                border:"1px solid oklch(0.28 0.02 80)",
                                borderRadius:999,
                                fontSize:11.5,
                                display:"inline-flex",
                                alignItems:"center",
                                gap:4,
                                transition:"all 0.12s",
                              }}
                              onMouseEnter={ev => {
                                ev.currentTarget.style.background = "oklch(0.24 0.02 80)";
                                ev.currentTarget.style.borderColor = "oklch(0.38 0.05 85)";
                              }}
                              onMouseLeave={ev => {
                                ev.currentTarget.style.background = "oklch(0.18 0.008 80)";
                                ev.currentTarget.style.borderColor = "oklch(0.28 0.02 80)";
                              }}>
                              <Katex tex={r.tex} display={false}/>
                              <span style={{fontSize:9.5, color:"#a8a194"}}>{zhName}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
  return ReactDOM.createPortal(content, document.body);
}

function FormulaPanel({ step, tweaks }) {
  const [pop, setPop] = useStateF({id:null, anchor:null});
  const open = (id, el) => setPop({id, anchor:el});
  const close = () => setPop({id:null, anchor:null});

  const id = step.id;
  const A_T = "oklch(0.55 0.13 250)";
  const A_A = "oklch(0.58 0.13 35)";
  const A_F = "oklch(0.52 0.13 300)";
  const A_C = "oklch(0.55 0.13 150)";
  const A_L = "oklch(0.50 0.05 260)";

  return (
    <div onClick={close} style={{color:"#1b1a18"}}>
      <style>{`@keyframes fmlFade { from{opacity:0; transform:translateY(4px);} to{opacity:1; transform:none;} }`}</style>
      <div style={{fontSize:11, color:"#a8a194", marginBottom:14, fontStyle:"italic",
        paddingBottom:10, borderBottom:"1px dashed #e3ddd2",
        display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12}}>
        <span>当前步骤 · 点击符号查看定义</span>
        <span className="mono" style={{color:"#827d75", fontStyle:"normal"}}>
          step · <b style={{color:"#3d3a35"}}>{id}</b>
        </span>
      </div>

      <Block active={id==="input"} color="#3d3a35" eyebrow="输入 · INPUT"
        onOpen={open} syms={["A","X","N","F","K"]}>
        <Eq hl={id==="input"}
          tex="\mathcal G=(A,\,X),\quad A\in\mathbb R^{N\times N},\quad X\in\mathbb R^{N\times F}"/>
      </Block>

      <Block active={id==="encode"} color={A_A} eyebrow="输入编码 · ENCODE"
        onOpen={open} syms={["Xhat","Shat","H0t","H0a","Ahat","SVDd","MLP","L2","D","cos"]}>
        <Eq hl={id==="encode"} tex="\hat X=X\,/\,\|X\|_2,\qquad \hat S=\hat X\hat X^\top"/>
        <Eq hl={id==="encode"}
          tex="H_0^{\,t}=\mathrm{SVD}_d(\hat A),\qquad H_0^{\,a}=\mathrm{SVD}_d(\hat S)"/>
      </Block>

      <Block active={id==="topology"} color={A_T} eyebrow="拓扑分支 · TOP_AGG"
        onOpen={open} syms={["Ht","alpha","Ahat","H0t","L","SigmaK"]}
        note={`当前参数：α = ${tweaks.alpha.toFixed(2)}，L = ${tweaks.topLayers}`}>
        <Eq hl={id==="topology"}
          tex="H^{t\,(\ell+1)}\;\leftarrow\;\alpha\,\hat A\,H^{t\,(\ell)}\;+\;H_0^{\,t},\qquad \ell=0,\dots,L-1"/>
      </Block>

      <Block active={id==="attribute"} color={A_A} eyebrow="属性分支 · ATTR_AGG"
        onOpen={open} syms={["Ha","alpha","Shat","H0a","L","SigmaK"]}
        note="Ŝ 把属性相似的节点视作「虚拟邻居」，哪怕它们在 A 中无边 — 这是对异质图友好的关键。">
        <Eq hl={id==="attribute"}
          tex="H^{a\,(\ell+1)}\;\leftarrow\;\alpha\,\hat S\,H^{a\,(\ell)}\;+\;H_0^{\,a}"/>
      </Block>

      <Block active={id==="fusion"} color={A_F} eyebrow="融合 · FUSION"
        onOpen={open} syms={["H","beta","Ht","Ha"]}
        note={`当前参数：β = ${tweaks.beta.toFixed(2)} · 也可用 concat 或 max`}>
        <Eq hl={id==="fusion"} tex="H=\beta\,H^{t}+(1-\beta)\,H^{a}"/>
      </Block>

      <Block active={id==="kmeans"} color={A_C} eyebrow="初始聚类 · K-MEANS"
        onOpen={open} syms={["C0","H","K","kmeans","onehot","cos"]}>
        <Eq hl={id==="kmeans"}
          tex="C_0=\mathrm{one\_hot}\bigl(\,\mathrm{k\text{-}means}(H,\,K,\,\cos)\bigr)"/>
      </Block>

      <Block active={id==="cprop"} color={A_C} eyebrow="簇分配扩散 · C-PROP ★"
        onOpen={open} syms={["C","alpha","Ahat","C0","Lc","onehot"]}
        note={`当前参数：L_c = ${tweaks.cpropLayers} · 扩散硬分配 C₀，被邻居纠正成软分配 C`}>
        <Eq hl={id==="cprop"}
          tex="C^{(\ell+1)}\;\leftarrow\;\alpha\,\hat A\,C^{(\ell)}\;+\;C_0,\qquad \ell=0,\dots,L_c-1"/>
      </Block>

      <Block active={id==="loss"} color={A_L} eyebrow="自监督损失 · LOSS"
        onOpen={open} syms={["Lprop","Lkm","LSSG","Lort","H","Xprop","mu","tau","gamma","C","I","cos","CE","MSE","Frob","softmax","argmax"]}>
        <Eq hl={id==="loss"}
          tex="\mathcal L_{\text{prop}}=\bigl(1-\cos(H,\,X_{\text{prop}})\bigr)^{\gamma}"/>
        <Eq hl={id==="loss"}
          tex="\mathcal L_{\text{km}}=\mathrm{CE}\!\left(H\mu^\top/\tau,\;\arg\max_k C\right)"/>
        <Eq hl={id==="loss"}
          tex="\mathcal L_{\text{SSG}}=\lambda_1\,\mathrm{MSE}(H^{t},H^{a})+\lambda_2\,\mathcal L_{\text{nbr}}+\lambda_3\,\mathcal L_{\text{clu}}"/>
        <Eq hl={id==="loss"}
          tex="\mathcal L_{\text{ort}}=\bigl\|H^\top H-I\bigr\|_{F}^{2}"/>
      </Block>

      <Block active={id==="output"} color={A_C} eyebrow="输出 · OUTPUT"
        onOpen={open} syms={["C","argmax"]}>
        <Eq hl={id==="output"} tex="\hat y_i=\arg\max_{k}\,C_{ik}"/>
      </Block>

      <Popover id={pop.id} anchor={pop.anchor} onClose={close} onOpen={open}/>
    </div>
  );
}

window.FormulaPanel = FormulaPanel;
