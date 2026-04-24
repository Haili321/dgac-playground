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

// Smooth transition ease curve reused for nodes + edges when step changes.
const SMOOTH_T = "cubic-bezier(0.4, 0, 0.2, 1)";
const NODE_XITION = { transition: `transform 0.6s ${SMOOTH_T}` };
const LINE_XITION = {
  transition: `x1 0.6s ${SMOOTH_T}, y1 0.6s ${SMOOTH_T}, x2 0.6s ${SMOOTH_T}, y2 0.6s ${SMOOTH_T}, stroke 0.3s, stroke-width 0.3s, opacity 0.3s`,
};

// ============================================================
// CorrectionTheater — plays out the "C-prop fixes a wrong node"
// story. Picks one k-means-mis-assigned node whose neighbors
// majority-vote the right cluster; every ~2.8s cycle:
//   (1) orange warning ring flashes around protagonist
//   (2) neighbor edges brighten + thicken
//   (3) colored particles fly from each neighbor to protagonist
//       (particle color = neighbor's current k-means color)
//   (4) vote-tally bar below protagonist fills up
//   (5) protagonist fill animates from wrong color → truth color
//   (6) green "rescue" ring flashes to celebrate the fix
// Entirely SMIL-driven (no React timers), so it stays buttery
// smooth even when other parts re-render.
// ============================================================
function CorrectionTheater({ wrongNode, neighbors, posOf, kmColor, flipColor,
                             nbColors, nbKmClusters, nbTruthClusters, nbIsWrong,
                             protagonistTruthK, voteMaxK, clusterColors }) {
  const [wx, wy] = posOf(wrongNode);
  const DUR = 2.8;                        // full cycle seconds
  const tFlashIn    = 0.06;               // warning ring appears
  const tFlashPeak  = 0.18;               // warning ring at max
  const tEdgesOn    = 0.20;               // neighbor edges highlighted
  const tParticle0  = 0.28;               // first particle leaves
  const particleGap = 0.06;               // between particles
  const tTravel     = 0.26;               // particle travel duration fraction
  const tTallyStart = 0.55;
  const tTallyFull  = 0.78;
  const tFlipStart  = 0.80;
  const tFlipEnd    = 0.86;
  const tRescuePk   = 0.90;
  const tRescueEnd  = 0.96;

  const totalNb = neighbors.length;
  // vote-bar geometry (below protagonist)
  const BAR_W = 54, BAR_H = 10;
  const barX = wx - BAR_W/2, barY = wy + 15;

  return (
    <g style={{pointerEvents:"none"}}>
      {/* (2) neighbor edges — brighten during active phase */}
      {neighbors.map((nb, i) => {
        const [nx, ny] = posOf(nb);
        return (
          <line key={"cte"+i} x1={nx} y1={ny} x2={wx} y2={wy}
            stroke="oklch(0.62 0.17 40)" strokeWidth="1" opacity="0">
            <animate attributeName="opacity"
              values={`0;0;0.9;0.9;0.2;0`}
              keyTimes={`0;${tEdgesOn};${tEdgesOn+0.02};${tTallyFull};${tRescueEnd};1`}
              dur={`${DUR}s`} repeatCount="indefinite"/>
            <animate attributeName="stroke-width"
              values={`1;1;2.6;2.6;1;1`}
              keyTimes={`0;${tEdgesOn};${tEdgesOn+0.02};${tTallyFull};${tRescueEnd};1`}
              dur={`${DUR}s`} repeatCount="indefinite"/>
          </line>
        );
      })}

      {/* (1) orange warning ring around protagonist */}
      <circle cx={wx} cy={wy} r="10" fill="none"
        stroke="oklch(0.65 0.20 38)" strokeWidth="2" opacity="0">
        <animate attributeName="opacity"
          values="0;0;1;0.85;0.2;0"
          keyTimes={`0;${tFlashIn};${tFlashPeak};0.45;${tTallyFull};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
        <animate attributeName="r"
          values="10;10;22;17;12;10"
          keyTimes={`0;${tFlashIn};${tFlashPeak};0.45;${tTallyFull};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
      </circle>

      {/* (3) color particles flowing from each neighbor → protagonist */}
      {neighbors.map((nb, i) => {
        const [nx, ny] = posOf(nb);
        const delay = tParticle0 + i * particleGap;
        // safe: delay + tTravel stays < tTallyFull
        const arrive = Math.min(delay + tTravel, 0.77);
        return (
          <g key={"ptc"+i}>
            <circle r="3.6" fill={nbColors[i]} opacity="0"
              stroke="#fffdf7" strokeWidth="0.8">
              <animateMotion
                dur={`${DUR}s`} repeatCount="indefinite"
                path={`M${nx},${ny} L${wx},${wy}`}
                keyTimes={`0;${delay};${arrive};1`}
                keyPoints="0;0;1;1"
                calcMode="linear"/>
              <animate attributeName="opacity"
                values="0;0;1;1;0;0"
                keyTimes={`0;${delay};${delay+0.015};${arrive-0.015};${arrive};1`}
                dur={`${DUR}s`} repeatCount="indefinite"/>
            </circle>
          </g>
        );
      })}

      {/* (4) vote-tally — ONE CELL PER NEIGHBOR (not one wedge per cluster).
             Each cell shows that neighbor's current k-means color; a diagonal
             hatch overlay flags neighbors whose k-means color ≠ their truth
             (they're "wrong neighbors" whose vote still counts). Same-color
             cells are kept adjacent for visual clustering. */}
      <rect x={barX} y={barY} width={BAR_W} height={BAR_H}
        fill="#f0eadf" rx={2} opacity="0">
        <animate attributeName="opacity"
          values="0;0;0.85;0.85;0"
          keyTimes={`0;${tTallyStart};${tTallyStart+0.03};${tRescueEnd};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
      </rect>
      {(() => {
        const cellGap = 0.8;
        const cellW = (BAR_W - cellGap*(totalNb-1)) / totalNb;
        // Sort neighbors: winner km-cluster cells first, then by km-cluster index
        const order = neighbors.map((_, i) => i).sort((a, b) => {
          const ka = nbKmClusters[a], kb = nbKmClusters[b];
          if (ka === voteMaxK && kb !== voteMaxK) return -1;
          if (kb === voteMaxK && ka !== voteMaxK) return 1;
          return ka - kb;
        });
        const segs = [];
        order.forEach((i, idx) => {
          const k = nbKmClusters[i];
          const truthK = nbTruthClusters[i];
          const isWinner = k === voteMaxK;
          const isWrong = nbIsWrong[i];
          // "supportive" = neighbor truly in same cluster as protagonist
          //   (regardless of how km labeled it)
          const isSupportive = truthK === protagonistTruthK;
          const x = barX + idx * (cellW + cellGap);
          const dotCx = x + cellW/2;
          const dotCy = barY + BAR_H + 3.2;
          segs.push(
            <g key={"vt"+i}>
              {/* vote cell: fill = neighbor's km color (= its vote) */}
              <rect x={x} y={barY} width={cellW} height={BAR_H}
                fill={clusterColors[k]} rx={1} opacity="0"
                stroke={isWinner ? "#1b1a18" : "none"}
                strokeWidth={isWinner ? 0.9 : 0}>
                <animate attributeName="opacity"
                  values={`0;0;1;1;0`}
                  keyTimes={`0;${tTallyStart};${tTallyFull};${tRescueEnd};1`}
                  dur={`${DUR}s`} repeatCount="indefinite"/>
              </rect>
              {/* diagonal hatch — only for the rare wrong-km neighbor
                  (km label disagrees with its truth); stays hidden on demos
                  where every neighbor is correctly km-labeled. */}
              {isWrong && [0.22, 0.50, 0.78].map((off, j) => (
                <line key={"h"+j}
                  x1={x + cellW*off - 2.6} y1={barY + BAR_H - 0.6}
                  x2={x + cellW*off + 2.6} y2={barY + 0.6}
                  stroke="#1b1a18" strokeWidth="1.5" opacity="0" strokeLinecap="round">
                  <animate attributeName="opacity"
                    values={`0;0;0.9;0.9;0`}
                    keyTimes={`0;${tTallyStart};${tTallyFull};${tRescueEnd};1`}
                    dur={`${DUR}s`} repeatCount="indefinite"/>
                </line>
              ))}
              {/* truth dot below cell — colored by neighbor's TRUE cluster.
                  Same color as cell = km correct; cross-protagonist color =
                  heterophilic edge. A darker ring marks dots matching the
                  protagonist's truth cluster (the "supportive" neighbors). */}
              <circle cx={dotCx} cy={dotCy} r={2.6}
                fill={clusterColors[truthK]} opacity="0"
                stroke={isSupportive ? "#1b1a18" : "#fffdf7"}
                strokeWidth={isSupportive ? 1.1 : 0.8}>
                <animate attributeName="opacity"
                  values={`0;0;1;1;0`}
                  keyTimes={`0;${tTallyStart};${tTallyFull};${tRescueEnd};1`}
                  dur={`${DUR}s`} repeatCount="indefinite"/>
              </circle>
            </g>
          );
        });
        return segs;
      })()}

      {/* (5) protagonist node — fill animates wrong → truth */}
      <circle cx={wx} cy={wy} r={7.5}
        fill={kmColor} stroke="#1b1a18" strokeWidth={1.8}>
        <animate attributeName="fill"
          values={`${kmColor};${kmColor};${flipColor};${flipColor}`}
          keyTimes={`0;${tFlipStart};${tFlipEnd};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
        <animate attributeName="stroke-width"
          values={`1.8;1.8;2.4;1.2;1.2`}
          keyTimes={`0;${tFlipStart};${tFlipEnd};${tRescueEnd};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
        <animate attributeName="r"
          values={`7.5;7.5;9.5;7.5;7.5`}
          keyTimes={`0;${tFlipStart};${tFlipEnd};${tRescueEnd};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
      </circle>

      {/* (6) green rescue ring after flip */}
      <circle cx={wx} cy={wy} r="10" fill="none"
        stroke="oklch(0.62 0.16 150)" strokeWidth="2" opacity="0">
        <animate attributeName="opacity"
          values="0;0;1;0"
          keyTimes={`0;${tFlipEnd};${tRescuePk};${tRescueEnd}`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
        <animate attributeName="r"
          values="10;10;28;28"
          keyTimes={`0;${tFlipEnd};${tRescuePk};${tRescueEnd}`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
      </circle>
    </g>
  );
}

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

  // diffusion halos — SMIL-driven smooth pulse (independent of React re-render)
  // Note: cprop step has its own CorrectionTheater, so we skip halo there to avoid visual clutter
  const showHalo = tweaks.animateIter && (stepId==="topology" || stepId==="attribute");
  const haloColor = stepId==="topology" ? "oklch(0.55 0.13 250)"
                  : stepId==="attribute" ? "oklch(0.58 0.13 35)"
                  : "oklch(0.55 0.13 150)";

  // k-means' own best color permutation (independent of predAssign's step-based choice)
  // used for the CorrectionTheater: we want to show how k-means MIS-colored nodes get fixed.
  const kmColorPerm = useMemo(() => {
    const K = 4;
    const perms = [];
    const h = (a, k) => {
      if (k === a.length) { perms.push(a.slice()); return; }
      for (let i = k; i < a.length; i++) { [a[k],a[i]]=[a[i],a[k]]; h(a, k+1); [a[k],a[i]]=[a[i],a[k]]; }
    };
    h([0,1,2,3], 0);
    let best = perms[0], bv = -1;
    for (const p of perms) {
      let c = 0;
      for (let i = 0; i < dgac.km.assign.length; i++) if (p[dgac.km.assign[i]] === dgac.truth[i]) c++;
      if (c > bv) { bv = c; best = p; }
    }
    return best;
  }, [dgac.km.assign, dgac.truth]);

  // Pick one "demo-friendly" wrong node for C-prop theater:
  //   - was mis-assigned by k-means
  //   - has ≥ 2 neighbors
  //   - majority of neighbors' k-means colors point to the TRUTH cluster
  //     (so the animation shows a clear win, not ambiguous voting)
  const demoWrong = useMemo(() => {
    if (stepId !== "cprop") return null;
    const K = 4;
    const kmAssign = dgac.km.assign;
    const truth = dgac.truth;
    const wrongIds = [];
    for (let i = 0; i < G.nodes.length; i++) {
      if (kmColorPerm[kmAssign[i]] !== truth[i]) wrongIds.push(i);
    }
    if (wrongIds.length === 0) return null;

    const rated = wrongIds.map(id => {
      const nbIds = [];
      for (const [a, b] of G.edges) {
        if (a === id) nbIds.push(b);
        else if (b === id) nbIds.push(a);
      }
      const votes = new Array(K).fill(0);
      for (const nb of nbIds) votes[kmColorPerm[kmAssign[nb]]]++;
      let maj = 0;
      for (let k = 1; k < K; k++) if (votes[k] > votes[maj]) maj = k;
      return { id, nbIds, votes, maj, count: nbIds.length };
    }).filter(r => r.count >= 2 && r.maj === truth[r.id]);

    if (rated.length === 0) return null;
    // prefer ~3 neighbors (visual clarity), tie-break by more correct neighbors
    rated.sort((a, b) => {
      const aDist = Math.abs(a.count - 3), bDist = Math.abs(b.count - 3);
      if (aDist !== bDist) return aDist - bDist;
      return b.votes[b.maj]/b.count - a.votes[a.maj]/a.count;
    });
    const r = rated[0];
    const nbKmClusters = r.nbIds.map(id => kmColorPerm[dgac.km.assign[id]]);
    const nbTruthClusters = r.nbIds.map(id => dgac.truth[id]);
    return {
      node: G.nodes[r.id],
      neighbors: r.nbIds.map(id => G.nodes[id]),
      nbColors: r.nbIds.map((_, i) => clusterColors[nbKmClusters[i]]),
      nbKmClusters,
      nbTruthClusters,
      nbIsWrong: r.nbIds.map((id, i) => nbKmClusters[i] !== dgac.truth[id]),
      protagonistTruthK: dgac.truth[r.id],
      kmColor: clusterColors[kmColorPerm[dgac.km.assign[r.id]]],
      flipColor: clusterColors[r.maj],
      voteMaxK: r.maj,
    };
  }, [stepId, G, dgac.km.assign, dgac.truth, kmColorPerm, clusterColors]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto", display:"block",
      background:"#fffdf7", borderRadius:8, border:"1px solid #e3ddd2"}}>
      <defs>
        <filter id="softglow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5"/>
        </filter>
      </defs>

      {/* topology edges — CSS transition smooths position changes when step shifts */}
      {showEdges && G.edges.map(([a,b],i)=>{
        const [x1,y1]=posOf(G.nodes[a]), [x2,y2]=posOf(G.nodes[b]);
        const sameClu = G.nodes[a].cluster===G.nodes[b].cluster;
        return <line key={"e"+i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={stepId==="topology"?"oklch(0.55 0.13 250)":"#cfc8ba"}
          strokeWidth={stepId==="topology"?1.4:0.9}
          opacity={stepId==="topology"?0.6:(sameClu?0.5:0.35)}
          style={LINE_XITION}/>;
      })}

      {/* attribute edges (dashed) */}
      {showAttrEdges && dgac.attrEdges.map(([a,b],i)=>{
        const [x1,y1]=posOf(G.nodes[a]), [x2,y2]=posOf(G.nodes[b]);
        return <line key={"ae"+i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={"oklch(0.58 0.13 35)"}
          strokeWidth={1.2}
          strokeDasharray="3 3"
          opacity={stepId==="attribute"?0.7:0.35}
          style={LINE_XITION}/>;
      })}

      {/* nodes — wrapped in <g transform> so CSS transition smooths them when step changes.
          The C-prop protagonist is skipped here — CorrectionTheater paints it instead. */}
      {G.nodes.map(n => {
        if (demoWrong && demoWrong.node.id === n.id) return null;
        const [cx, cy] = posOf(n);
        const wrong = isWrongNode(n);
        return (
          <g key={n.id} transform={`translate(${cx},${cy})`} style={NODE_XITION}>
            {showHalo && (
              <circle cx="0" cy="0" r="6" fill="none"
                stroke={haloColor} strokeWidth="1.2" opacity="0.5">
                <animate attributeName="r" values="6;24" dur="1.6s"
                  begin={`${(n.id%5)*0.12}s`} repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.55;0" dur="1.6s"
                  begin={`${(n.id%5)*0.12}s`} repeatCount="indefinite"/>
              </circle>
            )}
            <circle cx="0" cy="0" r={7.5}
              fill={nodeFill(n)}
              stroke={wrong?"#1b1a18":"#fffdf7"}
              strokeWidth={wrong?2:1.2}
              style={{transition:"fill 0.5s ease, stroke 0.3s ease, stroke-width 0.3s ease"}}/>
            {wrong && (
              <circle cx="5" cy="-5" r={3} fill="#1b1a18"/>
            )}
          </g>
        );
      })}

      {/* C-prop correction theater — plays on cprop step */}
      {demoWrong && (
        <CorrectionTheater
          wrongNode={demoWrong.node}
          neighbors={demoWrong.neighbors}
          posOf={posOf}
          kmColor={demoWrong.kmColor}
          flipColor={demoWrong.flipColor}
          nbColors={demoWrong.nbColors}
          nbKmClusters={demoWrong.nbKmClusters}
          nbTruthClusters={demoWrong.nbTruthClusters}
          nbIsWrong={demoWrong.nbIsWrong}
          protagonistTruthK={demoWrong.protagonistTruthK}
          voteMaxK={demoWrong.voteMaxK}
          clusterColors={clusterColors}/>
      )}

      {/* legend / caption */}
      <text x={12} y={H-12} style={{fontSize:10.5, fill:"#827d75", fontFamily:"'JetBrains Mono',monospace"}}>
        {colorMode==="truth" && "● 真实簇标签 (仅此处展示)"}
        {colorMode==="neutral" && "○ 节点随 H 位移 → 观察 H = αÂH+H₀ 收敛"}
        {colorMode==="pred" && stepId==="kmeans" && "● kmeans 初分配, ⬤ 标记误分配节点"}
        {colorMode==="pred" && stepId==="cprop" && "● 上格=邻居 km 投票色 · 下点=邻居真实簇（深圈=与中心同簇的支持邻居）· Eq.16"}
        {colorMode==="pred" && stepId!=="kmeans" && stepId!=="cprop" && "● C-prop 平滑后的聚类结果, ⬤ 误分配"}
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
