// Extra visual panels: loss breakdown with animation, β ablation mini-chart

const { useState: useStateX, useEffect: useEffectX, useMemo: useMemoX } = React;

function LossBarCard({ name, formula, value, color, active, pulsing }) {
  const pct = Math.max(4, Math.min(100, value*100));
  return (
    <div style={{
      background:"#fffdf7", border:`1px solid ${active?color:"#e3ddd2"}`,
      borderRadius:8, padding:"10px 12px", position:"relative",
      transition:"border-color .3s ease",
      opacity: active?1:0.7,
    }}>
      {active && pulsing && (
        <div style={{
          position:"absolute", top:0, left:0, right:0, height:2,
          background:color, borderRadius:"8px 8px 0 0",
          animation:"pulse 1.4s ease-in-out infinite",
        }}/>
      )}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
        <span style={{fontSize:11.5, fontWeight:600, color:active?color:"#3d3a35"}}>{name}</span>
        <span className="mono" style={{fontSize:10.5, color:"#827d75"}}>{value.toFixed(3)}</span>
      </div>
      <div className="mono" style={{fontSize:10.5, color:"#827d75", marginTop:4, lineHeight:1.5}}>{formula}</div>
      <div style={{height:3, background:"#f0eadf", borderRadius:2, marginTop:8, overflow:"hidden"}}>
        <div style={{
          width:`${pct}%`, height:"100%", background:color,
          transition:"width .5s ease, background .3s ease",
        }}/>
      </div>
    </div>
  );
}

function LossBreakdown({ active, tick }) {
  // simulate decreasing losses as tick increases (looping every 40)
  const t = (tick % 40) / 40;
  const decay = (lvl, base) => base * (0.4 + 0.6*Math.exp(-lvl*3*t)) * (0.9 + 0.1*Math.sin(tick*0.7+lvl));
  const C_L = "oklch(0.50 0.05 260)";
  const items = [
    { k:"L_cont",    f:"w_dec·L_dec + w_cont·(L_nod+L_nei+L_clu)",  v:decay(1.2, 0.55), color:"oklch(0.58 0.13 35)"  },
    { k:"L_cluster", f:"−(1/n) Σ log[e^{cos(H_i,H̄_k)/τ} / Σ_j e^{cos(H_i,H̄_j)/τ}]",  v:decay(0.8, 0.60), color:"oklch(0.55 0.13 150)" },
    { k:"L_recons",  f:"(1/n) Σ_i (1 − cos(H_i, X̂_i))^ε",             v:decay(1.0, 0.72), color:"oklch(0.55 0.13 300)" },
    { k:"L_dec",     f:"‖Z^(t)ᵀZ^(t) − I‖² + ‖Z^(a)ᵀZ^(a) − I‖²  (∈ L_cont)",  v:decay(0.6, 0.40), color:"oklch(0.55 0.13 250)" },
  ];
  return (
    <div style={{
      background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
      padding:"16px 18px", opacity: active?1:0.6, transition:"opacity .3s ease",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12}}>
        <span style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>损失分解 · LOSS TERMS</span>
        <span className="mono" style={{fontSize:10.5, color:active?C_L:"#a8a194"}}>
          {active ? `epoch ${tick}` : "—"}
        </span>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
        {items.map(it => (
          <LossBarCard key={it.k} name={it.k} formula={it.f} value={it.v}
            color={it.color} active={active} pulsing={active}/>
        ))}
      </div>
      <div style={{marginTop:12, fontSize:11.5, color:"#3d3a35", lineHeight:1.6}}>
        <b>L = L_cont + L_cluster + L_recons</b>（论文 Eq.17；L_dec 嵌在 L_cont 里以 w_dec 加权）—
        全部自监督，<b>不需要任何节点标签</b>。L_cont 是分层对比（节点 / 邻居 / 簇三粒度 + 去相关），L_recons 让 H 对齐 X̂（Eq.20）。
      </div>
    </div>
  );
}

// ============================================================
// HomophilyDial — drag a slider that rewires the graph in real
// time; see three baselines' accuracy react. Core message:
// pure GCN (topology-only) crashes on heterophilic graphs,
// DGAC stays stable because the attribute branch compensates.
// ============================================================
function HomophilyDial({ tweaks }){
  const [h, setH] = useStateX(0.3); // default to heterophilic so the story pops
  const N = 20;
  const K = 4;

  // Build a graph where fraction `h` of each node's edges go to same-cluster
  // neighbors, the rest to other clusters. Deterministic (seeded).
  const G = useMemoX(()=>{
    const rng = (()=>{ let s = 0xC0FFEE; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; })();
    const nodes = [];
    for (let i=0;i<N;i++) nodes.push({ id:i, cluster: Math.floor(i/5), x:0, y:0 });
    // layout: 4 clusters on a ring
    for (let c=0;c<K;c++){
      const cx = 0.5 + 0.32*Math.cos(c/K*2*Math.PI - Math.PI/2);
      const cy = 0.5 + 0.32*Math.sin(c/K*2*Math.PI - Math.PI/2);
      for (let j=0;j<5;j++){
        const n = nodes[c*5+j];
        const theta = j/5*2*Math.PI + c*0.4;
        n.x = cx + 0.11*Math.cos(theta);
        n.y = cy + 0.11*Math.sin(theta);
      }
    }
    // edges: each node picks ~3 edges; probability h → same cluster, 1-h → other
    const edgeSet = new Set();
    const edges = [];
    const addE = (a,b) => {
      if (a===b) return;
      const k = a<b?`${a}-${b}`:`${b}-${a}`;
      if (edgeSet.has(k)) return;
      edgeSet.add(k); edges.push([Math.min(a,b),Math.max(a,b)]);
    };
    for (let i=0;i<N;i++){
      for (let t=0;t<3;t++){
        const sameCluster = rng() < h;
        let pool;
        if (sameCluster) pool = nodes.filter(n=>n.cluster===nodes[i].cluster && n.id!==i).map(n=>n.id);
        else             pool = nodes.filter(n=>n.cluster!==nodes[i].cluster).map(n=>n.id);
        const j = pool[Math.floor(rng()*pool.length)];
        addE(i, j);
      }
    }
    return { nodes, edges };
  }, [h]);

  // Run three "models" on G and compute accuracy:
  //  - k-means on raw features (no graph) — baseline
  //  - GCN-like: diffuse on topology only, then k-means
  //  - DGAC: full pipeline
  const { accKmeans, accGcn, accDgac } = useMemoX(()=>{
    const M = window.DGAC_MATH;
    const truth = G.nodes.map(n=>n.cluster);
    // Weak features so topology actually has to contribute. Feature separation 0.35
    // with noise 0.45 → raw k-means only gets ~50-70%. This makes the GCN/DGAC lift
    // (and crash at low h) visible in the three-model comparison.
    const D = 6;
    const rng = (()=>{ let s=42; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; })();
    const centers = [];
    for (let c=0;c<K;c++){
      const v = new Array(D).fill(0);
      v[c] = 0.35; v[(c+2)%D] = -0.10;
      centers.push(v);
    }
    const H0 = [];
    for (let i=0;i<N;i++){
      const c = G.nodes[i].cluster;
      const v = new Array(D);
      for (let k=0;k<D;k++) v[k] = centers[c][k] + (rng()*2-1)*0.45;
      H0.push(v);
    }
    const Ahat = M.buildAhat(N, G.edges);
    const { Shat } = M.buildAttrAhat(H0, 3);

    // Model 1: k-means on H0
    const km1 = M.kmeans(H0, K);
    const acc1 = M.matchAccuracy(km1.assign, truth, K);

    // Model 2: GCN-like: diffuse on topology only, then k-means
    const Ht = M.diffuse(Ahat, H0, tweaks.alpha, tweaks.topLayers);
    const km2 = M.kmeans(Ht, K);
    const acc2 = M.matchAccuracy(km2.assign, truth, K);

    // Model 3: DGAC: both branches + fusion + cprop
    const Ha = M.diffuse(Shat, H0, tweaks.alpha, tweaks.attrLayers);
    const Hf = H0.map((_,i) => Ht[i].map((v,k) => tweaks.beta*v + (1-tweaks.beta)*Ha[i][k]));
    const km3 = M.kmeans(Hf, K);
    const refined = M.cprop(Ahat, km3.assign, K, tweaks.alpha, tweaks.cpropLayers);
    const acc3 = M.matchAccuracy(refined.assign, truth, K);

    return { accKmeans: acc1, accGcn: acc2, accDgac: acc3 };
  }, [h, tweaks.alpha, tweaks.beta, tweaks.topLayers, tweaks.attrLayers, tweaks.cpropLayers]);

  // Precompute per-h curves for the background lines (heavy — memoized on tweaks only)
  const curves = useMemoX(()=>{
    const M = window.DGAC_MATH;
    const D = 6;
    const xs = Array.from({length:11}, (_,i)=>i/10);
    const km = [], gcn = [], dgac = [];
    for (const hx of xs){
      const rng = (()=>{ let s=0xC0FFEE; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; })();
      const nodes = [];
      for (let i=0;i<N;i++) nodes.push({ cluster: Math.floor(i/5) });
      const edgeSet = new Set(), edges = [];
      const addE=(a,b)=>{ if(a===b) return; const k=a<b?`${a}-${b}`:`${b}-${a}`; if(edgeSet.has(k)) return; edgeSet.add(k); edges.push([Math.min(a,b),Math.max(a,b)]); };
      for (let i=0;i<N;i++){
        for (let t=0;t<3;t++){
          const same = rng()<hx;
          const pool = same
            ? nodes.map((n,id)=>n.cluster===nodes[i].cluster && id!==i ? id : -1).filter(x=>x>=0)
            : nodes.map((n,id)=>n.cluster!==nodes[i].cluster ? id : -1).filter(x=>x>=0);
          addE(i, pool[Math.floor(rng()*pool.length)]);
        }
      }
      const truth = nodes.map(n=>n.cluster);
      const r2 = (()=>{ let s=42; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; })();
      const centers = [];
      for (let c=0;c<K;c++){ const v=new Array(D).fill(0); v[c]=0.35; v[(c+2)%D]=-0.10; centers.push(v); }
      const H0 = [];
      for (let i=0;i<N;i++){ const c=nodes[i].cluster; const v=new Array(D); for(let k=0;k<D;k++) v[k]=centers[c][k]+(r2()*2-1)*0.45; H0.push(v); }
      const Ahat = M.buildAhat(N, edges);
      const { Shat } = M.buildAttrAhat(H0, 3);
      km.push(M.matchAccuracy(M.kmeans(H0, K).assign, truth, K));
      const Ht = M.diffuse(Ahat, H0, tweaks.alpha, tweaks.topLayers);
      gcn.push(M.matchAccuracy(M.kmeans(Ht, K).assign, truth, K));
      const Ha = M.diffuse(Shat, H0, tweaks.alpha, tweaks.attrLayers);
      const Hf = H0.map((_,i)=>Ht[i].map((v,k)=>tweaks.beta*v+(1-tweaks.beta)*Ha[i][k]));
      const km3 = M.kmeans(Hf, K);
      const ref = M.cprop(Ahat, km3.assign, K, tweaks.alpha, tweaks.cpropLayers);
      dgac.push(M.matchAccuracy(ref.assign, truth, K));
    }
    return { xs, km, gcn, dgac };
  }, [tweaks.alpha, tweaks.beta, tweaks.topLayers, tweaks.attrLayers, tweaks.cpropLayers]);

  // Layout
  const W = 560, H = 220, pad = 30;
  const xToPx = x => pad + x*(W-pad-10);
  const yToPx = y => H - pad - y*(H-pad-14);
  const line = (arr, color, dash) => (
    <path d={arr.map((y,i)=>`${i===0?"M":"L"}${xToPx(curves.xs[i])},${yToPx(y)}`).join(" ")}
      fill="none" stroke={color} strokeWidth={2.2} strokeDasharray={dash||""}/>
  );

  const CLR = {
    km:   "#a8a194",
    gcn:  "oklch(0.58 0.13 35)",
    dgac: "oklch(0.50 0.05 260)",
  };

  // node positions in SVG graph
  const Gw = 220, Gh = 220;
  const nx = x => 20 + x*(Gw-40);
  const ny = y => 20 + y*(Gh-40);

  return (
    <div style={{
      background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
      padding:"16px 18px 14px",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <span style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>同质性消融 · 实时重连</span>
        <span className="mono" style={{fontSize:10.5, color:"#827d75"}}>h = {h.toFixed(2)}</span>
      </div>
      <div style={{fontSize:11.5, color:"#3d3a35", marginBottom:10, lineHeight:1.55}}>
        拖动 <b>同质率 h</b>：邻居中同簇边的比例。<span style={{color:"oklch(0.58 0.13 35)"}}>纯 GCN</span>（只用拓扑）在异质端崩盘，<span style={{color:"oklch(0.50 0.05 260)"}}>DGAC</span> 靠属性分支稳住 — 这是论文核心论点。
      </div>

      <input type="range" min="0" max="1" step="0.05" value={h}
        onChange={e=>setH(+e.target.value)}
        style={{width:"100%", accentColor:"#1b1a18", marginBottom:10}}/>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, alignItems:"start"}}>
        {/* Left: live graph */}
        <svg viewBox={`0 0 ${Gw} ${Gh}`} style={{width:"100%", height:"auto", background:"#fbf8f1", borderRadius:6, border:"1px solid #f0eadf"}}>
          {G.edges.map(([a,b],i)=>{
            const na = G.nodes[a], nb = G.nodes[b];
            const cross = na.cluster !== nb.cluster;
            return <line key={i} x1={nx(na.x)} y1={ny(na.y)} x2={nx(nb.x)} y2={ny(nb.y)}
              stroke={cross ? "oklch(0.58 0.13 35)" : "#cfc8ba"}
              strokeWidth={cross ? 1.4 : 0.9}
              opacity={cross ? 0.75 : 0.55}/>;
          })}
          {G.nodes.map(n=>{
            const colors = ["oklch(0.55 0.13 250)","oklch(0.60 0.13 140)","oklch(0.60 0.15 60)","oklch(0.55 0.15 340)"];
            return <circle key={n.id} cx={nx(n.x)} cy={ny(n.y)} r={4.5}
              fill={colors[n.cluster]} stroke="#fffdf7" strokeWidth={1.3}/>;
          })}
          <text x={Gw-8} y={14} textAnchor="end" style={{fontSize:9, fill:"#827d75", letterSpacing:"0.08em"}}>
            跨簇边 = 橙 · 簇内边 = 灰
          </text>
        </svg>

        {/* Right: ACC curves */}
        <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto", background:"#fbf8f1", borderRadius:6, border:"1px solid #f0eadf"}}>
          {[0.25,0.5,0.75,1.0].map(y=>(
            <g key={y}>
              <line x1={pad} x2={W-10} y1={yToPx(y)} y2={yToPx(y)} stroke="#f0eadf"/>
              <text x={8} y={yToPx(y)+3} style={{fontSize:9, fill:"#a8a194", fontFamily:"'JetBrains Mono',monospace"}}>{y.toFixed(2)}</text>
            </g>
          ))}
          <line x1={pad} x2={W-10} y1={H-pad} y2={H-pad} stroke="#cfc8ba"/>
          {[0,0.25,0.5,0.75,1].map(x=>(
            <text key={x} x={xToPx(x)} y={H-10} textAnchor="middle"
              style={{fontSize:9, fill:"#827d75", fontFamily:"'JetBrains Mono',monospace"}}>{x}</text>
          ))}
          <text x={pad+4} y={12} style={{fontSize:9, fill:"#a8a194", letterSpacing:"0.08em"}}>ACC</text>
          <text x={W-10} y={H-24} textAnchor="end" style={{fontSize:9, fill:"#a8a194", letterSpacing:"0.08em"}}>
            h (同质率)
          </text>

          {line(curves.km,   CLR.km,   "3 3")}
          {line(curves.gcn,  CLR.gcn)}
          {line(curves.dgac, CLR.dgac)}

          {/* current h marker */}
          <line x1={xToPx(h)} x2={xToPx(h)} y1={pad-4} y2={H-pad}
            stroke="#1b1a18" strokeWidth="0.8" strokeDasharray="3 3"/>
          <circle cx={xToPx(h)} cy={yToPx(accKmeans)} r="3" fill={CLR.km}/>
          <circle cx={xToPx(h)} cy={yToPx(accGcn)}    r="3.5" fill={CLR.gcn} stroke="#fffdf7" strokeWidth="1"/>
          <circle cx={xToPx(h)} cy={yToPx(accDgac)}   r="4" fill={CLR.dgac} stroke="#fffdf7" strokeWidth="1.2"/>
        </svg>
      </div>

      {/* Live ACC readout */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:10}}>
        {[
          {k:"k-means",  v:accKmeans, c:CLR.km,   note:"无图"},
          {k:"纯 GCN",   v:accGcn,    c:CLR.gcn,  note:"只拓扑"},
          {k:"DGAC",     v:accDgac,   c:CLR.dgac, note:"双分支"},
        ].map(m=>(
          <div key={m.k} style={{
            background:"#fbf8f1", border:`1px solid ${m.c}33`, borderRadius:6,
            padding:"6px 10px",
          }}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
              <span style={{fontSize:11, fontWeight:600, color:m.c}}>{m.k}</span>
              <span style={{fontSize:9.5, color:"#a8a194", letterSpacing:"0.06em"}}>{m.note}</span>
            </div>
            <div className="mono" style={{fontSize:16, color:"#1b1a18", marginTop:2, letterSpacing:"-0.01em"}}>
              {(m.v*100).toFixed(1)}<span style={{fontSize:10, color:"#a8a194"}}>%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ConfidenceBars — shows the 20 nodes' C-prop soft probabilities
// as 4-slice stacked bars. As Lc grows, watch confused nodes
// either lock in or collapse (over-smoothing).
// ============================================================
function ConfidenceBars({ tweaks, dgac }){
  if (!dgac) return null;
  const N = dgac.N;
  const K = dgac.K;
  // Use soft C matrix (post-cprop) if Lc>0, else one-hot from k-means
  const C = tweaks.cpropLayers > 0 ? dgac.refined.C : (()=>{
    const arr = Array.from({length:N}, ()=>new Array(K).fill(0));
    for (let i=0;i<N;i++) arr[i][dgac.km.assign[i]] = 1;
    return arr;
  })();

  const clusterColors = [
    "oklch(0.55 0.13 250)", // blue
    "oklch(0.60 0.13 140)", // green
    "oklch(0.60 0.15 60)",  // gold
    "oklch(0.55 0.15 340)", // magenta
  ];

  // Normalize rows (cprop output may not sum to 1 exactly due to row-stoch P + residual)
  const norm = C.map(row=>{
    const s = row.reduce((a,b)=>a+b,0) || 1;
    return row.map(x=>x/s);
  });

  // entropy per node — high = confused
  const entropies = norm.map(r => {
    let h = 0;
    for (const p of r) if (p>1e-9) h -= p*Math.log2(p);
    return h;
  });
  const maxE = Math.log2(K);

  // sort nodes by entropy (most confused first) for visual emphasis
  const order = Array.from({length:N}, (_,i)=>i).sort((a,b)=>entropies[b]-entropies[a]);

  return (
    <div style={{
      background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
      padding:"16px 18px 14px",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <span style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>C-prop 置信度 · 每节点软概率</span>
        <span className="mono" style={{fontSize:10.5, color:"#827d75"}}>Lc = {tweaks.cpropLayers}</span>
      </div>
      <div style={{fontSize:11.5, color:"#3d3a35", marginBottom:10, lineHeight:1.55}}>
        每根条是一个节点在 4 个簇上的概率分布。<b>Lc 越大</b>信息在图上传得越远：
        混乱节点应该变坚定，但拉得过大会让所有节点都塌到同一簇 — <b>过度平滑</b>。
      </div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(10, 1fr)", gap:4}}>
        {order.map(i => {
          const r = norm[i];
          return (
            <div key={i} style={{position:"relative"}}>
              <div style={{
                display:"flex", height:44, borderRadius:3, overflow:"hidden",
                border:"1px solid #e3ddd2", background:"#f0eadf",
              }}>
                {r.map((p,k)=>(
                  <div key={k} style={{
                    width:`${p*100}%`,
                    background:clusterColors[k],
                    transition:"width .35s ease",
                  }}/>
                ))}
              </div>
              <div className="mono" style={{
                fontSize:8.5, color:"#a8a194", textAlign:"center",
                marginTop:2, letterSpacing:"0.04em",
              }}>
                n{i.toString().padStart(2,"0")}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex", gap:12, marginTop:10, fontSize:10.5, color:"#827d75", flexWrap:"wrap"}}>
        {clusterColors.map((c,k)=>(
          <span key={k} style={{display:"inline-flex", alignItems:"center", gap:5}}>
            <span style={{width:10, height:10, background:c, borderRadius:2, display:"inline-block"}}/>
            簇 {k}
          </span>
        ))}
        <span style={{marginLeft:"auto", letterSpacing:"0.06em"}}>
          平均熵 = {(entropies.reduce((a,b)=>a+b,0)/N).toFixed(3)} / {maxE.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function _UNUSED_BetaAblation({ tweaks }){
  const { beta, dataset } = tweaks;
  // Sweep β ∈ [0,1], run real DGAC pipeline for each β on BOTH graphs, plot ACC.
  const N = 21;
  const xs = Array.from({length:N}, (_,i)=>i/(N-1));
  const { accHetero, accHomo } = useMemoX(()=>{
    const Ghe = window.DEMO_GRAPHS.hetero;
    const Gho = window.DEMO_GRAPHS.homo;
    const run = (G, b) => {
      const r = window.DGAC_MATH.runDGAC(G, {...tweaks, beta: b});
      return r.accFinal;
    };
    return {
      accHetero: xs.map(b=>run(Ghe, b)),
      accHomo:   xs.map(b=>run(Gho, b)),
    };
  }, [tweaks.alpha, tweaks.topLayers, tweaks.attrLayers, tweaks.cpropLayers]);

  const W = 280, H = 120, pad = 22;
  const ymin = Math.min(0.4, Math.min(...accHetero, ...accHomo) - 0.05);
  const ymax = 1.0;
  const xToPx = x => pad + x*(W-pad-10);
  const yToPx = y => H - pad - (y-ymin)/(ymax-ymin)*(H-pad-10);

  const line = (arr, color, dim) => (
    <path
      d={arr.map((y,i)=>`${i===0?"M":"L"}${xToPx(xs[i])},${yToPx(y)}`).join(" ")}
      fill="none" stroke={color} strokeWidth={dim?1.2:2.2}
      opacity={dim?0.35:1}/>
  );

  const cur = dataset==="hetero" ? accHetero : accHomo;
  const curI = Math.round(beta*(N-1));

  return (
    <div style={{
      background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
      padding:"14px 18px 12px",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8}}>
        <span style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>β 消融 · 实时计算</span>
        <span className="mono" style={{fontSize:10.5, color:"#827d75"}}>当前 β = {beta.toFixed(2)} · ACC = {(cur[curI]*100).toFixed(1)}%</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto", display:"block"}}>
        {/* y gridlines */}
        {[0.5,0.6,0.7,0.8,0.9,1.0].filter(y=>y>=ymin).map(y=>(
          <g key={y}>
            <line x1={pad} x2={W-10} y1={yToPx(y)} y2={yToPx(y)} stroke="#f0eadf"/>
            <text x={6} y={yToPx(y)+3} style={{fontSize:9, fill:"#a8a194", fontFamily:"'JetBrains Mono',monospace"}}>{y.toFixed(1)}</text>
          </g>
        ))}
        {/* x axis */}
        <line x1={pad} x2={W-10} y1={H-pad} y2={H-pad} stroke="#cfc8ba"/>
        {[0,0.25,0.5,0.75,1].map(x=>(
          <text key={x} x={xToPx(x)} y={H-8} textAnchor="middle"
            style={{fontSize:9, fill:"#827d75", fontFamily:"'JetBrains Mono',monospace"}}>{x}</text>
        ))}

        {/* curves */}
        {line(accHetero, "oklch(0.58 0.13 35)",  dataset!=="hetero")}
        {line(accHomo,   "oklch(0.55 0.13 250)", dataset!=="homo")}

        {/* current beta marker */}
        <line x1={xToPx(beta)} x2={xToPx(beta)} y1={pad-6} y2={H-pad}
          stroke="#1b1a18" strokeWidth="1" strokeDasharray="3 3"/>
        <circle cx={xToPx(beta)} cy={yToPx(cur[curI])}
          r="4" fill="#1b1a18"/>

        {/* labels */}
        <text x={xToPx(0.05)} y={12} style={{fontSize:9.5, fill:"oklch(0.58 0.13 35)", fontWeight:600, letterSpacing:"0.05em"}}>
          异质 (Texas-like)
        </text>
        <text x={xToPx(0.55)} y={12} style={{fontSize:9.5, fill:"oklch(0.55 0.13 250)", fontWeight:600, letterSpacing:"0.05em"}}>
          同质 (Cora-like)
        </text>
        <text x={W-10} y={12} textAnchor="end" style={{fontSize:9, fill:"#827d75", letterSpacing:"0.08em"}}>ACC vs β</text>
      </svg>
      <div style={{fontSize:11.5, color:"#3d3a35", marginTop:6, lineHeight:1.5}}>
        曲线<b>现场</b>由引擎生成：每个 β 跑一次完整 DGAC 并计算准确率。改 α / L / Lc 曲线整体会变。
      </div>
    </div>
  );
}

// ---------- InputConstruction: X / A / Â heatmaps ----------
// Honest live view of what gets fed into the model.

function Heat({ M, size, colorFn, title, sub, cellGap=0 }) {
  if (!M || !M.length) return null;
  const rows = M.length, cols = M[0].length;
  const cellW = (size - (cols-1)*cellGap) / cols;
  const cellH = (size - (rows-1)*cellGap) / rows;
  return (
    <div>
      <div style={{fontSize:10.5, color:"#827d75", letterSpacing:"0.08em", marginBottom:6, display:"flex", justifyContent:"space-between"}}>
        <span>{title}</span>
        <span className="mono" style={{color:"#a8a194"}}>{sub}</span>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} style={{width:"100%", height:"auto", display:"block", background:"#fdfaf2", border:"1px solid #e3ddd2", borderRadius:4}}>
        {M.map((row, i) => row.map((v, j) => {
          const c = colorFn(v, i, j);
          if (!c) return null;
          return <rect key={`${i}-${j}`} x={j*(cellW+cellGap)} y={i*(cellH+cellGap)} width={cellW} height={cellH} fill={c}/>;
        }))}
      </svg>
    </div>
  );
}

function InputConstruction({ activeSet, tweaks, dgac }) {
  if (!dgac || !dgac.H0) return null;
  const { H0, Ahat, Shat, truth, N } = dgac;
  const on = k => activeSet.has(k);
  const activeInput = on("input-x") || on("input-a") || on("a-enc") || on("s-enc");

  // Build raw A (binary) from Â — any positive off-diagonal
  const A = React.useMemo(() => {
    const out = Array.from({length:N}, ()=>new Array(N).fill(0));
    for (let i=0;i<N;i++) for (let j=0;j<N;j++){
      if (i===j) { out[i][j] = 1; continue; } // self-loop visualized too
      if (Ahat[i][j] > 1e-9) out[i][j] = 1;
    }
    return out;
  }, [Ahat, N]);

  // X range for colormap
  const {xmin, xmax} = React.useMemo(()=>{
    let lo=Infinity, hi=-Infinity;
    for (const r of H0) for (const v of r){ if (v<lo) lo=v; if (v>hi) hi=v; }
    return {xmin:lo, xmax:hi};
  }, [H0]);

  const clusterColors = [
    "oklch(0.62 0.15 40)",
    "oklch(0.62 0.15 150)",
    "oklch(0.62 0.15 250)",
    "oklch(0.62 0.15 320)",
  ];

  const xColor = (v)=>{
    const t = (v - xmin) / (xmax - xmin + 1e-9);
    // diverging: cool (low) → warm (high), around mid
    const r = Math.round(80 + t*(230-80));
    const g = Math.round(150 - Math.abs(t-0.5)*120);
    const b = Math.round(230 - t*(230-60));
    return `rgb(${r},${g},${b})`;
  };
  const aColor = (v, i, j)=>{
    if (v < 0.5) return "#fdfaf2";
    if (i===j) return "oklch(0.55 0.13 250 / 0.45)"; // self-loop
    return "oklch(0.45 0.16 250)";
  };
  const ahatColor = (v)=>{
    if (v < 1e-6) return "#fdfaf2";
    const t = Math.min(1, v/0.5);
    return `oklch(${0.95 - t*0.5} 0.13 250 / ${0.25 + t*0.75})`;
  };
  const shatColor = (v)=>{
    if (v < 1e-6) return "#fdfaf2";
    const t = Math.min(1, v/0.5);
    return `oklch(${0.95 - t*0.5} 0.13 35 / ${0.25 + t*0.75})`;
  };

  return (
    <div style={{background:"#fffdf7", border:`1px solid ${activeInput?"#c8c1b4":"#e3ddd2"}`,
      borderRadius:10, padding:"16px 18px", transition:"border-color .3s"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12}}>
        <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>
          输入构造 · INPUT CONSTRUCTION
        </div>
        <div style={{fontSize:10.5, color:"#827d75"}}>
          模型实际吃进去的三件套
        </div>
      </div>

      {/* Row 1: feature matrix X with cluster bar */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:10.5, color:"#827d75", letterSpacing:"0.08em", marginBottom:6, display:"flex", justifyContent:"space-between"}}>
          <span>X · 节点特征矩阵</span>
          <span className="mono" style={{color:"#a8a194"}}>{N}×{H0[0].length}</span>
        </div>
        <div style={{display:"flex", gap:4, alignItems:"stretch"}}>
          {/* truth cluster strip (left of matrix) */}
          <svg viewBox={`0 0 8 ${N}`} style={{width:10, height:110, display:"block"}}>
            {truth.map((c,i)=>(
              <rect key={i} x={0} y={i} width={8} height={1} fill={clusterColors[c]}/>
            ))}
          </svg>
          <svg viewBox={`0 0 ${H0[0].length} ${N}`}
            preserveAspectRatio="none"
            style={{flex:1, height:110, background:"#fdfaf2", border:"1px solid #e3ddd2", borderRadius:4}}>
            {H0.map((row, i) => row.map((v, j) => (
              <rect key={`${i}-${j}`} x={j} y={i} width={1.02} height={1.02} fill={xColor(v)}/>
            )))}
          </svg>
        </div>
        <div style={{display:"flex", justifyContent:"space-between", fontSize:9.5, color:"#a8a194", marginTop:4, paddingLeft:14}}>
          <span className="mono">真值簇色带 │ 行 = 节点</span>
          <span className="mono">{xmin.toFixed(2)} … {xmax.toFixed(2)}</span>
        </div>
      </div>

      {/* Row 2: three adjacency matrices in a flex row */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10}}>
        <Heat M={A} size={110} colorFn={aColor}
          title="A + I · 原始邻接"
          sub={`${(A.flat().filter(v=>v>0.5).length - N)/2}条边`}/>
        <Heat M={Ahat} size={110} colorFn={ahatColor}
          title="Â · 拓扑归一化"
          sub="D⁻½(A+I)D⁻½"/>
        <Heat M={Shat} size={110} colorFn={shatColor}
          title="Ŝ · 属性 kNN"
          sub={`k=3 (来自 X)`}/>
      </div>

      {/* flow note */}
      <div style={{marginTop:12, padding:"9px 11px", background:"#fdfaf2", borderRadius:6,
        fontSize:11, color:"#3d3a35", lineHeight:1.55, border:"1px dashed #d8d1c2"}}>
        <span className="mono" style={{color:"oklch(0.45 0.16 250)"}}>Â</span> 喂拓扑分支 ·
        <span className="mono" style={{color:"oklch(0.45 0.16 35)", marginLeft:6}}>Ŝ</span> 喂属性分支 ·
        两条都用 <span className="mono">α·Â·H + H₀</span> 做多步扩散 ——
        <span style={{color:"#827d75"}}>Ŝ 不是论文里来的，是从 X 的 kNN 临时造的第二张图</span>
      </div>
    </div>
  );
}

window.LossBreakdown = LossBreakdown;
window.HomophilyDial = HomophilyDial;
window.ConfidenceBars = ConfidenceBars;
window.InputConstruction = InputConstruction;
