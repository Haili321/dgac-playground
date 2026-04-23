// Pipeline SVG — the dual-branch DGAC architecture diagram.
// Blocks are clickable: clicking jumps to the step they represent.

const { useMemo } = React;

function PipeBlock({ x, y, w, h, label, sub, color, active, dim, onClick, hoverable }) {
  const stroke = active ? color : "#c8c1b4";
  const textFill = active ? color : "#3d3a35";
  const subFill = active ? color : "#827d75";
  const textOp = active ? 1 : (dim ? 0.55 : 0.9);
  const rectOp = active ? 1 : (dim ? 0.5 : 0.85);
  const [hover, setHover] = React.useState(false);
  const isClickable = !!onClick;
  const rectStroke = hover && isClickable ? color : stroke;
  return (
    <g
      style={{
        transition:"opacity .35s ease",
        cursor: isClickable ? "pointer" : "default",
      }}
      onClick={onClick}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
    >
      {/* Invisible wider hit area for easier clicking */}
      {isClickable && (
        <rect x={x-2} y={y-2} width={w+4} height={h+4} fill="transparent"/>
      )}
      <g opacity={rectOp} style={{transition:"opacity .35s ease"}}>
        <rect x={x} y={y} width={w} height={h} rx="8" ry="8"
          fill={hover && isClickable ? "oklch(0.985 0.01 85)" : "#fffdf7"}
          stroke={rectStroke}
          strokeWidth={active?2: (hover && isClickable ? 1.6 : 1)}
          style={{transition:"stroke .15s, stroke-width .15s, fill .15s"}}/>
        {active && <rect x={x} y={y} width={w} height="3" rx="8" fill={color}/>}
      </g>
      <g opacity={textOp} style={{transition:"opacity .35s ease"}}>
        <text x={x+w/2} y={sub ? y+h/2-3 : y+h/2+4} textAnchor="middle"
          style={{fontSize:12.5, fontWeight:600, fill: textFill,
            fontFamily:"'Inter','Noto Serif SC',sans-serif", pointerEvents:"none"}}>
          {label}
        </text>
        {sub && <text x={x+w/2} y={y+h/2+13} textAnchor="middle"
          style={{fontSize:10, fill:subFill,
            fontFamily:"'JetBrains Mono',monospace", pointerEvents:"none"}}>
          {sub}
        </text>}
      </g>
    </g>
  );
}

function Arrow({ from, to, active, curve=0, color="#9a9388", dashed }) {
  const [x1,y1]=from, [x2,y2]=to;
  const mx=(x1+x2)/2, my=(y1+y2)/2 - curve;
  const op = active?1:0.6;
  const stroke = active ? color : "#bdb6a8";
  return (
    <g opacity={op} style={{transition:"opacity .35s ease"}}>
      <defs>
        <marker id={`arr-${color.replace(/[^a-z0-9]/gi,'')}-${active?1:0}`} viewBox="0 0 10 10"
          refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={stroke}/>
        </marker>
      </defs>
      <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
        stroke={stroke} strokeWidth={active?1.8:1.2} fill="none"
        strokeDasharray={dashed?"4 4":"none"}
        markerEnd={`url(#arr-${color.replace(/[^a-z0-9]/gi,'')}-${active?1:0})`}/>
    </g>
  );
}

function IterBadge({ x, y, active, color, label }){
  if (!active) return null;
  return (
    <g style={{pointerEvents:"none"}}>
      <rect x={x-22} y={y-10} width="44" height="20" rx="10"
        fill="#fffdf7" stroke={color} strokeWidth="1.2"/>
      <text x={x} y={y+4} textAnchor="middle"
        style={{fontSize:11, fill:color, fontFamily:"'JetBrains Mono',monospace", fontWeight:600}}>
        {label}
      </text>
    </g>
  );
}

function PipelineDiagram({ activeSet, tweaks, onStepJump }) {
  const A_T = "oklch(0.55 0.13 250)";
  const A_A = "oklch(0.58 0.13 35)";
  const A_F = "oklch(0.52 0.13 300)";
  const A_C = "oklch(0.55 0.13 150)";
  const A_L = "oklch(0.50 0.05 260)";

  const w = 1290, h = 320;
  const on = k => activeSet.has(k);
  const go = id => onStepJump && onStepJump(id);

  // X positions for stage columns (graph source + 5 stages)
  const X = { graph: 20, input: 160, encode: 310, diff: 530, fusion: 810, cprop: 1050 };
  // Y bands: top branch (attr), bottom branch (topo), mid (fusion/cprop), loss bar
  const Y = { attr: 70, topo: 205, mid: 140, loss: 20, col: 278 };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%", height:"auto", display:"block"}}>
      {/* source graph G = (V, E, X) — fans out into X (features) and A (adjacency) */}
      <PipeBlock x={X.graph} y={Y.mid-14} w={110} h={54}
        label="图 G" sub="(V, E, X)" color="#3d3a35"
        active={on("input-x")||on("input-a")} onClick={()=>go("input")}/>

      {/* input column */}
      <PipeBlock x={X.input} y={Y.attr} w={100} h={54} label="X" sub="N×F" color={A_A}
        active={on("input-x")} onClick={()=>go("input")}/>
      <PipeBlock x={X.input} y={Y.topo} w={100} h={54} label="A" sub="N×N" color={A_T}
        active={on("input-a")} onClick={()=>go("input")}/>

      {/* encoders */}
      <PipeBlock x={X.encode} y={Y.attr} w={150} h={54}
        label="属性编码 A_enc" sub="S_norm → H₀ᵃ" color={A_A}
        active={on("a-enc")} onClick={()=>go("encode")}/>
      <PipeBlock x={X.encode} y={Y.topo} w={150} h={54}
        label="拓扑编码 S_enc" sub="A_norm → H₀ᵗ" color={A_T}
        active={on("s-enc")} onClick={()=>go("encode")}/>

      {/* diffusion blocks */}
      <PipeBlock x={X.diff} y={Y.attr} w={210} h={54}
        label="属性分支扩散 attr_agg"
        sub={`α·Ŝ·H + H₀  ×${tweaks.attrLayers}`}
        color={A_A} active={on("attr-diff")} onClick={()=>go("attribute")}/>
      <PipeBlock x={X.diff} y={Y.topo} w={210} h={54}
        label="拓扑分支扩散 top_agg"
        sub={`α·Â·H + H₀  ×${tweaks.topLayers}`}
        color={A_T} active={on("top-diff")} onClick={()=>go("topology")}/>

      {/* fusion */}
      <PipeBlock x={X.fusion} y={Y.mid} w={160} h={54}
        label="融合 fusion"
        sub={`β=${tweaks.beta.toFixed(2)}`}
        color={A_F} active={on("fusion")} onClick={()=>go("fusion")}/>

      {/* kmeans */}
      <PipeBlock x={X.fusion} y={Y.mid+80} w={160} h={42}
        label="k-means → C₀" color={A_C} active={on("kmeans")}
        onClick={()=>go("kmeans")}/>

      {/* c-prop */}
      <PipeBlock x={X.cprop} y={Y.mid} w={200} h={54}
        label="C-prop 簇分配扩散"
        sub={`α·Â·C + C₀  ×${tweaks.cpropLayers}`}
        color={A_C} active={on("cprop")} onClick={()=>go("cprop")}/>

      {/* output */}
      <PipeBlock x={X.cprop} y={Y.mid+80} w={200} h={42}
        label="argmax(C) → 簇" color={A_C} active={on("output")}
        onClick={()=>go("output")}/>

      {/* loss bar */}
      <PipeBlock x={X.fusion} y={Y.loss} w={440} h={36}
        label="L = L_cont + L_cluster + L_recons"
        color={A_L} active={on("loss")} dim={!on("loss")}
        onClick={()=>go("loss")}/>

      {/* arrows — G → (X, A) */}
      <Arrow from={[X.graph+110, Y.mid+0]}  to={[X.input, Y.attr+27]} active={on("input-x")} color={A_A} curve={-10}/>
      <Arrow from={[X.graph+110, Y.mid+26]} to={[X.input, Y.topo+27]} active={on("input-a")} color={A_T} curve={10}/>
      {/* formula labels on the G→X/A arrows — placed above/below block rows to avoid overlap */}
      <text x={(X.graph+110+X.input)/2} y={Y.attr - 8} textAnchor="middle"
        style={{fontSize:10, fill:"#827d75", fontStyle:"italic",
          fontFamily:"'JetBrains Mono',monospace", pointerEvents:"none"}}>
        X: 节点特征
      </text>
      <text x={(X.graph+110+X.input)/2} y={Y.topo - 8} textAnchor="middle"
        style={{fontSize:10, fill:"#827d75", fontStyle:"italic",
          fontFamily:"'JetBrains Mono',monospace", pointerEvents:"none"}}>
        A_ij = 𝟙[(i,j) ∈ E]
      </text>

      {/* arrows — input → encode */}
      <Arrow from={[X.input+100, Y.attr+27]} to={[X.encode, Y.attr+27]}  active={on("a-enc")||on("input-x")} color={A_A}/>
      <Arrow from={[X.input+100, Y.topo+27]} to={[X.encode, Y.topo+27]} active={on("s-enc")||on("input-a")} color={A_T}/>
      {/* encode → diffusion */}
      <Arrow from={[X.encode+150, Y.attr+27]} to={[X.diff, Y.attr+27]}  active={on("attr-diff")} color={A_A}/>
      <Arrow from={[X.encode+150, Y.topo+27]} to={[X.diff, Y.topo+27]} active={on("top-diff")} color={A_T}/>
      {/* diffusion → fusion */}
      <Arrow from={[X.diff+210, Y.attr+27]} to={[X.fusion, Y.mid+20]}  active={on("fusion")} color={A_A}/>
      <Arrow from={[X.diff+210, Y.topo+27]} to={[X.fusion, Y.mid+34]} active={on("fusion")} color={A_T}/>
      {/* fusion → kmeans (vertical) */}
      <Arrow from={[X.fusion+80, Y.mid+54]} to={[X.fusion+80, Y.mid+80]} active={on("kmeans")} color={A_F}/>
      {/* kmeans → cprop (diagonal up) */}
      <Arrow from={[X.fusion+160, Y.mid+101]} to={[X.cprop, Y.mid+34]} active={on("cprop")} color={A_C}/>
      {/* cprop → output */}
      <Arrow from={[X.cprop+100, Y.mid+54]} to={[X.cprop+100, Y.mid+80]} active={on("output")} color={A_C}/>
      {/* loss feedback arrows (dashed) */}
      <Arrow from={[X.fusion+80, Y.mid]} to={[X.fusion+80, Y.loss+36]} active={on("loss")} color={A_L} dashed/>
      <Arrow from={[X.cprop+100, Y.mid]} to={[X.cprop+100, Y.loss+36]} active={on("loss")} color={A_L} dashed/>

      {/* iteration badges */}
      <IterBadge x={X.diff+105} y={Y.attr-10} active={on("attr-diff")} color={A_A} label={`L=${tweaks.attrLayers}`}/>
      <IterBadge x={X.diff+105} y={Y.topo+64} active={on("top-diff")} color={A_T} label={`L=${tweaks.topLayers}`}/>
      <IterBadge x={X.cprop+100} y={Y.mid-10} active={on("cprop")} color={A_C} label={`Lc=${tweaks.cpropLayers}`}/>

      {/* column titles */}
      <text x={X.graph+55}   y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>GRAPH</text>
      <text x={X.input+50}   y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>INPUT</text>
      <text x={X.encode+75}  y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>ENCODE</text>
      <text x={X.diff+105}   y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>DIFFUSION (L steps)</text>
      <text x={X.fusion+80}  y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>FUSION + K-MEANS</text>
      <text x={X.cprop+100}  y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>C-PROP + OUTPUT</text>

      {/* hint */}
      <text x={w-12} y={h-8} textAnchor="end"
        style={{fontSize:10, fill:"#a8a194", fontStyle:"italic"}}>
        点击任意方块跳到对应步骤 →
      </text>
    </svg>
  );
}

window.PipelineDiagram = PipelineDiagram;
