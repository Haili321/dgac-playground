// Main DGAC Playground app.

const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "alpha": 0.9,
  "beta": 0.5,
  "topLayers": 5,
  "attrLayers": 5,
  "cpropLayers": 1,
  "dataset": "hetero",
  "showAttrGraph": true,
  "animateIter": true
}/*EDITMODE-END*/;

// === Graph view: shows nodes, topology edges, optional attribute edges ===
function GraphView({ stepId, tweaks, iter, dgac }) {
  const G = window.DEMO_GRAPHS[tweaks.dataset] || window.DEMO_GRAPHS.hetero;
  const W = 420, H = 360;

  // Determine what to show at this step
  const showEdges = true;
  const showAttrEdges = tweaks.showAttrGraph && (stepId==="attribute" || stepId==="encode" || stepId==="fusion");

  // 2D projection from the active embedding at this step
  const proj = useMemo(() => {
    let src = dgac.H0;
    if (stepId==="topology") src = dgac.Ht;
    else if (stepId==="attribute") src = dgac.Ha;
    else if (stepId==="fusion" || stepId==="kmeans" || stepId==="loss") src = dgac.H;
    else if (stepId==="cprop" || stepId==="output") src = dgac.H;
    return window.DGAC_MATH.project2D(src);
  }, [dgac, stepId]);

  // per-step cluster prediction for coloring
  const predAssign = (() => {
    if (stepId==="kmeans") return dgac.km.assign;
    if (stepId==="cprop" || stepId==="output" || stepId==="loss") return dgac.refined.assign;
    return null;
  })();

  // Match predicted labels onto truth colors (via best permutation, same as acc)
  const colorPerm = useMemo(() => {
    if (!predAssign) return [0,1,2,3];
    // find best perm mapping pred → truth
    const K = 4;
    const perms = [];
    const h = (a, k)=>{ if(k===a.length){ perms.push(a.slice()); return;} for(let i=k;i<a.length;i++){ [a[k],a[i]]=[a[i],a[k]]; h(a,k+1); [a[k],a[i]]=[a[i],a[k]]; } };
    h([0,1,2,3], 0);
    let best=perms[0], bv=-1;
    for(const p of perms){
      let c=0; for(let i=0;i<predAssign.length;i++) if(p[predAssign[i]]===dgac.truth[i]) c++;
      if(c>bv){bv=c; best=p;}
    }
    return best;
  }, [predAssign, dgac.truth]);

  const clusterColors = G.clusters.map(c => c.color);
  const colorMode = (() => {
    if (["input","encode"].includes(stepId)) return "truth";
    if (["topology","attribute","fusion"].includes(stepId)) return "neutral";
    if (stepId==="kmeans") return "pred";
    return "pred";
  })();

  const nodeFill = (n) => {
    if (colorMode==="truth") return n.color;
    if (colorMode==="neutral") return "#d9d2c3";
    if (colorMode==="pred" && predAssign) return clusterColors[colorPerm[predAssign[n.id]]];
    return "#ccc";
  };
  const isWrongNode = (n) => {
    if (!predAssign) return false;
    return colorPerm[predAssign[n.id]] !== n.cluster;
  };

  // blend base anchor position with H-projection offset
  const posOf = (n) => {
    const ax = n.tx, ay = n.ty;
    const [dx, dy] = proj[n.id];
    // strength of H-driven displacement grows with pipeline progress
    const k = ["input","encode"].includes(stepId) ? 0
            : ["topology","attribute","fusion","kmeans"].includes(stepId) ? 0.10
            : 0.08;
    return [ (ax + dx*k) * W, (ay + dy*k) * H ];
  };

  // diffusion halos for current iter
  const showHalo = tweaks.animateIter && (stepId==="topology" || stepId==="attribute" || stepId==="cprop");
  const haloR = 6 + (iter%3)*6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto", display:"block",
      background:"#fffdf7", borderRadius:8, border:"1px solid #e3ddd2"}}>
      <defs>
        <filter id="softglow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5"/>
        </filter>
      </defs>

      {/* topology edges */}
      {showEdges && G.edges.map(([a,b],i)=>{
        const [x1,y1]=posOf(G.nodes[a]), [x2,y2]=posOf(G.nodes[b]);
        const sameClu = G.nodes[a].cluster===G.nodes[b].cluster;
        return <line key={"e"+i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={stepId==="topology"?"oklch(0.55 0.13 250)":"#cfc8ba"}
          strokeWidth={stepId==="topology"?1.4:0.9}
          opacity={stepId==="topology"?0.6:(sameClu?0.5:0.35)}/>;
      })}

      {/* attribute edges (dashed) */}
      {showAttrEdges && dgac.attrEdges.map(([a,b],i)=>{
        const [x1,y1]=posOf(G.nodes[a]), [x2,y2]=posOf(G.nodes[b]);
        return <line key={"ae"+i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={"oklch(0.58 0.13 35)"}
          strokeWidth={1.2}
          strokeDasharray="3 3"
          opacity={stepId==="attribute"?0.7:0.35}/>;
      })}

      {/* nodes */}
      {G.nodes.map(n => {
        const [cx, cy] = posOf(n);
        const wrong = isWrongNode(n);
        return (
          <g key={n.id}>
            {showHalo && (
              <circle cx={cx} cy={cy} r={haloR} fill="none"
                stroke={stepId==="topology"?"oklch(0.55 0.13 250)":
                        stepId==="attribute"?"oklch(0.58 0.13 35)":"oklch(0.55 0.13 150)"}
                strokeWidth="1" opacity={0.3 - (iter%3)*0.08}/>
            )}
            <circle cx={cx} cy={cy} r={7.5}
              fill={nodeFill(n)}
              stroke={wrong?"#1b1a18":"#fffdf7"}
              strokeWidth={wrong?2:1.2}/>
            {wrong && (
              <circle cx={cx+5} cy={cy-5} r={3} fill="#1b1a18"/>
            )}
          </g>
        );
      })}

      {/* legend / caption */}
      <text x={12} y={H-12} style={{fontSize:10.5, fill:"#827d75", fontFamily:"'JetBrains Mono',monospace"}}>
        {colorMode==="truth" && "● 真实簇标签 (仅此处展示)"}
        {colorMode==="neutral" && "○ 节点随 H 位移 → 观察 H = αÂH+H₀ 收敛"}
        {colorMode==="pred" && stepId==="kmeans" && "● kmeans 初分配, ⬤ 标记误分配节点"}
        {colorMode==="pred" && stepId!=="kmeans" && "● C-prop 平滑后的聚类结果, ⬤ 误分配"}
      </text>
    </svg>
  );
}

// === Step scrubber ===
function Scrubber({ step, steps, idx, setIdx, playing, setPlaying }) {
  return (
    <div style={{marginTop:20, padding:"16px 20px", background:"#fffdf7",
      border:"1px solid #e3ddd2", borderRadius:8}}>
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:12}}>
        <button onClick={()=>setIdx(Math.max(0, idx-1))}
          disabled={idx===0}
          style={{padding:"8px 14px", fontSize:12, border:"1px solid #e3ddd2",
            background:idx===0?"#f7f5f1":"transparent", borderRadius:6,
            cursor:idx===0?"default":"pointer", color:idx===0?"#c8c1b4":"#1b1a18"}}>← 上一步</button>
        <button onClick={()=>setIdx(Math.min(steps.length-1, idx+1))}
          disabled={idx===steps.length-1}
          style={{padding:"8px 14px", fontSize:12, border:"1px solid #1b1a18",
            background:idx===steps.length-1?"#f7f5f1":"#1b1a18",
            color:idx===steps.length-1?"#c8c1b4":"#fffdf7", borderRadius:6,
            cursor:idx===steps.length-1?"default":"pointer", fontWeight:600}}>下一步 →</button>
        <div style={{marginLeft:"auto", fontSize:12, color:"#827d75"}} className="mono">
          {idx+1} / {steps.length}
        </div>
      </div>

      {/* dots */}
      <div style={{display:"flex", gap:4, alignItems:"center", marginBottom:12}}>
        {steps.map((s,i)=>(
          <button key={s.id} onClick={()=>setIdx(i)}
            title={s.title}
            style={{
              flex:1, height:6, border:"none", cursor:"pointer",
              background: i<=idx ? "#1b1a18" : "#e3ddd2",
              borderRadius:3,
              transition:"background .3s ease",
            }}/>
        ))}
      </div>

      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <span className="serif" style={{fontSize:18, fontWeight:600, color:"#1b1a18"}}>
          <span style={{color:"#a8a194", fontSize:13, marginRight:8, fontFamily:"'JetBrains Mono',monospace"}}>
            step {String(idx+1).padStart(2,"0")}
          </span>
          {step.title}
        </span>
        <span className="mono" style={{fontSize:12, color:"#827d75"}}>{step.subtitle}</span>
      </div>
      <p style={{fontSize:13.5, lineHeight:1.7, color:"#3d3a35", margin:0}}>{step.desc}</p>
    </div>
  );
}

// === Header ===
function Header(){
  return (
    <header style={{marginBottom:18}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <div>
          <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.18em", marginBottom:4}}>
            WWW 2025 · INTERACTIVE WALK-THROUGH
          </div>
          <h1 className="serif" style={{margin:0, fontSize:28, fontWeight:600, color:"#1b1a18"}}>
            DGAC · <span style={{fontWeight:400, color:"#3d3a35"}}>Diffusion-based Graph-agnostic Clustering</span>
          </h1>
        </div>
        <div style={{textAlign:"right", fontSize:11.5, color:"#827d75", lineHeight:1.5}} className="mono">
          <div>
            <a href="https://github.com/Haili321/dgac-playground" target="_blank" rel="noreferrer"
               style={{color:"inherit", textDecoration:"none", borderBottom:"1px dotted #c9c3b7"}}>
              github.com/Haili321/dgac-playground
            </a>
          </div>
          <div>双分支扩散 · 无监督 · 同质/异质图通吃</div>
        </div>
      </div>
      <div style={{height:1, background:"#e3ddd2", marginTop:14}}/>
    </header>
  );
}

// === Summary strip ===
function BottomStrip() {
  const items = [
    { k:"12", v:"基准图数据集" },
    { k:"4", v:"损失项 (自监督)" },
    { k:"0", v:"需要的标签数" },
    { k:"≤ O(N·L)", v:"扩散复杂度 (稀疏)" },
  ];
  return (
    <div style={{marginTop:18, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10}}>
      {items.map((x,i)=>(
        <div key={i} style={{background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:8, padding:"12px 14px"}}>
          <div className="serif" style={{fontSize:22, fontWeight:600, color:"#1b1a18"}}>{x.k}</div>
          <div style={{fontSize:11.5, color:"#827d75"}}>{x.v}</div>
        </div>
      ))}
    </div>
  );
}

// === App ===
function App() {
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [idx, setIdx] = useState(()=>{
    const saved = localStorage.getItem("dgac_step");
    return saved ? Math.min(parseInt(saved), window.STEPS.length-1) : 0;
  });
  const [playing, setPlaying] = useState(false);
  const [tweaksVisible, setTweaksVisible] = useState(false);
  const [iter, setIter] = useState(0);

  const steps = window.STEPS;
  const step = steps[idx];
  const activeSet = useMemo(()=>new Set(step.active), [step]);

  // REAL DGAC pipeline result — recomputes on every tweak change.
  const dgac = useMemo(()=>{
    const G = window.DEMO_GRAPHS[tweaks.dataset];
    return window.DGAC_MATH.runDGAC(G, tweaks);
  }, [tweaks.dataset, tweaks.alpha, tweaks.beta,
      tweaks.topLayers, tweaks.attrLayers, tweaks.cpropLayers]);

  useEffect(()=>{ localStorage.setItem("dgac_step", idx); }, [idx]);

  // autoplay removed — steps only advance via user action.

  // iteration ticker for halo animation
  useEffect(()=>{
    const t = setInterval(()=>setIter(i=>i+1), 600);
    return ()=>clearInterval(t);
  }, []);

  // edit-mode wiring
  useEffect(()=>{
    const handler = (e)=>{
      if (e.data?.type === "__activate_edit_mode") setTweaksVisible(true);
      if (e.data?.type === "__deactivate_edit_mode") setTweaksVisible(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({type:"__edit_mode_available"}, "*");
    return ()=>window.removeEventListener("message", handler);
  }, []);

  const setTweak = (k, v)=>{
    setTweaks(prev=>{
      const next = {...prev, [k]: v};
      window.parent.postMessage({type:"__edit_mode_set_keys", edits:{[k]:v}}, "*");
      return next;
    });
  };

  return (
    <div data-screen-label="DGAC Playground"
      style={{maxWidth:1280, margin:"0 auto", padding:"28px 36px 56px"}}>
      <Header/>

      {/* Full-width architecture diagram */}
      <div style={{background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10, padding:"18px 24px 14px", marginBottom:0}}>
        <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em", marginBottom:10}}>
          架构流程图 · ARCHITECTURE
        </div>
        <window.PipelineDiagram activeSet={activeSet} tweaks={tweaks}
          onStepJump={(id)=>{
            const i = steps.findIndex(s=>s.id===id);
            if (i>=0) setIdx(i);
          }}/>
      </div>

      {/* Inline Tweaks bar — lives right under the architecture, above the grid */}
      <window.TweaksPanel tweaks={tweaks} setTweak={setTweak} visible={tweaksVisible}/>

      {/* Main grid */}
      <div style={{display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:24}}>
        {/* Left column: graph view + loss */}
        <div>
          <div style={{display:"grid", gridTemplateColumns:"1fr", gap:12}}>
            <div style={{background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10, padding:"16px 18px"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10}}>
                <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>
                  示例图 · 20 节点 / 4 簇 / 异质
                </div>
                <div style={{fontSize:11, color:"#827d75"}} className="mono">
                  iter {iter%(tweaks.topLayers+1)} / {tweaks.topLayers}
                </div>
              </div>
              <GraphView stepId={step.id} tweaks={tweaks} iter={iter} dgac={dgac}/>
              <div style={{display:"flex", gap:16, marginTop:10, fontSize:11.5, color:"#3d3a35"}}>
                <span>kmeans 准确率 <b className="mono">{(dgac.accKm*100).toFixed(1)}%</b></span>
                <span>C-prop 后 <b className="mono" style={{color:"oklch(0.45 0.15 150)"}}>{(dgac.accFinal*100).toFixed(1)}%</b></span>
                <span style={{marginLeft:"auto", color:"#827d75"}}>Δ = +{((dgac.accFinal-dgac.accKm)*100).toFixed(1)} pp</span>
              </div>
            </div>

            <window.LossBreakdown active={step.id==="loss"} tick={iter}/>
          </div>
        </div>

        {/* Right column: formulas */}
        <div>
          <div style={{background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10, padding:"18px 20px", position:"sticky", top:20}}>
            <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em", marginBottom:12}}>
              公式 · FORMULAS
            </div>
            <window.FormulaPanel step={step} tweaks={tweaks}/>
          </div>
        </div>
      </div>

      {/* Scrubber full width */}
      <Scrubber step={step} steps={steps} idx={idx} setIdx={setIdx}
        playing={playing} setPlaying={setPlaying}/>

      <BottomStrip/>

      <footer style={{marginTop:28, paddingTop:20, borderTop:"1px solid #e3ddd2",
        fontSize:11.5, color:"#a8a194", display:"flex", justifyContent:"space-between"}}>
        <span>DGAC</span>
        <span className="mono">DGAC Playground · interactive walkthrough</span>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
