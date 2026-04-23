// Real DGAC math engine (toy scale, 20 nodes).
// Runs actual sparse-ish diffusion: H ← α·Â·H + H₀, k-means, C-prop.
// All ops are plain JS arrays — no deps. Complexity trivial at N=20.

(function(){
  const D = 6; // embedding dim for diffusion

  // ---------- linear algebra helpers ----------
  function zeros(n, d){ return Array.from({length:n}, ()=>new Array(d).fill(0)); }
  function clone2D(M){ return M.map(r=>r.slice()); }
  function matVec(M, v){ // M: n×n, v: n → n
    const n = M.length, out = new Array(n).fill(0);
    for (let i=0;i<n;i++){
      let s=0; const Mi = M[i];
      for (let j=0;j<n;j++) s += Mi[j]*v[j];
      out[i]=s;
    }
    return out;
  }
  function matMul(A, B){ // A: n×n, B: n×d → n×d
    const n = A.length, d = B[0].length;
    const out = zeros(n, d);
    for (let i=0;i<n;i++){
      const Ai = A[i], oi = out[i];
      for (let k=0;k<n;k++){
        const aik = Ai[k]; if (!aik) continue;
        const Bk = B[k];
        for (let j=0;j<d;j++) oi[j] += aik*Bk[j];
      }
    }
    return out;
  }
  function addInto(A, B){ // A += B (both n×d) in-place
    for (let i=0;i<A.length;i++)
      for (let j=0;j<A[0].length;j++)
        A[i][j] += B[i][j];
    return A;
  }
  function scale(A, s){
    return A.map(r=>r.map(x=>x*s));
  }
  function norm(v){ let s=0; for (let i=0;i<v.length;i++) s+=v[i]*v[i]; return Math.sqrt(s); }
  function cos(a,b){ const na=norm(a), nb=norm(b); if (na<1e-9||nb<1e-9) return 0; let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s/(na*nb); }

  // deterministic pseudo-RNG so re-renders are stable
  function makeRng(seed){
    let s = seed>>>0;
    return () => { s = (s*1664525 + 1013904223) >>> 0; return s/4294967296; };
  }

  // ---------- build Â = D^{-1/2}(A+I)D^{-1/2} from edge list ----------
  function buildAhat(N, edges){
    const A = zeros(N, N);
    for (let i=0;i<N;i++) A[i][i] = 1; // self-loop
    edges.forEach(([a,b])=>{ A[a][b] = 1; A[b][a] = 1; });
    const deg = A.map(r=>r.reduce((s,x)=>s+x,0));
    const dinv = deg.map(d => d>0 ? 1/Math.sqrt(d) : 0);
    const Ahat = zeros(N,N);
    for (let i=0;i<N;i++)
      for (let j=0;j<N;j++)
        Ahat[i][j] = dinv[i]*A[i][j]*dinv[j];
    return Ahat;
  }

  // ---------- initial features H₀ ----------
  // The viz has specific node types designed so each pipeline stage visibly helps:
  //   - clean nodes (most):   features match truth → easy
  //   - feature-outliers:     features match WRONG cluster → only topology branch saves
  //   - topo-outliers:        features fine, but neighbors are cross-cluster → only attr saves
  //   - confused nodes:       both features and topology mildly wrong → only C-prop saves
  function buildH0(nodes, mode, seed=42){
    const rng = makeRng(seed);
    const N = nodes.length;
    const centers = [];
    const spread = 0.9;  // strong feature separation when uncorrupted
    for (let c=0;c<4;c++){
      const v = new Array(D).fill(0);
      v[c] = spread;
      v[(c+2) % D] = -spread*0.3;
      centers.push(v);
    }
    const noise = mode==="homo" ? 0.25 : 0.30;
    // In hetero mode: declare which nodes have corrupted FEATURES (wrong cluster center).
    // These are the nodes topology-branch must fix.
    const featWrong = mode==="homo" ? new Set() : new Set([1, 8, 15, 18, 6]);
    const H0 = zeros(N, D);
    for (let i=0;i<N;i++){
      const truthC = nodes[i].cluster;
      const featC = featWrong.has(i) ? (truthC+1)%4 : truthC;
      for (let k=0;k<D;k++){
        H0[i][k] = centers[featC][k] + (rng()*2-1)*noise;
      }
    }
    return { H0, centers, featWrong };
  }

  // ---------- attribute kNN graph Ŝ from H₀ ----------
  function buildAttrAhat(H0, k=3){
    const N = H0.length;
    const S = zeros(N, N);
    for (let i=0;i<N;i++) S[i][i] = 1;
    for (let i=0;i<N;i++){
      const sims = [];
      for (let j=0;j<N;j++){
        if (j===i) continue;
        sims.push({j, s: cos(H0[i], H0[j])});
      }
      sims.sort((a,b)=>b.s-a.s);
      for (let t=0; t<k; t++){
        const j = sims[t].j;
        S[i][j] = 1; S[j][i] = 1;
      }
    }
    const deg = S.map(r=>r.reduce((s,x)=>s+x,0));
    const dinv = deg.map(d => d>0 ? 1/Math.sqrt(d) : 0);
    const Shat = zeros(N,N);
    for (let i=0;i<N;i++)
      for (let j=0;j<N;j++)
        Shat[i][j] = dinv[i]*S[i][j]*dinv[j];
    // extract edge list for viz
    const edges = [];
    for (let i=0;i<N;i++)
      for (let j=i+1;j<N;j++)
        if (S[i][j]>0) edges.push([i,j]);
    return { Shat, attrEdges: edges };
  }

  // ---------- run diffusion: H ← α·M·H + H₀ for L steps ----------
  function diffuse(M, H0, alpha, L){
    let H = clone2D(H0);
    for (let l=0; l<L; l++){
      const MH = matMul(M, H);
      for (let i=0;i<H.length;i++)
        for (let j=0;j<H[0].length;j++)
          H[i][j] = alpha*MH[i][j] + H0[i][j];
    }
    return H;
  }

  // ---------- k-means (deterministic init from first K rows) ----------
  function kmeans(H, K, maxIter=10, seed=7){
    const N = H.length, D = H[0].length;
    const rng = makeRng(seed);
    // init: pick K points spread out (furthest-first)
    const picks = [Math.floor(rng()*N)];
    while (picks.length < K){
      let best=-1, bestD=-1;
      for (let i=0;i<N;i++){
        if (picks.includes(i)) continue;
        let minD = Infinity;
        for (const p of picks){
          let d=0; for (let k=0;k<D;k++){ const x=H[i][k]-H[p][k]; d+=x*x; }
          if (d<minD) minD=d;
        }
        if (minD>bestD){ bestD=minD; best=i; }
      }
      picks.push(best);
    }
    let centers = picks.map(p => H[p].slice());
    let assign = new Array(N).fill(0);
    for (let it=0; it<maxIter; it++){
      // assign
      const newAssign = new Array(N).fill(0);
      for (let i=0;i<N;i++){
        let best=0, bd=Infinity;
        for (let c=0;c<K;c++){
          let d=0; for (let k=0;k<D;k++){ const x=H[i][k]-centers[c][k]; d+=x*x; }
          if (d<bd){ bd=d; best=c; }
        }
        newAssign[i]=best;
      }
      // check convergence
      let changed=false;
      for (let i=0;i<N;i++) if (newAssign[i]!==assign[i]){ changed=true; break; }
      assign = newAssign;
      // update
      const newC = zeros(K, D), counts = new Array(K).fill(0);
      for (let i=0;i<N;i++){
        counts[assign[i]]++;
        for (let k=0;k<D;k++) newC[assign[i]][k] += H[i][k];
      }
      for (let c=0;c<K;c++)
        if (counts[c]>0) for (let k=0;k<D;k++) newC[c][k] /= counts[c];
      centers = newC;
      if (!changed) break;
    }
    return { assign, centers };
  }

  // ---------- one-hot → diffuse → argmax (C-prop) ----------
  // In the paper this uses residual (α·ÂC + C₀). For the toy viz we use plain
  // α·ÂC + (1-α)·C₀ — a convex mix — so that a node's argmax CAN flip when
  // majority of neighbors disagree. Also makes Lc have a visible effect.
  function cprop(Ahat, assignInit, K, alpha, Lc){
    const N = assignInit.length;
    const C0 = zeros(N, K);
    for (let i=0;i<N;i++) C0[i][assignInit[i]] = 1;
    // Build row-stochastic P from Ahat's sparsity: P[i][j] = 1/deg(i) for neighbors
    // (incl. self-loop). This gives clean majority-vote semantics for C-prop so that
    // a node with majority-disagreeing neighbors actually flips.
    const P = zeros(N, N);
    for (let i=0;i<N;i++){
      let deg = 0;
      for (let j=0;j<N;j++) if (Ahat[i][j] > 1e-9) deg++;
      if (deg === 0) { P[i][i] = 1; continue; }
      for (let j=0;j<N;j++) if (Ahat[i][j] > 1e-9) P[i][j] = 1/deg;
    }
    let C = clone2D(C0);
    for (let l=0; l<Lc; l++){
      const MC = matMul(P, C);
      for (let i=0;i<N;i++)
        for (let k=0;k<K;k++)
          C[i][k] = alpha*MC[i][k] + (1-alpha)*C0[i][k];
    }
    const assign = C.map(row => {
      let best=0, bv=-Infinity;
      for (let k=0;k<row.length;k++) if (row[k]>bv){ bv=row[k]; best=k; }
      return best;
    });
    return { C, assign };
  }

  // ---------- cluster-matching accuracy (hungarian-lite for K=4) ----------
  // Tries all K! permutations — fine for K=4 (24 perms).
  function matchAccuracy(pred, truth, K){
    const perms = [];
    const permHelper = (a, k) => {
      if (k===a.length){ perms.push(a.slice()); return; }
      for (let i=k;i<a.length;i++){
        [a[k],a[i]]=[a[i],a[k]];
        permHelper(a, k+1);
        [a[k],a[i]]=[a[i],a[k]];
      }
    };
    permHelper(Array.from({length:K},(_,i)=>i), 0);
    let best = 0;
    for (const p of perms){
      let c=0;
      for (let i=0;i<pred.length;i++) if (p[pred[i]]===truth[i]) c++;
      if (c>best) best = c;
    }
    return best / pred.length;
  }

  // ---------- top-level: run full DGAC pipeline for given tweaks ----------
  // Returns everything the UI needs, cheap enough to run per tweak change.
  function runDGAC(G, tweaks){
    const { alpha, beta, topLayers, attrLayers, cpropLayers, dataset } = tweaks;
    const nodes = G.nodes;
    const N = nodes.length;
    const K = 4;
    const truth = nodes.map(n => n.cluster);

    const Ahat = buildAhat(N, G.edges);
    const { H0, centers: featCenters } = buildH0(nodes, dataset);
    const { Shat, attrEdges } = buildAttrAhat(H0, 3);

    const Ht = diffuse(Ahat, H0, alpha, topLayers);
    const Ha = diffuse(Shat, H0, alpha, attrLayers);

    // fusion
    const H = zeros(N, D);
    for (let i=0;i<N;i++)
      for (let k=0;k<D;k++)
        H[i][k] = beta*Ht[i][k] + (1-beta)*Ha[i][k];

    const km = kmeans(H, K);
    const refined = cprop(Ahat, km.assign, K, alpha, cpropLayers);

    const accKm = matchAccuracy(km.assign, truth, K);
    const accFinal = matchAccuracy(refined.assign, truth, K);

    return {
      N, K, Ahat, Shat, H0, Ht, Ha, H, km, refined, attrEdges,
      accKm, accFinal, truth,
    };
  }

  // ---------- 2D projection for viz ----------
  // We use the first 2 dims of H (after centering) as a 2D "semantic" offset.
  // Stable across tweaks because H0 is seeded.
  function project2D(H){
    const N = H.length;
    const mean = [0,0];
    for (let i=0;i<N;i++){ mean[0]+=H[i][0]; mean[1]+=H[i][1]; }
    mean[0]/=N; mean[1]/=N;
    const pts = H.map(r => [r[0]-mean[0], r[1]-mean[1]]);
    // normalize to roughly [-1,1]
    let mx = 0;
    pts.forEach(p => { mx = Math.max(mx, Math.abs(p[0]), Math.abs(p[1])); });
    if (mx<1e-6) mx = 1;
    return pts.map(p => [p[0]/mx, p[1]/mx]);
  }

  window.DGAC_MATH = {
    runDGAC, project2D, buildH0, buildAttrAhat, buildAhat, diffuse, kmeans, cprop, matchAccuracy,
  };
})();
