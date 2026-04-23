// Tweaks panel — floating bottom-right, controls α, β, L, L_c, and dataset mode.
// Persists via EDITMODE-BEGIN block in app.jsx.

function TweakRow({ label, value, children, hint }) {
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4}}>
        <span style={{fontSize:11.5, color:"#3d3a35", fontWeight:500, letterSpacing:"0.02em"}}>{label}</span>
        <span className="mono" style={{fontSize:11, color:"#1b1a18", fontWeight:600}}>{value}</span>
      </div>
      {children}
      {hint && <div style={{fontSize:10.5, color:"#a8a194", marginTop:3}}>{hint}</div>}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, color }) {
  return (
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e=>onChange(parseFloat(e.target.value))}
      style={{
        width:"100%", accentColor: color,
        height: 4,
      }}/>
  );
}

function SegButton({ options, value, onChange }) {
  return (
    <div style={{display:"flex", border:"1px solid #e3ddd2", borderRadius:6, overflow:"hidden"}}>
      {options.map(o => (
        <button key={o.value}
          onClick={()=>onChange(o.value)}
          style={{
            flex:1, padding:"5px 8px", fontSize:11,
            border:"none", cursor:"pointer",
            background: value===o.value ? "#1b1a18" : "transparent",
            color: value===o.value ? "#fffdf7" : "#3d3a35",
            fontFamily: "'Inter',sans-serif",
            borderRight:"1px solid #e3ddd2",
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Compact horizontal slider cell for the inline Tweaks bar.
function TweakCell({ label, sub, value, children, color }) {
  return (
    <div style={{minWidth:0, display:"flex", flexDirection:"column", gap:4}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:6}}>
        <span style={{fontSize:10.5, color:"#3d3a35", fontWeight:500, letterSpacing:"0.02em",
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
          {label}{sub && <span style={{color:"#a8a194", marginLeft:4, fontWeight:400}}>{sub}</span>}
        </span>
        <span className="mono" style={{fontSize:10.5, color, fontWeight:600, whiteSpace:"nowrap"}}>{value}</span>
      </div>
      {children}
    </div>
  );
}

function TweaksPanel({ tweaks, setTweak, visible }) {
  // Now always rendered as a horizontal strip; `visible` is ignored.
  const A_T = "oklch(0.55 0.13 250)";
  const A_A = "oklch(0.58 0.13 35)";
  const A_F = "oklch(0.52 0.13 300)";
  const A_C = "oklch(0.55 0.13 150)";

  return (
    <div style={{
      background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
      padding:"14px 20px 16px", marginTop:16, marginBottom:16,
      fontFamily:"'Inter',sans-serif",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12}}>
        <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>
          超参数 · TWEAKS
        </div>
        <div style={{fontSize:10.5, color:"#827d75"}}>
          所有旋钮联动架构图、示例图、损失与公式
        </div>
      </div>

      <div style={{display:"grid",
        gridTemplateColumns:"minmax(170px, 0.9fr) repeat(5, minmax(110px, 1fr)) minmax(140px, 0.9fr)",
        gap:20, alignItems:"end"}}>

        <TweakCell label="数据集" value={tweaks.dataset==="hetero"?"异质":"同质"} color="#1b1a18">
          <SegButton
            value={tweaks.dataset}
            onChange={v=>setTweak("dataset", v)}
            options={[
              {value:"hetero", label:"Texas"},
              {value:"homo",   label:"Cora"},
            ]}/>
        </TweakCell>

        <TweakCell label="α" sub="扩散步长" value={tweaks.alpha.toFixed(2)} color={A_T}>
          <Slider value={tweaks.alpha} min={0.1} max={1.0} step={0.05}
            color={A_T} onChange={v=>setTweak("alpha", v)}/>
        </TweakCell>

        <TweakCell label="β" sub="融合" value={tweaks.beta.toFixed(2)} color={A_F}>
          <Slider value={tweaks.beta} min={0.0} max={1.0} step={0.05}
            color={A_F} onChange={v=>setTweak("beta", v)}/>
        </TweakCell>

        <TweakCell label="L" sub="拓扑层数" value={tweaks.topLayers} color={A_T}>
          <Slider value={tweaks.topLayers} min={1} max={8} step={1}
            color={A_T} onChange={v=>setTweak("topLayers", Math.round(v))}/>
        </TweakCell>

        <TweakCell label="L" sub="属性层数" value={tweaks.attrLayers} color={A_A}>
          <Slider value={tweaks.attrLayers} min={1} max={8} step={1}
            color={A_A} onChange={v=>setTweak("attrLayers", Math.round(v))}/>
        </TweakCell>

        <TweakCell label="Lc" sub="C-prop" value={tweaks.cpropLayers} color={A_C}>
          <Slider value={tweaks.cpropLayers} min={0} max={8} step={1}
            color={A_C} onChange={v=>setTweak("cpropLayers", Math.round(v))}/>
        </TweakCell>

        <TweakCell label="显示" value="" color="#3d3a35">
          <div style={{display:"flex", gap:10, marginTop:2}}>
            <label style={{fontSize:10.5, display:"flex", gap:4, alignItems:"center", color:"#3d3a35", cursor:"pointer"}}>
              <input type="checkbox" checked={tweaks.showAttrGraph}
                onChange={e=>setTweak("showAttrGraph", e.target.checked)}/>
              属性图
            </label>
            <label style={{fontSize:10.5, display:"flex", gap:4, alignItems:"center", color:"#3d3a35", cursor:"pointer"}}>
              <input type="checkbox" checked={tweaks.animateIter}
                onChange={e=>setTweak("animateIter", e.target.checked)}/>
              逐层
            </label>
          </div>
        </TweakCell>
      </div>
    </div>
  );
}

window.TweaksPanel = TweaksPanel;
