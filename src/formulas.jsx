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
           desc:"论文 Sec. 3.1 —— $X$ 是 attributed graph $\\mathcal G=(V,E,X)$ 的第三个组成部分，和 $V$、$E$ 并列直接给定（不从 $V$ 或 $E$ 派生）。\n每行 $X_i$ 是节点 $v_i$ 自带的 $F$ 维属性向量（e.g., Cora 的 bag-of-words F=1433，Texas F=1703）。\n论文约定 $\\|X_i\\|_2=1$（输入已 L2 归一化）；playground 为清晰起见单独列 $\\hat X$ 这一步。",
           role:"输入之一（G 的组成）" },
  "A":    { tex:"A", name:"邻接矩阵 · Adjacency",
           formula:"A_{ij}=\\mathbb 1\\bigl[(v_i,v_j)\\in E\\bigr]\\;\\in\\{0,1\\}^{N\\times N}",
           desc:"论文 Sec. 3.1 —— $A$ 不是 $\\mathcal G=(V,E,X)$ 的独立组成，而是从边集 $E$ 导出的矩阵形式：$A_{ij}=1$ 当且仅当 $(v_i,v_j)\\in E$。\n无向图 $\\Rightarrow A=A^\\top$，不用边权。\n下游：$D=\\text{diag}(\\text{row-sum of }A)$、$\\tilde A=D^{-1/2}AD^{-1/2}$；playground 跟随 GCN 约定多加一个自环 $A+I$。",
           role:"输入之一（从 E 导出）" },
  "N":    { tex:"N", name:"节点数", formula:"N=|V|",
           desc:"图中节点数目。代码里 $N = X.\\text{shape}[0]$。\nDGAC 的扩散复杂度 $O(N\\cdot L)$ 对稀疏图友好。", role:"标量" },
  "F":    { tex:"F", name:"特征维度", formula:"F=\\dim(X_i)",
           desc:"节点属性维度。\n常见：Cora $F=1433$，Texas $F=1703$，Wisconsin $F=1703$。", role:"标量" },
  "K":    { tex:"K", name:"簇数", formula:"K=\\# \\text{clusters}",
           desc:"目标簇数。由数据集事先给定（Cora $K=7$，Texas $K=5$），DGAC 本身不估计 $K$。", role:"超参" },

  "Ahat": { tex:"\\hat A", name:"对称归一化邻接（GCN 约定）· Normalized adjacency",
           formula:"\\hat A=\\tilde D^{-1/2}(A+I)\\,\\tilde D^{-1/2},\\quad \\tilde D_{ii}=\\textstyle\\sum_j (A+I)_{ij}",
           desc:"playground 用 GCN 约定的 $\\hat A$（加自环 $A+I$）。注意 $\\tilde D$ 是 $A+I$ 的度矩阵，与论文 D 卡（$A$ 的度矩阵）差 $+1$ —— 二者用 $\\tilde D$ 区分开。\n$\\hat A$ 是对称半正定扩散算子，特征值 $\\in [0, 1]$，最大特征值 $=1$ 对应恒等向量，保证迭代稳定。\n论文 Sec. 3.1 定义的对应物是 $\\tilde A=D^{-1/2}AD^{-1/2}$（无自环）；在同质小图上二者差异很小。",
           role:"扩散算子（拓扑）" },
  "Xhat": { tex:"\\hat X", name:"L2 归一化特征",
           formula:"\\hat X_i = X_i\\,/\\,\\|X_i\\|_2",
           desc:"逐行除以 L2 范数，把每个特征向量放到单位球面。\n这一步让 $\\hat X\\hat X^\\top$ 直接等于余弦相似度，不必再写除法。\n论文把 $\\hat X$ 当作 $X$ 直接给出（Sec. 3.1 约定 $\\|X_i\\|_2=1$），$\\mathcal L_{\\text{recons}}$ 里的 $\\hat X$ 实际是更严格的 $PQ$（$\\bar X=PQR^\\top$ 的 SVD 前两项）。",
           role:"预处理" },
  "dS":   { tex:"d", name:"属性图度向量 · Attribute-affinity degrees",
           formula:"d_i=\\textstyle\\sum_j S_{ij}=X_i\\!\\cdot\\!\\bigl(\\textstyle\\sum_j X_j\\bigr)^{\\!\\top},\\quad d\\in\\mathbb R^N",
           desc:"论文 Lemma 3 —— 节点 $v_i$ 在属性相似图 $\\hat S$ 上的「度」：$S$ 矩阵的第 $i$ 行之和，也等于 $X_i$ 与所有节点特征之和的点积。\n用途：$\\bar X=\\mathrm{diag}(d)^{-1/2}X$ 的归一化因子（见 $\\bar X$ 卡），进而算 $U=\\mathrm{SVD}_d(\\bar X)$。\n注意区分：\n  · 这里的 $d$ 是属性相似图 $\\hat S$ 上的度（向量，N 维）\n  · $d(v_i)$ 是原图 $A$ 上节点 $v_i$ 的邻居数（见 d(v_i) 卡）\n两个是不同的量，只是符号都用小写 $d$ 而已。",
           role:"属性图度向量" },
  "barX": { tex:"\\bar X", name:"度归一化特征矩阵 · Degree-normalized X",
           formula:"\\bar X=\\mathrm{diag}(d)^{-1/2}\\,X,\\quad d_i=\\textstyle\\sum_j S_{ij}",
           desc:"论文 Lemma 3 —— $\\bar X$ 是对 $X$ 每行做度归一化后的结果；$d_i=\\sum_j S_{ij}$ 是属性相似图 $\\hat S$ 下节点 $v_i$ 的度。\n关键作用：$\\tilde S = \\bar X\\bar X^\\top$（S 的 symmetric normalization），因此 $\\tilde S$ 的前 $d$ 个特征向量 $U$ 可以通过 $\\bar X$ 的 $\\mathrm{SVD}_d$ 高效得到（$O(nf d)$ 复杂度），不用显式构造 $\\tilde S$（$O(n^2)$ 存储）。\n$U=\\mathrm{SVD}_d(\\bar X)$ 用作拓扑分支初值 $H_0^{\\,t}$（见 $H_0^{\\,t}$ 卡）。\n$\\bar X=PQR^\\top$ 的 SVD 也给出 $\\hat X=PQ$，用在 $\\mathcal L_{\\text{recons}}$。",
           role:"预处理（SVD 加速用）" },
  "Shat": { tex:"\\hat S", name:"属性相似矩阵 · Attribute affinity",
           formula:"\\hat S=\\hat X\\hat X^\\top\\;\\in\\;\\mathbb R^{N\\times N},\\quad \\hat S_{ij}=\\cos(X_i,X_j)",
           desc:"论文 Eq.6 —— $S_{ij}=X_i X_j^\\top$（当 $\\|X_i\\|_2=1$ 时正是余弦相似度）。\n把「属性相似」也当作一种邻接，构成第二张图（paper 称作 affinity graph $\\mathcal H$）。\n注意：paper 另有 $\\tilde S=\\mathrm{diag}(\\sum_j S_{\\cdot j})^{-1/2}\\,S\\,\\mathrm{diag}(\\sum_j S_{\\cdot j})^{-1/2}$（进一步对称归一化）。playground 的 $\\hat S$ 实际只做到 $S$ 这一级简化。\n代码里用 $\\bar X$ 的 SVD 规避 $O(N^2)$ 显式存储。\nDGAC 在异质图上好用的根本原因：属性邻居可能比结构邻居更干净。",
           role:"扩散算子（属性）" },

  "H0t":  { tex:"H_0^{\\,t}\\equiv U", name:"拓扑分支初值 U · Topology init",
           formula:"U=\\mathrm{SVD}_d(\\bar X)",
           desc:"论文 Eq.12 / Lemma 3 — 拓扑分支的初值 $U$ 来自属性侧 $\\bar X$ 的 SVD 前 $d$ 个左奇异向量，等价于 $\\tilde S=\\bar X\\bar X^\\top$ 的前 $d$ 个特征向量（SVD 版本避免 $O(n^2)$ 显式构造 $\\tilde S$）。\n这是 DGAC 的交叉模态设计之一：拓扑分支用属性侧的结构做初始化，再在 $\\hat A$ 上扩散，让两侧信息融合。\nplayground 的 toy 实现用类中心+噪声近似 $U$。",
           role:"初值（拓扑，来自属性 X̄）" },
  "H0a":  { tex:"H_0^{\\,a}\\equiv B", name:"属性分支初值 B · Attribute init",
           formula:"B=\\text{top-}d\\text{ eigvec}(\\hat A)",
           desc:"论文 Eq.13 — 属性分支的初值 $B$ 来自拓扑侧 归一化邻接 $\\hat A$ 的前 $d$ 个特征向量。\n交叉模态的另一半：属性分支用拓扑侧的结构做初始化，再在 $\\hat S$ 上扩散。\n与 $H_0^{\\,t}$ 同维度 $d$，方便后面融合。\nplayground 的 toy 实现用类中心+噪声近似 $B$（真实 $B$ 需要对 $\\hat A$ 做完整的特征分解）。",
           role:"初值（属性，来自拓扑 Â）" },
  "Ht":   { tex:"H^{\\,t}", name:"拓扑分支表示",
           formula:"H^{\\,t}=\\sum_{\\ell=0}^{L_t}\\alpha^\\ell\\,\\hat A^{\\,\\ell}\\,U",
           desc:"论文 Eq.12 —— 拓扑分支的输出。\n经过 $L_t$ 步扩散后，每个节点的表示融合了最多 $L_t$ 跳的邻居信息。\n等价的迭代形式：$H^{t(\\ell+1)}=\\alpha\\hat A H^{t(\\ell)}+U$。\n展开后就是 PageRank 式的加权求和 —— 越远的邻居权重越小（$\\alpha^\\ell$ 衰减）。\n注意初值 $U$ 是从属性侧 $\\bar X$ 做 SVD 得到（交叉模态，见 $H_0^{\\,t}$ 卡）。",
           role:"分支输出" },
  "Ha":   { tex:"H^{\\,a}", name:"属性分支表示",
           formula:"H^{\\,a}=\\sum_{\\ell=0}^{L_a}\\alpha^\\ell\\,\\hat S^{\\,\\ell}\\,B",
           desc:"论文 Eq.13 —— 属性图上的对应物。\n节点即使结构上无连接，只要属性接近，也会被 $\\hat S$ 聚到一起。\n初值 $B$ 是从拓扑侧 $\\hat A$ 做特征分解得到（交叉模态，见 $H_0^{\\,a}$ 卡）。",
           role:"分支输出" },
  "Wt":   { tex:"W^{(t)}", name:"拓扑分支线性变换 · Topology weight",
           formula:"W^{(t)}\\in\\mathbb R^{d\\times d'}\\;\\;(\\text{通常 }d'=d)",
           desc:"论文 Eq.14 里的可学习矩阵，把拓扑分支的扩散输出 $H^{(t)}$ 映射到融合空间 $Z^{(t)}=H^{(t)}W^{(t)}$。\n\n代码（DGAC-main, PyTorch）：\n```\nself.W_t = nn.Linear(d, d, bias=False)\nZ_t = self.W_t(H_t)    # shape: n × d\n```\n无 bias —— 纯线性变换（乘法，不平移）。\n初始化通常用 Xavier/He。\n\n被三路损失共同拉着训练：\n  · $\\mathcal L_{\\text{nod}}=\\|Z^{(t)}-Z^{(a)}\\|_F^2$：推 $W^{(t)}$、$W^{(a)}$ 协同（两侧表示对齐）\n  · $\\mathcal L_{\\text{dec}}$：推 $Z^{(t)\\top}Z^{(t)}\\approx I$，避免 $W^{(t)}$ 退化\n  · $\\mathcal L_{\\text{cluster}}/\\mathcal L_{\\text{recons}}$：作用在融合后的 $H$ 上，间接影响 $W^{(t)}$",
           role:"可学习权重" },
  "Wa":   { tex:"W^{(a)}", name:"属性分支线性变换 · Attribute weight",
           formula:"W^{(a)}\\in\\mathbb R^{d\\times d'}\\;\\;(\\text{通常 }d'=d)",
           desc:"和 $W^{(t)}$ 对称的可学习矩阵：$Z^{(a)}=H^{(a)}W^{(a)}$。\n\n代码（DGAC-main, PyTorch）：\n```\nself.W_a = nn.Linear(d, d, bias=False)\nZ_a = self.W_a(H_a)    # shape: n × d\n```\n两者独立训练 —— 让两分支在 fusion 前可以各自做特征重塑，再加权相加（论文 Eq.14）。\n受约束条件同 $W^{(t)}$（$\\mathcal L_{\\text{nod}}$ 要求 $Z^{(a)}\\approx Z^{(t)}$、$\\mathcal L_{\\text{dec}}$ 要求列近似正交）。",
           role:"可学习权重" },
  "Zt":   { tex:"Z^{(t)}", name:"拓扑分支变换后表示",
           formula:"Z^{(t)}=H^{(t)}\\,W^{(t)}",
           desc:"拓扑分支扩散输出经过 $W^{(t)}$ 线性变换后的节点表示。\n参与 $\\mathcal L_{\\text{cont}}$ 的三粒度对比（$\\mathcal L_{\\text{nod}}$、$\\mathcal L_{\\text{nei}}$、$\\mathcal L_{\\text{clu}}$）和去相关正则 $\\mathcal L_{\\text{dec}}$。\n最后参与 $H=\\beta Z^{(t)}+(1-\\beta)Z^{(a)}$。",
           role:"分支输出 (transformed)" },
  "Za":   { tex:"Z^{(a)}", name:"属性分支变换后表示",
           formula:"Z^{(a)}=H^{(a)}\\,W^{(a)}",
           desc:"和 $Z^{(t)}$ 对称的属性分支变换输出。\n与 $Z^{(t)}$ 一同参与融合、对比损失、去相关正则。",
           role:"分支输出 (transformed)" },
  "H":    { tex:"H", name:"融合表示 · Fused embedding",
           formula:"H=\\beta\\,Z^{(t)}+(1-\\beta)\\,Z^{(a)},\\quad \\|H_i\\|_2=1",
           desc:"论文 Eq.14：先做分支线性变换 $Z=HW$，再按 $\\beta$ 加权融合；融合后每行做 L2 归一化 $\\|H_i\\|_2=1$。\n$\\beta$ 控制两条分支的混合比例（同质图偏大、异质图偏小）。\n最终 k-means 和所有损失都作用在 $H$ 上。",
           role:"最终嵌入" },

  "alpha":{ tex:"\\alpha", name:"扩散步长 · Teleport (branch)",
           formula:"H^{(\\ell+1)}=\\alpha\\,\\hat A\\,H^{(\\ell)}+H_0",
           desc:"对应 APPNP 的 $(1-\\alpha_{\\text{teleport}})$ 系数。\n$\\alpha$ 大 $\\Rightarrow$ 更多邻居、更平滑；$\\alpha$ 小 $\\Rightarrow$ 更贴近初值、保结构。\n仅用于两条分支扩散 $H^{(t)}, H^{(a)}$（论文 Eq.12, Eq.13）；C-prop 另有自己的系数 $\\gamma$（见 $\\gamma$ 卡）。\nDGAC 默认 $\\alpha\\approx 0.5$。",
           role:"超参 (0, 1)，分支扩散专用" },
  "beta": { tex:"\\beta",  name:"融合系数",
           formula:"H=\\beta\\,Z^{(t)}+(1-\\beta)\\,Z^{(a)}",
           desc:"$\\beta\\in(0,1)$，论文 Eq.14 的融合权重。\n同质图（Cora, Citeseer）最优 $\\beta$ 偏大 —— 拓扑更可信。\n异质图（Texas, Wisconsin）最优 $\\beta$ 偏小 —— 属性更可信。\n是 DGAC graph-agnostic 的旋钮。",
           role:"超参 (0, 1)" },
  "L":    { tex:"L",  name:"扩散层数",
           formula:"\\ell=0,1,\\dots,L-1",
           desc:"APPNP 风格迭代次数。\n感受野 $\\approx L$ 跳。\n太大会 over-smoothing，但 DGAC 靠 residual $H_0$ 相对耐折磨。",
           role:"超参" },
  "Lc":   { tex:"L_c", name:"C-prop 层数 · C-prop depth",
           formula:"C^{(\\ell+1)}=\\gamma\\,\\hat A\\,C^{(\\ell)}+C_0,\\quad \\ell<L_c",
           desc:"簇分配扩散的迭代次数。\n论文 Eq.16 的迭代形式（闭式是 $C=\\sum_{\\ell=0}^{L_c}\\gamma^\\ell\\hat A^\\ell C^{(0)}$）。\n小数据集 $L_c\\in\\{2,3\\}$ 足够。\n这是 DGAC 的标志性设计：让分配本身在图上扩散。",
           role:"超参" },

  "C0":   { tex:"C_0", name:"初始硬分配 · Initial NCI",
           formula:"C_0=\\mathrm{one\\_hot}\\bigl(\\mathrm{k\\text{-}means}(H,K,\\cos)\\bigr)",
           desc:"论文 Section 5.2 / Eq.16 的初始簇分配 $C^{(0)}$。\n第一次余弦 k-means 得到的 one-hot 矩阵 $\\in\\{0,1\\}^{N\\times K}$。\n可能含噪声（误分配节点），但随后的 C-prop 会用邻居投票「纠错」。",
           role:"中间量" },
  "C":    { tex:"C", name:"软分配矩阵 · Soft assignment",
           formula:"C=\\sum_{\\ell=0}^{L_c}\\gamma^\\ell\\,\\hat A^\\ell\\,C^{(0)}",
           desc:"论文 Eq.16 —— C-prop 扩散后的软分配 $\\in[0,1]^{N\\times K}$，每行近似概率。\n被多数邻居属于某簇的节点会被自动「拉回」正确簇。\n这个过程不涉及梯度。\n系数是 $\\gamma$ 不是分支扩散的 $\\alpha$（见 $\\gamma$ 卡）。",
           role:"中间量" },
  "Xprop":{ tex:"X_{\\text{prop}}", name:"扩散后的特征",
           formula:"X_{\\text{prop}}=\\mathrm{SVD}_d\\!\\left(\\sum_\\ell \\alpha^\\ell\\,\\hat A^{\\,\\ell}\\hat X\\right)",
           desc:"对 $\\hat X$ 做 $L$ 步扩散再做 SVD，作为 $H$ 的自监督对齐目标。\n相当于「用图平滑过的特征」当无标签的 teacher。\n论文 $\\mathcal L_{\\text{recons}}$ 里用的是 $\\hat X=PQ$（$\\bar X=PQR^\\top$ 的 SVD 两项），而不是 $X_{\\text{prop}}$；playground 两者都保留，$X_{\\text{prop}}$ 是更贴近扩散动力学的 teacher。",
           role:"自监督目标" },
  "mu":   { tex:"\\mu\\equiv \\bar H", name:"簇中心 · Cluster centroid",
           formula:"\\bar H_k=\\tfrac{1}{|C_k|}\\sum_{v_i\\in C_k}H_i\\;\\in\\;\\mathbb R^d",
           desc:"论文 Eq.19 里的 $\\bar H_k$ —— 第 $k$ 个簇的平均节点表示（簇中心）。\nplayground 内部简化写成矩阵形式 $\\mu = C^\\top H$（如果 $C$ 已归一化，结果等价）。\n训练时用 $\\cos(H_i, \\bar H_k)/\\tau$ 度量节点到中心的相似度，驱动 $\\mathcal L_{\\text{cluster}}$。",
           role:"中间量" },
  "tau":  { tex:"\\tau", name:"对比温度 · Contrastive temperature",
           formula:"\\mathrm{softmax}(\\cos(H_i,\\bar H_k)/\\tau)",
           desc:"论文 Eq.19 的对比学习温度。\n$\\tau$ 小 $\\Rightarrow$ 分布尖、分类边界硬，推开负对更用力。\n$\\tau$ 大 $\\Rightarrow$ 分布平、鼓励多样性。\n典型值 $\\tau\\approx 0.5$。",
           role:"超参 (L_cluster)" },
  "epsilon":{ tex:"\\epsilon", name:"锐化指数 · Sharpening exponent",
           formula:"\\mathcal L_{\\text{recons}}=\\tfrac{1}{n}\\sum_i(1-\\cos(H_i,\\hat X_i))^{\\epsilon}",
           desc:"$\\epsilon\\ge 1$ 时，余弦距离小的 easy 样本损失趋近 $0$，难样本被放大。\n类似 focal loss 的思想。\n论文 Eq.20 使用 $\\epsilon$ 作为 Scaled Cosine Error 的锐化指数（playground 早期版本误用 $\\gamma$，现已对齐论文）。",
           role:"超参 (L_recons)" },
  "gamma":{ tex:"\\gamma", name:"C-prop 衰减系数 · C-prop teleport",
           formula:"C=\\sum_{\\ell=0}^{L_c}\\gamma^\\ell\\,\\hat A^\\ell\\,C^{(0)}",
           desc:"论文 Eq.16 专用，与分支扩散的 $\\alpha$ 区分开。\n$\\gamma\\in[0,1]$ 越大 $\\Rightarrow$ 更相信邻居投票；越小 $\\Rightarrow$ 更信任初始 k-means 分配。\nplayground 的 toy 实现里把它并入 $\\alpha$ 滑块（共享），但论文中是独立超参。",
           role:"超参 (C-prop)" },

  "Lrecons":{ tex:"\\mathcal L_{\\text{recons}}", name:"重建损失 · Reconstruction",
           formula:"\\mathcal L_{\\text{recons}}=\\tfrac{1}{n}\\sum_{v_i\\in V}\\bigl(1-\\cos(H_i,\\,\\hat X_i)\\bigr)^{\\epsilon}",
           desc:"Scaled Cosine Error —— 让融合表示 $H$ 与 L2 归一化特征 $\\hat X$ 在余弦上对齐（论文 Eq.20）。\n$\\epsilon\\ge 1$ 是锐化参数，放大难样本。\n保障训练过程保留输入属性信息。",
           role:"损失项（3 个顶层之一）" },
  "Lcluster":{ tex:"\\mathcal L_{\\text{cluster}}", name:"聚类损失 · Clustering",
           formula:"\\mathcal L_{\\text{cluster}}=-\\tfrac{1}{n}\\sum_k\\sum_{v_i\\in C_k}\\log\\frac{\\exp(\\cos(H_i,\\bar H_k)/\\tau)}{\\sum_{j\\ne k}\\exp(\\cos(H_i,\\bar H_j)/\\tau)}",
           desc:"InfoNCE 式（论文 Eq.19）：把每个节点拉向自己的簇中心 $\\bar H_k$（正对），推开其他簇中心（负对）。\n$\\tau$ 是对比温度。\n增强簇内内聚性 + 簇间分离。",
           role:"损失项（3 个顶层之一）" },
  "Lcont": { tex:"\\mathcal L_{\\text{cont}}", name:"分层对比损失 · Hierarchical Contrastive",
           formula:"\\mathcal L_{\\text{cont}}=w_{\\text{dec}}\\,\\mathcal L_{\\text{dec}}+w_{\\text{cont}}\\bigl(\\mathcal L_{\\text{nod}}+\\mathcal L_{\\text{nei}}+\\mathcal L_{\\text{clu}}\\bigr)",
           desc:"论文 Eq.18 — 三粒度对比 + 去相关：\n· $\\mathcal L_{\\text{nod}}$（节点级）：两分支节点表示对齐 $\\|Z^t-Z^a\\|_F^2$\n· $\\mathcal L_{\\text{nei}}$（邻居级）：邻居聚合表示对齐\n· $\\mathcal L_{\\text{clu}}$（簇级）：簇中心对齐\n· $\\mathcal L_{\\text{dec}}$：去相关正则（见 $\\mathcal L_{\\text{dec}}$ 卡）",
           role:"损失项（3 个顶层之一，复合）" },
  "Ldec":  { tex:"\\mathcal L_{\\text{dec}}", name:"去相关正则 · Decorrelation",
           formula:"\\mathcal L_{\\text{dec}}=\\bigl\\|Z^{(t)\\top} Z^{(t)}-I\\bigr\\|_F^{\\,2}+\\bigl\\|Z^{(a)\\top} Z^{(a)}-I\\bigr\\|_F^{\\,2}",
           desc:"迫使两分支表示 $Z^{(t)}, Z^{(a)}$ 的列近似正交 $\\Rightarrow$ 避免坍缩到低秩子空间。\nplayground 简化版：只对融合后的 $H$ 做 $\\|H^\\top H-I\\|_F^2$。\n在 $\\mathcal L_{\\text{cont}}$ 内以 $w_{\\text{dec}}$ 加权。",
           role:"L_cont 的子项" },
  "Lnod":  { tex:"\\mathcal L_{\\text{nod}}", name:"节点级一致性 · Node-level",
           formula:"\\mathcal L_{\\text{nod}}=\\bigl\\|Z^{(t)}-Z^{(a)}\\bigr\\|_F^{\\,2}",
           desc:"论文 Eq.18 子项之一 —— 两分支在每个节点上直接对齐。\n最粗暴的一致性：要求同一个节点在两个视角下的表示相似。\nplayground 简化：对 $H^{(t)}, H^{(a)}$ 直接做 $\\mathrm{MSE}$（跳过 $W$ 变换）。",
           role:"L_cont 的子项（节点级）" },
  "Lnei":  { tex:"\\mathcal L_{\\text{nei}}", name:"邻居级一致性 · Neighbor-level",
           formula:"\\mathcal L_{\\text{nei}}=\\sum_{v_i\\in V}\\Bigl\\|Z^{(t)}_i-\\tfrac{1}{d(v_i)}\\sum_{v_j\\in N(v_i)}Z^{(a)}_j\\Bigr\\|^2",
           desc:"论文 Eq.18 子项之一 —— 让拓扑分支的某节点表示对齐属性分支在其邻居上的平均。\n捕捉邻居级别的 semantic invariance。",
           role:"L_cont 的子项（邻居级）" },
  "Lclu":  { tex:"\\mathcal L_{\\text{clu}}", name:"簇级一致性 · Cluster-level",
           formula:"\\mathcal L_{\\text{clu}}=\\sum_k\\sum_{v_i\\in C_k}\\bigl\\|Z^{(t)}_i-\\bar Z^{(a)}_k\\bigr\\|^2,\\quad \\bar Z^{(a)}_k=\\tfrac{1}{|C_k|}\\sum_{v_i\\in C_k}Z^{(a)}_i",
           desc:"论文 Eq.18 子项之一 —— 两分支在簇中心层面对齐。\n把每个节点的拓扑表示拉向它所在簇在属性分支下的中心。\n最粗粒度的一致性。",
           role:"L_cont 的子项（簇级）" },
  "I":    { tex:"I", name:"单位矩阵", formula:"I\\in\\mathbb R^{d\\times d}",
           desc:"$d\\times d$ 单位矩阵。仅在正交正则 $\\mathcal L_{\\text{ort}}$ 里出现。", role:"常量" },

  // ---- Operators & functions ----
  "eigd": { tex:"\\text{top-}d\\,\\mathrm{eigvec}", name:"前 d 个特征向量 · Top-d eigenvectors",
           formula:"\\mathrm{top\\text{-}}d\\,\\mathrm{eigvec}(M)=\\bigl[v_1,\\dots,v_d\\bigr],\\quad Mv_k=\\lambda_k v_k,\\;\\lambda_1\\ge\\dots\\ge\\lambda_d",
           desc:"方阵 $M$ 的前 $d$ 大特征值对应的特征向量按列拼接成的 $n\\times d$ 矩阵（特征值降序）。\n在 DGAC 中用来算 $B=\\mathrm{top\\text{-}}d\\,\\mathrm{eigvec}(\\hat A)$：属性分支初值 $B$ 是归一化邻接 $\\hat A$ 的前 $d$ 个特征向量。\n对称矩阵（如 $\\hat A$）用对称特征分解算法（一般 $O(n^3)$；大图上用 Lanczos / 随机化方法加速到 $O(nnzd)$）。\n和 $\\mathrm{SVD}_d$ 的对比：\n  · $\\mathrm{SVD}_d(M)$：对任意 $n\\times m$ 矩阵取前 $d$ 个左奇异向量\n  · $\\mathrm{top\\text{-}}d\\,\\mathrm{eigvec}(M)$：只对方阵（通常对称），取前 $d$ 个特征向量\n对称矩阵时 $\\mathrm{eigvec}=\\mathrm{SVD}$ 的左奇异向量（等价），但后者数值实现在非对称时仍有效。",
           role:"线代算子" },
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
  "Nset": { tex:"\\mathcal N(v_i)", name:"邻居集合 · Neighbor set",
           formula:"\\mathcal N(v_i)=\\{v_j : (v_i,v_j)\\in E\\}",
           desc:"论文 Sec. 3.1 —— 节点 $v_i$ 的邻居集合。\n在 $\\mathcal L_{\\text{nei}}$ 中用来对邻居的属性分支表示做平均：$\\tfrac{1}{d(v_i)}\\sum_{v_j\\in\\mathcal N(v_i)}Z^{(a)}_j$。\n无向图下 $\\mathcal N$ 对称：$v_j\\in\\mathcal N(v_i)\\Leftrightarrow v_i\\in\\mathcal N(v_j)$。",
           role:"图结构" },
  "dv":   { tex:"d(v_i)", name:"节点度 · Node degree",
           formula:"d(v_i)=|\\mathcal N(v_i)|=\\textstyle\\sum_j A_{ij}",
           desc:"论文 Sec. 3.1 —— 节点 $v_i$ 的度数（邻居个数）。\n注意区分矩阵形式的 $D$：$D=\\mathrm{diag}(d(v_1),\\dots,d(v_N))$。\n在 $\\mathcal L_{\\text{nei}}$ 里 $1/d(v_i)$ 用于归一化邻居聚合。",
           role:"标量（每节点）" },
  "Atilde":{ tex:"\\tilde A", name:"paper 的归一化邻接（无自环）",
           formula:"\\tilde A=D^{-1/2}\\,A\\,D^{-1/2}",
           desc:"论文 Sec. 3.1 定义的对称归一化邻接矩阵（无自环，$D$ 是 $A$ 的度矩阵）。\nplayground 为匹配 GCN / PyG 约定改用 $\\hat A=D^{-1/2}(A+I)D^{-1/2}$（有自环），在同质小图上差异很小。\n出现场合：论文 Eq.12 扩散、Laplacian $L=I-\\tilde A$、Eq.16 C-prop。",
           role:"paper 版归一化邻接" },
  "Lap":  { tex:"L", name:"拉普拉斯矩阵 · Laplacian",
           formula:"L=D-A,\\quad \\text{normalized: }L_{\\text{sym}}=I-\\tilde A",
           desc:"论文 Sec. 3.1 / Sec. 4.1 —— 用于 Dirichlet Energy 的定义：$\\mathcal D(x,A)=x^\\top L x$（见 DE 卡）。\nDGAC 的理论分析都建立在最小化 DE 之上（Sec. 4.1）。\nplayground 不直接显式使用 $L$，但它是 $\\tilde A$ / $\\hat A$ 扩散动力学的对称对偶。",
           role:"paper 理论基础" },
  "DE":   { tex:"\\mathcal D", name:"狄利克雷能量 · Dirichlet Energy",
           formula:"\\mathcal D(x,A)=\\tfrac{1}{2}\\sum_{v_i,v_j\\in V}A_{ij}\\,(x_i-x_j)^2=x^\\top L\\,x",
           desc:"论文 Definition 1 (Sec. 4.1) —— 节点信号 $x\\in\\mathbb R^n$ 在图 $A$ 上的光滑度度量。\n$\\mathcal D$ 小 $\\Rightarrow$ 相邻节点信号相近；$\\mathcal D$ 大 $\\Rightarrow$ 相邻差异大。\n多维信号 $X\\in\\mathbb R^{n\\times d}$ 时按列累加：$\\mathcal D(X, A)=\\mathrm{trace}(X^\\top L X)$。\n是 DGAC 整个理论框架的核心：\n  · $\\mathcal D(H_{\\cdot i},\\tilde A)+\\mathcal D(H_{\\cdot i},\\tilde S)$：DGDN 双图联合目标（见 Eq9DGDN 卡，点击 Related 的 [Eq.9 DGDN 目标]）\n  · $\\mathcal D(C_{\\cdot k},\\Lambda)+\\mathcal D(C_{\\cdot k},\\tilde A)$：GDC 聚类目标（见 Eq8GDC 卡）\nLemma 2 给出 $\\mathcal D$ 和 homophily ratio 的解析联系。",
           role:"paper 核心目标函数" },
  "Eq9DGDN":{ tex:"\\text{Eq.9 (DGDN)}", name:"DGDN 双图联合目标 · Eq.9",
           formula:"\\min_{H^\\top H=I}\\;\\textstyle\\sum_{i=1}^d \\mathcal D(H_{\\cdot i},\\tilde A)+\\mathcal D(H_{\\cdot i},\\tilde S)",
           desc:"论文 Eq.9 —— DGDN 的核心优化问题：同时最小化节点表示 $H$ 在拓扑图 $\\tilde A$ 和属性图 $\\tilde S$ 上的 Dirichlet Energy。\n直观：让 $H$ 在两张图上都 smooth（邻居表示接近）。\n解耦策略：拆成两个子问题（Eq.10 和 Eq.11），各自 smoothing 得 $H^{(t)}$ 和 $H^{(a)}$，再做线性变换 $Z=HW$ 后融合（Eq.14）。\n约束 $H^\\top H = I$：保证列正交（Stiefel manifold），避免平凡解。\n这是 DGAC 引入双图 smoothing 的总体目标。",
           role:"paper 理论目标（分支）" },
  "Eq8GDC": { tex:"\\text{Eq.8 (GDC)}", name:"GDC 聚类目标 · Eq.8",
           formula:"\\min_C\\;\\textstyle\\sum_{k=1}^K (1-\\gamma)\\,\\mathcal D(C_{\\cdot k},\\Lambda)+\\gamma\\,\\mathcal D(C_{\\cdot k},\\tilde A)",
           desc:"论文 Eq.8 —— GDC（Graph Diffusion Clustering）的聚类目标：以簇指示矩阵 $C$ 为变量，同时最小化 $C$ 在输入图 $\\tilde A$ 和表示空间的 affinity 图 $\\Lambda=HH^\\top$ 上的 DE。\n$\\gamma\\in[0,1]$ 平衡两者：$\\gamma$ 大偏向原图拓扑，$\\gamma$ 小偏向表示空间 affinity。\n解出来是 Lemma 5 → Eq.16：$C=\\sum_{\\ell=0}^{L_C}\\gamma^\\ell\\tilde A^\\ell C^{(0)}$（C-prop 扩散形式）。\n这里的 $\\gamma$ 就是 C-prop 的衰减系数（和分支扩散的 $\\alpha$ 独立）。",
           role:"paper 理论目标（聚类）" },
  "Eq5Unify":{ tex:"\\text{Eq.5}", name:"DE 统一框架 · Unified DE",
           formula:"\\mathrm{trace}(C^\\top(I-\\tilde A)C)=\\textstyle\\sum_{k=1}^K \\mathcal D(C_{\\cdot k},\\tilde A),\\quad \\mathrm{trace}(H^\\top(I-\\tilde A)H)=\\textstyle\\sum_{i=1}^d \\mathcal D(H_{\\cdot i},\\tilde A)",
           desc:"论文 Eq.5 (Sec. 4.1) 的关键 insight —— 谱聚类 (Eq.3) 和 GNN Laplacian smoothing (Eq.4) 的 trace 目标都可以改写成 DE 之和。\n这意味着：\n  · 谱聚类 = 在图上最小化类指示矩阵 $C$ 的 DE\n  · GNN = 在图上最小化节点表示 $H$ 的 DE\n两者本质一致，只是作用对象不同（$C$ vs $H$）。\nDGAC 把这两件事合成一个统一框架：同时最小化 $H$ 的 DE（→ DGDN / Eq.9）和 $C$ 的 DE（→ GDC / Eq.8）。",
           role:"paper 理论统一" },
  "Lemma2HR":{ tex:"\\text{Lemma 2}", name:"同质率 ↔ DE 关系 · HR ↔ DE",
           formula:"HR_{\\mathcal G}=\\tfrac{1}{2}-\\tfrac{1}{|E|}\\textstyle\\sum_{k=1}^K \\mathcal D(Y_{\\cdot k},A)",
           desc:"论文 Lemma 2 (Sec. 4.1) —— 图的同质率 $HR$ 等于 $1/2$ 减去真实类指示矩阵 $Y$（NCI 归一化）的 DE 之和（按边数归一）。\n直观：$Y$ 在图上越 smooth（DE 越小）$\\Rightarrow$ 相邻节点越倾向同类 $\\Rightarrow$ HR 越高。\nDGAC 敢声称 graph-agnostic 的理论锚点：\n  · 最小化 DE ≡ 在对应图上提升同质性\n  · 异质图上原图 $HR_{\\mathcal G}$ 低（Texas 0.108）$\\Rightarrow$ 难找到低 DE 的 $H$\n  · 但属性图 $HR_{\\mathcal H}$ 可能很高（Texas 0.422，Table 2）$\\Rightarrow$ 属性侧 smoothing 仍能捕捉簇结构",
           role:"paper 核心理论连接" },
  "HR":    { tex:"HR_{\\mathcal G}", name:"同质率 · Homophily Ratio",
           formula:"HR_{\\mathcal G}=\\tfrac{1}{|E|}\\textstyle\\sum_{(v_i,v_j)\\in E}\\mathbb 1[y_{v_i}=y_{v_j}]",
           desc:"图的同质率（论文 Sec. 4.1）—— 边两端同类标签的比例，$\\in[0,1]$：\n  · $\\approx 1$：完美同质（Cora $0.810$，Citeseer $0.739$）—— 相邻几乎同类，传统 GNN 友好\n  · $\\approx 0.5$：随机\n  · $\\to 0$：强异质（Texas $0.108$）—— 相邻几乎必异类，传统 GNN 失效\nDGAC 构造：属性图 $\\mathcal H$ 的 HR 往往高于原图 $\\mathcal G$（Table 2：Texas $HR_{\\mathcal G}=0.108 \\to HR_{\\mathcal H}=0.422$）$\\Rightarrow$ 在 $\\tilde S$ 上 smoothing 还有希望。\nLemma 2 把 HR 和 DE 解析联系起来（见 Lemma2HR 卡）。",
           role:"图的性质" },
  "D":    { tex:"D", name:"度对角矩阵 · Degree matrix",
           formula:"D=\\mathrm{diag}\\bigl(d(v_1),\\dots,d(v_N)\\bigr),\\quad D_{ii}=d(v_i)=\\textstyle\\sum_j A_{ij}",
           desc:"论文 Sec. 3.1 —— 对角矩阵，第 $i$ 个对角元是节点 $v_i$ 的度 $d(v_i)=|\\mathcal N(v_i)|$，非对角元全为 $0$。\n直观：节点连得越密 $\\Rightarrow$ 对角元越大；孤立节点对角元为 $0$（导致 $D^{-1/2}$ 数值问题，GCN 靠自环 $A+I$ 避免）。\n\n四大用途（均为对称归一化的 building block）：\n  · $\\tilde A=D^{-1/2}AD^{-1/2}$：paper 归一化邻接（Sec. 3.1）\n  · $L=D-A$：拉普拉斯；归一化版 $L_{\\text{sym}}=I-\\tilde A$\n  · $\\bar X=\\mathrm{diag}(d)^{-1/2}X$：度归一化特征，$U=\\mathrm{SVD}_d(\\bar X)$ 用（Lemma 3）\n  · $\\mathcal D(x,A)=x^\\top Lx$ 里的 $L$ 间接依赖 $D$\n\n为什么 $D^{-1/2}$（而不是 $D^{-1}$）？\n  · $D^{-1}A$ 是 row-stochastic 的随机游走矩阵，但不对称，谱分析不方便\n  · $D^{-1/2}AD^{-1/2}$ 保持对称，特征值 $\\in[-1,1]$，扩散迭代稳定\n\nplayground vs paper 差异：\n  · 这里 $D$ 跟随 paper 约定（$A$ 的度，无自环）\n  · playground 的 $\\hat A$ 里用的是 $\\tilde D=\\mathrm{diag}(\\sum_j(A+I)_{ij})$（$A+I$ 的度），与这里的 $D$ 差 $+1$\n  · 在大多数非 pathological 图上，两种约定的下游结果几乎一致",
           role:"预处理" },
  "softmax":{ tex:"\\mathrm{softmax}", name:"Softmax",
           formula:"\\mathrm{softmax}(z)_k=\\frac{\\exp z_k}{\\sum_j\\exp z_j}",
           desc:"把 logits 转成概率。\n温度 $\\tau$ 出现在 $\\mathcal L_{\\text{km}}$ 的 $\\mathrm{softmax}(H\\mu^\\top/\\tau)$ 里：$\\tau$ 小 $\\Rightarrow$ 更尖、更接近 one-hot；$\\tau$ 大 $\\Rightarrow$ 更平。",
           role:"激活" },
  "SigmaK":{ tex:"\\sum_{\\ell=0}^{L-1}", name:"扩散累加",
           formula:"H^{(L)}=\\sum_{\\ell=0}^{L-1}\\alpha^\\ell\\,\\hat A^{\\,\\ell}\\,H_0",
           desc:"APPNP 迭代 $H^{(\\ell+1)}=\\alpha\\hat A H^{(\\ell)}+H_0$ 展开后的闭式。\n几何级数的权重 $\\alpha^\\ell$ 保证收敛（$\\|\\hat A\\|\\le 1$, $\\alpha<1$）。",
           role:"展开式" },

  // ---- SVD internals (referenced in SVD_d definition) ----
  "Msvd": { tex:"M", name:"SVD 的输入矩阵",
           formula:"M\\in\\mathbb R^{N\\times N}\\;\\text{或}\\;\\mathbb R^{N\\times F}",
           desc:"SVD 的泛指输入矩阵。\n在 DGAC 里具体是 $\\hat A$（拓扑分支）、$\\hat S$（属性分支）、或 $\\sum_\\ell \\alpha^\\ell \\hat A^\\ell \\hat X$（X-prop）。",
           role:"SVD 输入" },
  "Ud":   { tex:"U_d", name:"左奇异向量",
           formula:"U_d\\in\\mathbb R^{N\\times d}",
           desc:"SVD 中前 $d$ 个左奇异向量组成的矩阵。\n每列是 $M M^\\top$ 的特征向量（按特征值递减排列）。\n是 $\\mathrm{SVD}_d$ 输出的核心：$H_0 = U_d\\,\\Sigma_d^{1/2}$。",
           role:"SVD 内部" },
  "Sigd": { tex:"\\Sigma_d", name:"奇异值对角阵",
           formula:"\\Sigma_d=\\mathrm{diag}(\\sigma_1,\\dots,\\sigma_d),\\;\\sigma_1\\ge\\dots\\ge\\sigma_d\\ge 0",
           desc:"对角线上是 $M$ 的前 $d$ 个最大奇异值 $\\sigma_i$。\n$\\mathrm{SVD}_d$ 取 $\\Sigma_d^{1/2}$，把奇异值的平方根吸收到左奇异向量上作为最终表示。",
           role:"SVD 内部" },
  "Vd":   { tex:"V_d", name:"右奇异向量",
           formula:"V_d\\in\\mathbb R^{N\\times d}",
           desc:"SVD 中前 $d$ 个右奇异向量组成的矩阵。\n每列是 $M^\\top M$ 的特征向量。\n在 $\\mathrm{SVD}_d(M)=U_d\\Sigma_d^{1/2}$ 里不直接参与输出，但出现在完整分解 $M\\approx U_d\\Sigma_d V_d^\\top$ 中。",
           role:"SVD 内部" },
};

// Chips shown at the bottom of each popover — click to drill into a related symbol.
// Rule: RELATED[sym] contains ONLY the GLOSSARY keys that literally appear in sym's Definition
// formula (so every chip explains a character the reader just saw). Generic math letters
// (M, u, v, x, σ, W, b, etc.) that aren't modelled as their own entries are skipped.
const RELATED = {
  X:      ["N","F"],                           // X ∈ ℝ^{N×F}, X_i = attr(v_i)
  A:      ["N","Atilde","D","Nset"],           // A ∈ {0,1}^{N×N}, derived from E
  N:      [],                                   // N = |V|
  F:      ["X"],                                // F = dim(X_i)
  K:      [],                                   // K = #clusters
  Ahat:   ["A","D","I","Atilde"],              // Â = D^{-1/2}(A+I)D^{-1/2}; compare to Ã
  Xhat:   ["X","L2"],                          // X̂_i = X_i / ||X_i||_2
  Shat:   ["Xhat","N"],                        // Ŝ = X̂X̂ᵀ ∈ ℝ^{N×N}
  H0t:    ["SVDd","barX"],                     // paper: U = SVD_d(X̄)
  barX:   ["X","dS","SVDd","Shat"],            // X̄ = diag(d)^{-1/2} X, d from S-graph
  dS:     ["Shat","X","barX","dv"],            // d_i = Σ_j S_ij (attribute affinity graph degree)
  Msvd:   ["barX","Ahat","N","F"],             // M in SVD_d(M) is X̄ (for U) or uses Ahat (for B)
  H0a:    ["eigd","Ahat","A","D"],             // paper: B = top-d eigvec(Â)
  eigd:   ["Ahat","Atilde","H0a","SVDd"],      // top-d eigvec; used for B, compare with SVDd
  Ht:     ["L","alpha","Ahat","H0t","SigmaK"], // Hᵗ = Σ α^ℓ Â^ℓ H₀ᵗ
  Ha:     ["L","alpha","Shat","H0a","SigmaK"], // Hᵃ = Σ α^ℓ Ŝ^ℓ H₀ᵃ
  Wt:     ["Ht","Zt"],                          // W^(t) maps H^(t) -> Z^(t)
  Wa:     ["Ha","Za"],                          // W^(a) maps H^(a) -> Z^(a)
  Zt:     ["Ht","Wt","H"],                      // Z^(t) = H^(t) W^(t)
  Za:     ["Ha","Wa","H"],                      // Z^(a) = H^(a) W^(a)
  H:      ["beta","Zt","Za"],                  // H = β Z^(t) + (1-β) Z^(a)
  alpha:  ["Ahat","H0t","H0a"],                // H^{ℓ+1} = α Â H^{ℓ} + H_0
  beta:   ["H","Ht","Ha"],                     // H = β Hᵗ + (1-β) Hᵃ
  L:      [],                                   // ℓ = 0,…,L-1
  Lc:     ["C","gamma","Ahat","C0"],           // C^{ℓ+1} = γ Â C^{ℓ} + C_0  (paper uses γ, not α)
  C0:     ["onehot","kmeans","H","K","cos"],   // C_0 = onehot(k-means(H, K, cos))
  C:      ["gamma","Ahat","C0","Lc"],          // C = Σ γ^ℓ Â^ℓ C^{(0)}
  Xprop:  ["SVDd","alpha","Ahat","Xhat","SigmaK"], // X_prop = SVD_d(Σ α^ℓ Â^ℓ X̂)
  mu:     ["C","H","K"],                       // μ = Cᵀ H ∈ ℝ^{K×d}
  tau:    ["softmax","H","mu"],                // softmax(H μᵀ / τ)
  epsilon:["Lrecons","cos","H","Xhat"],        // L_recons = (1-cos(H, X̂))^ε (paper Eq.20 uses ε)
  gamma:  ["Lc","C","Ahat","C0"],              // C = Σ γ^ℓ Â^ℓ C^{(0)} — C-prop coef (paper Eq.16)
  Lrecons:["cos","H","Xhat","epsilon"],
  Lcluster:["cos","H","mu","tau","K"],         // -(1/n) Σ log[exp(cos(H_i,H̄_k)/τ) / Σ exp(...)]
  Lcont:  ["Lnod","Lnei","Lclu","Ldec"],       // w_dec L_dec + w_cont (L_nod + L_nei + L_clu)
  Ldec:   ["Zt","Za","I","Frob"],              // ||Z^T Z - I||_F² per branch
  Lnod:   ["Zt","Za","Frob"],                  // ||Z^t - Z^a||_F²
  Lnei:   ["Zt","Za","Nset","dv","L2"],        // neighbor-level invariance; 1/d(v_i) sum over N(v_i)
  Lclu:   ["Zt","Za","C","K","L2"],            // cluster-level invariance
  Nset:   ["A","dv","Lnei"],                    // N(v_i) derives from E (via A)
  dv:     ["Nset","A","D"],                     // d(v_i) = |N(v_i)| = Σ_j A_ij
  Atilde: ["A","D","Ahat"],                     // paper version without self-loop
  Lap:    ["D","A","Atilde","DE"],             // L = D - A; used in DE = x^T L x
  DE:     ["Eq9DGDN","Eq8GDC","Eq5Unify","Lemma2HR","Lap","Atilde","Shat","H","C"], // DE is the theoretical core
  Eq9DGDN:["DE","Atilde","Shat","Ht","Ha","H"],
  Eq8GDC: ["DE","Atilde","C","gamma","Lap"],
  Eq5Unify:["DE","Atilde","Lap","H","C"],
  Lemma2HR:["HR","DE","Atilde","Shat"],
  HR:     ["Lemma2HR","DE","Atilde","Shat"],
  I:      [],                                   // I ∈ ℝ^{d×d}
  SVDd:   ["Msvd","Ud","Sigd","Vd"],           // M ≈ U_d Σ_d V_dᵀ; SVD_d(M) = U_d Σ_d^{1/2}
  Ud:     ["N"],                               // U_d ∈ ℝ^{N×d}
  Sigd:   [],                                  // Σ_d = diag(σ_1,…,σ_d)
  Vd:     ["N"],                               // V_d ∈ ℝ^{N×d}
  MLP:    [],                                  // MLP(x) = W_2 σ(W_1 x + b_1) + b_2  (generic W/b/σ)
  kmeans: ["mu","cos","H"],                    // min_μ Σ (1 - cos(H_i, μ_{c(i)}))
  onehot: [],                                  // piecewise (generic c)
  cos:    ["L2"],                              // u^T v / (||u|| ||v||)  (u,v generic)
  argmax: ["C","K"],                           // ŷ_i = argmax_k C_{ik}, k ∈ {1,…,K}
  CE:     [],                                  // CE(z, y) (z,y generic)
  MSE:    ["N","L2"],                          // (1/N) Σ ||X_i - Y_i||_2²  (X,Y generic)
  Frob:   [],                                  // ||M||_F (M generic)
  L2:     [],                                  // ||x||_2 (x generic)
  D:      ["dv","A","Atilde","Lap","barX","Ahat"], // D_ii = d(v_i); used in Ã, L, X̄, Â
  softmax:[],                                  // softmax(z)_k (z generic)
  SigmaK: ["L","alpha","Ahat"],                // H^{(L)} = Σ α^ℓ Â^ℓ H_0
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
  const [expandedIds, setExpandedIds] = useStateF([]);
  const popRef = useRefF(null);
  const prevLenF = useRefF(0);
  useEffectF(() => { setExpandedIds([]); if (popRef.current) popRef.current.scrollTop = 0; prevLenF.current = 0; }, [id]);
  // Auto-scroll to newest expansion block when user pushes a new one.
  useEffectF(() => {
    if (expandedIds.length > prevLenF.current && popRef.current) {
      requestAnimationFrame(() => {
        if (!popRef.current) return;
        const blocks = popRef.current.querySelectorAll('[data-exp-block]');
        const newest = blocks[blocks.length - 1];
        if (newest) {
          popRef.current.scrollTo({
            top: Math.max(0, newest.offsetTop - 60),
            behavior: 'smooth'
          });
        }
      });
    }
    prevLenF.current = expandedIds.length;
  }, [expandedIds]);
  // Main chip: toggle membership.  Nested chip: push (add if absent).  X button: remove.
  const toggleExp = (k) => setExpandedIds(prev => {
    const i = prev.indexOf(k);
    if (i === -1) return [...prev, k];
    return [...prev.slice(0, i), ...prev.slice(i + 1)];
  });
  const pushExp = (k) => setExpandedIds(prev => prev.includes(k) ? prev : [...prev, k]);
  const removeExp = (k) => setExpandedIds(prev => prev.filter(x => x !== k));
  if (!id || !anchor) return null;
  const e = GLOSSARY[id]; if (!e) return null;
  const r = anchor.getBoundingClientRect();
  const W = 380;
  const MARGIN = 12;
  const left = Math.min(window.innerWidth - W - MARGIN, Math.max(MARGIN, r.left - 10));
  // Prefer below anchor; else above; else full-height. maxH = actual available space so
  // the popover's bottom edge never exceeds viewport (internal scroll takes over).
  const spaceBelow = window.innerHeight - r.bottom - MARGIN - 10;
  const spaceAbove = r.top - MARGIN - 10;
  let top, maxH;
  if (spaceBelow >= 280) {
    top = r.bottom + 10;
    maxH = spaceBelow;
  } else if (spaceAbove >= 280) {
    maxH = spaceAbove;
    top = r.top - maxH - 10;
  } else {
    top = MARGIN;
    maxH = window.innerHeight - 2 * MARGIN;
  }
  const parts = e.desc.split("\n");
  const [zh, en] = e.name.split(" · ");
  const content = (
    <div ref={popRef} onClick={ev=>ev.stopPropagation()}
      onWheel={ev => ev.stopPropagation()}
      style={{
        position:"fixed", left, top, width:W, zIndex:9999,
        maxHeight: maxH, overflowY:"auto", overscrollBehavior:"contain",
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

      {/* related symbols — stacked inline expansion */}
      {(() => {
        const rels = (RELATED[id] || []).filter(k => GLOSSARY[k]);
        if (!rels.length) return null;
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
                const isExp = expandedIds.includes(k);
                return (
                  <button key={k}
                    onClick={ev => { ev.stopPropagation(); toggleExp(k); }}
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

            {/* stacked expansion blocks — one per id in expandedIds */}
            {expandedIds.map((eid, idx) => {
              const exp = GLOSSARY[eid];
              if (!exp) return null;
              const subRels = (RELATED[eid] || []).filter(k => GLOSSARY[k]);
              return (
                <div key={eid+'-'+idx} data-exp-block={eid}
                  style={{marginTop:idx===0?14:10, padding:"12px 14px 14px",
                  background:"oklch(0.12 0.008 80)",
                  borderRadius:8,
                  border:"1px solid oklch(0.32 0.03 85)",
                  animation:"fmlFade 0.16s ease-out"}}>
                  <div style={{display:"flex", justifyContent:"space-between",
                    alignItems:"center", marginBottom:10, paddingBottom:8,
                    borderBottom:"1px dashed oklch(0.26 0.02 80)"}}>
                    <div style={{display:"flex", alignItems:"baseline", gap:8}}>
                      <span style={{fontSize:11, color:"#827d75",
                        fontFamily:"'JetBrains Mono',monospace"}}>{idx+1}.</span>
                      <span style={{fontSize:18, color:"oklch(0.94 0.1 85)"}}>
                        <Katex tex={exp.tex} display={false}/>
                      </span>
                      <span style={{fontSize:12, color:"#e6dfce", fontWeight:600}}>
                        {(exp.name||"").split(" · ")[0]}
                      </span>
                    </div>
                    <button
                      onClick={ev => { ev.stopPropagation(); removeExp(eid); }}
                      style={{
                        padding:"3px 8px",
                        background:"transparent",
                        color:"#a8a194",
                        border:"1px solid oklch(0.34 0.03 85)",
                        borderRadius:6,
                        fontSize:12,
                        cursor:"pointer",
                        lineHeight:1,
                      }}
                      title="收起这一段">×</button>
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

                  {/* nested chips — push to stack (append below) */}
                  {subRels.length > 0 && (
                    <div style={{marginTop:12, paddingTop:10,
                      borderTop:"1px dashed oklch(0.26 0.02 80)"}}>
                      <div style={{fontSize:9.5, color:"#827d75", letterSpacing:"0.18em",
                        marginBottom:8, fontFamily:"'JetBrains Mono',monospace",
                        textTransform:"uppercase"}}>继续 → 追加到下方</div>
                      <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                        {subRels.map(k => {
                          const r = GLOSSARY[k];
                          const zhName = (r.name||"").split(" · ")[0];
                          const already = expandedIds.includes(k);
                          return (
                            <button key={k}
                              onClick={ev => { ev.stopPropagation(); pushExp(k); }}
                              title={already ? `${zhName}（已展开）` : zhName}
                              disabled={already}
                              style={{
                                cursor: already ? "default" : "pointer",
                                padding:"3px 9px",
                                background: already ? "oklch(0.22 0.03 85)" : "oklch(0.18 0.008 80)",
                                color: already ? "#827d75" : "#d4cbb8",
                                border: already ? "1px solid oklch(0.32 0.04 85)" : "1px solid oklch(0.28 0.02 80)",
                                borderRadius:999,
                                fontSize:11.5,
                                display:"inline-flex",
                                alignItems:"center",
                                gap:4,
                                opacity: already ? 0.55 : 1,
                                transition:"all 0.12s",
                              }}>
                              <Katex tex={r.tex} display={false}/>
                              <span style={{fontSize:9.5,
                                color: already ? "#6a655c" : "#a8a194"}}>{zhName}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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

      <Block active={id==="input"} color="#3d3a35" eyebrow="输入 · INPUT + 理论基础"
        onOpen={open} syms={["A","X","N","F","D","Atilde","Lap","DE","Nset","dv"]}>
        <Eq hl={id==="input"}
          tex="\mathcal G=(V,\,E,\,X),\quad A_{ij}=\mathbb 1[(v_i,v_j)\in E],\quad X\in\mathbb R^{N\times F}"/>
        <Eq hl={id==="input"}
          tex="D_{ii}=\textstyle\sum_j A_{ij},\quad \tilde A=D^{-1/2}AD^{-1/2},\quad L=D-A,\quad \mathcal D(x,A)=x^\top L\,x"/>
      </Block>

      <Block active={id==="encode"} color={A_A} eyebrow="输入编码 · ENCODE（交叉模态）"
        onOpen={open} syms={["Xhat","X","L2","Shat","Ahat","barX","dS","H0t","H0a","SVDd","eigd"]}>
        <Eq hl={id==="encode"} tex="\hat X=X\,/\,\|X\|_2,\qquad \hat S=\hat X\hat X^\top,\qquad \bar X=\mathrm{diag}(d)^{-1/2}X"/>
        <Eq hl={id==="encode"}
          tex="H_0^{\,t}=U=\mathrm{SVD}_d(\bar X),\qquad H_0^{\,a}=B=\text{top-}d\,\text{eigvec}(\hat A)"/>
      </Block>

      <Block active={id==="topology"} color={A_T} eyebrow="拓扑分支 · TOP_AGG"
        onOpen={open} syms={["Ht","alpha","Ahat","H0t","L"]}
        note={`当前参数：α = ${tweaks.alpha.toFixed(2)}，L = ${tweaks.topLayers}`}>
        <Eq hl={id==="topology"}
          tex="H^{t\,(\ell+1)}\;\leftarrow\;\alpha\,\hat A\,H^{t\,(\ell)}\;+\;H_0^{\,t},\qquad \ell=0,\dots,L-1"/>
      </Block>

      <Block active={id==="attribute"} color={A_A} eyebrow="属性分支 · ATTR_AGG"
        onOpen={open} syms={["Ha","alpha","Shat","H0a"]}
        note="Ŝ 把属性相似的节点视作「虚拟邻居」，哪怕它们在 A 中无边 — 这是对异质图友好的关键。">
        <Eq hl={id==="attribute"}
          tex="H^{a\,(\ell+1)}\;\leftarrow\;\alpha\,\hat S\,H^{a\,(\ell)}\;+\;H_0^{\,a}"/>
      </Block>

      <Block active={id==="fusion"} color={A_F} eyebrow="融合 · FUSION"
        onOpen={open} syms={["H","beta","Zt","Za","Wt","Wa","Ht","Ha"]}
        note={`当前参数：β = ${tweaks.beta.toFixed(2)} · 线性变换 W^(t)/W^(a) + 加权融合 + L2 归一化`}>
        <Eq hl={id==="fusion"} tex="Z^{(t)}=H^{(t)}W^{(t)},\quad Z^{(a)}=H^{(a)}W^{(a)}"/>
        <Eq hl={id==="fusion"} tex="H=\beta\,Z^{(t)}+(1-\beta)\,Z^{(a)},\quad \|H_i\|_2=1"/>
      </Block>

      <Block active={id==="kmeans"} color={A_C} eyebrow="初始聚类 · K-MEANS"
        onOpen={open} syms={["C0","onehot","kmeans","H","K","cos"]}>
        <Eq hl={id==="kmeans"}
          tex="C_0=\mathrm{one\_hot}\bigl(\,\mathrm{k\text{-}means}(H,\,K,\,\cos)\bigr)"/>
      </Block>

      <Block active={id==="cprop"} color={A_C} eyebrow="簇分配扩散 · C-PROP ★"
        onOpen={open} syms={["C","gamma","Ahat","C0","Lc"]}
        note={`当前参数：L_c = ${tweaks.cpropLayers} · 扩散硬分配 C₀，被邻居纠正成软分配 C · 论文 Eq.16 系数是 γ（不是 α）`}>
        <Eq hl={id==="cprop"}
          tex="C^{(\ell+1)}\;\leftarrow\;\gamma\,\hat A\,C^{(\ell)}\;+\;C_0,\qquad \ell=0,\dots,L_c-1"/>
      </Block>

      <Block active={id==="loss"} color={A_L} eyebrow="自监督损失 · LOSS"
        onOpen={open} syms={["Lcont","Lnod","Lnei","Lclu","Ldec","Zt","Za","H","I","Frob","Lcluster","cos","mu","tau","K","Lrecons","Xhat","epsilon"]}>
        <Eq hl={id==="loss"}
          tex="\mathcal L=\mathcal L_{\text{cont}}+\mathcal L_{\text{cluster}}+\mathcal L_{\text{recons}}"/>
        <Eq hl={id==="loss"}
          tex="\mathcal L_{\text{cont}}=w_{\text{dec}}\,\mathcal L_{\text{dec}}+w_{\text{cont}}(\mathcal L_{\text{nod}}+\mathcal L_{\text{nei}}+\mathcal L_{\text{clu}})"/>
        <Eq hl={id==="loss"}
          tex="\mathcal L_{\text{cluster}}=-\tfrac{1}{n}\sum_k\sum_{v_i\in C_k}\log\frac{\exp(\cos(H_i,\bar H_k)/\tau)}{\sum_{j\ne k}\exp(\cos(H_i,\bar H_j)/\tau)}"/>
        <Eq hl={id==="loss"}
          tex="\mathcal L_{\text{recons}}=\tfrac{1}{n}\sum_{v_i\in V}(1-\cos(H_i,\hat X_i))^{\epsilon}"/>
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
