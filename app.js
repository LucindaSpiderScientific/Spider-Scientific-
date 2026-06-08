
const API_BASE = "http://localhost:3000";
// When deployed, replace with your backend URL:
// const API_BASE = "https://your-backend.onrender.com";

const graphArea = document.getElementById("graphArea");
document.getElementById("apiBaseText").textContent = API_BASE;
let currentPayload = null;

function setStatus(t){ document.getElementById("status").textContent = t; }
function setEngine(t, cls="online"){
  // Evidence Engine display was replaced by useful network statistics.
  // This function remains so loading/status logic does not break.
}

function colorFor(type){
  return {signaling:"var(--green)",growth:"var(--orange)",disease:"var(--blue)",metabolism:"var(--yellow)",matrix:"var(--cyan)",immune:"var(--red)",development:"var(--purple)"}[type] || "white";
}
function metricColor(key){ return {functions:"var(--orange)",pathways:"var(--purple)",sources:"var(--blue)",overlap:"var(--yellow)"}[key]; }

function getMetricRows(genes, key, metrics){
  if(metrics && metrics[key] && metrics[key].length) return metrics[key];
  const counts = {};
  if(key === "overlap") genes.filter(g => (g.secondary || []).length).forEach(g => counts[g.symbol] = g.secondary.length + 1);
  if(key === "sources"){
    counts["STRING interactions"] = genes.filter(g=>g.evidence?.string).length;
    counts["MyGene annotations"] = genes.filter(g=>g.evidence?.mygene).length;
    counts["Reactome matches"] = genes.filter(g=>g.evidence?.reactome).length;
    counts["QuickGO matches"] = genes.filter(g=>g.evidence?.quickgo).length;
  }
  return Object.entries(counts).slice(0,5);
}

function renderApiStatus(statuses=[]){
  const box = document.getElementById("apiStatusBox");
  const latest = statuses.slice(-10).reverse();
  box.innerHTML = latest.length ? latest.map(s => `
    <div class="api-row">
      <span>${s.source}${s.threshold ? " " + s.threshold : ""}</span>
      <b class="${s.ok ? "api-ok" : "api-bad"}">${s.cached ? "cached" : s.status}</b>
    </div>
  `).join("") : `<div class="api-row"><span>No API calls yet</span><b>-</b></div>`;
}

function renderMetrics(genes, metrics){
  const box = document.getElementById("metricsGrid");
  const cards = [
    ["functions","FUNCTIONS",getMetricRows(genes,"functions",metrics),"QuickGO biological-process evidence"],
    ["pathways","PATHWAYS",getMetricRows(genes,"pathways",metrics),"Reactome pathway associations"],
    ["overlap","OVERLAP GENES",getMetricRows(genes,"overlap",metrics),"Genes shared across contexts"],
    ["sources","API COVERAGE",getMetricRows(genes,"sources",metrics),"Backend source coverage"]
  ];
  box.innerHTML = cards.map(([key,title,list,sub]) => {
    const color = metricColor(key);
    const max = Math.max(1, ...list.map(x => Number(x[1]) || 0));
    const rows = list.length ? list.map(x => {
      const val = Number(x[1]) || 0;
      const pct = Math.max(5, Math.round((val / max) * 100));
      const display = key === "overlap" ? Math.round(val) + " ctx" : Math.round(val * 10) / 10;
      return `<div class="metric-item"><span>${x[0]}</span><b>${display}</b></div><div class="meter" style="color:${color}"><span style="width:${pct}%"></span></div>`;
    }).join("") : `<div class="metric-item"><span>No data</span><b>-</b></div>`;
    return `<div class="metric-card"><div class="metric-head"><div><div class="metric-title" style="color:${color}">${title}</div><div style="color:#777;font-size:.75rem;margin-top:5px">${sub}</div></div><div class="metric-number" style="color:${color}">${list.length}</div></div><div class="metric-list">${rows}</div></div>`;
  }).join("");
}

function renderEvidenceTrail(gene){
  const trail = gene?.evidenceTrail || [];
  const rows = trail.length ? trail.slice(0,10).map(x => `
    <div class="process-row">
      <span>${x.label}<small>${x.source}${x.value ? " · " + x.value : ""}</small></span>
      <b>${x.source}</b>
    </div>
  `) : `<div class="process-row"><span>No detailed evidence trail available</span><b>-</b></div>`;
  document.getElementById("processList").innerHTML = rows;
}

function drawGraph(payload){
  currentPayload = payload;
  graphArea.querySelectorAll(".gene-node,.spoke").forEach(x => x.remove());

  const core = payload.core || {};
  const genes = payload.genes || [];
  const metrics = payload.metrics || {};
  const coreSymbol = payload.query || core.symbol || "GENE";

  document.getElementById("coreLabel").textContent = coreSymbol;
  document.getElementById("coreName").textContent = core.name || "";
  document.getElementById("selectedSymbol").textContent = coreSymbol;
  document.getElementById("selectedName").textContent = core.name || "";
  document.getElementById("geneId").textContent = core.entrez || "-";
  document.getElementById("ensemblId").textContent = core.ensembl || "-";
  document.getElementById("uniprotId").textContent = core.uniprot || "-";
  document.getElementById("typeTag").textContent = core.type || "Gene";
  document.getElementById("mainTag").textContent = payload.fallback ? "Fallback data" : "Live Evidence";
  document.getElementById("description").textContent = core.summary || payload.message || "No summary returned.";

  const overlapN = genes.filter(g => (g.secondary || []).length).length;
  document.getElementById("nodeCount").textContent = genes.length + " RELATED GENES";
  document.getElementById("overlapCount").textContent = overlapN + " OVERLAPS";
  document.getElementById("statGenes").textContent = genes.length;
  document.getElementById("statOverlaps").textContent = overlapN;
  document.getElementById("statFunctions").textContent = (metrics.functions || []).length;
  document.getElementById("statPathways").textContent = (metrics.pathways || []).length;

  document.getElementById("topRelated").textContent = genes.length;
  document.getElementById("topOverlaps").textContent = overlapN;
  document.getElementById("topPathways").textContent = (metrics.pathways || []).length;
  document.getElementById("topFunctions").textContent = (metrics.functions || []).length;

  const evidenceTotal = genes.reduce((a,g)=>a + (g.reactome?.length || 0) + (g.quickgo?.length || 0) + (g.evidenceTrail?.length || 0), 0);
  document.getElementById("evidenceTotal").textContent = evidenceTotal;
  const mean = genes.length ? genes.reduce((a,g)=>a+(g.confidence||0),0)/genes.length : 0;
  document.getElementById("confidenceScore").textContent = mean.toFixed(2);
  document.getElementById("confidenceLabel").textContent = mean > .75 ? "High Confidence" : mean > .45 ? "Moderate Confidence" : "Limited Evidence";
  document.getElementById("gauge").style.setProperty("--gauge", Math.round(mean*100)+"%");

  const rect = graphArea.getBoundingClientRect();
  const cx = rect.width * .5, cy = rect.height * .5, radius = Math.min(rect.width, rect.height) * .36;

  genes.forEach((g,i)=>{
    const angle = (-90 + i * (360 / Math.max(1, genes.length))) * Math.PI/180;
    const nx = cx + radius * Math.cos(angle), ny = cy + radius * Math.sin(angle);
    const dx = nx - cx, dy = ny - cy, len = Math.hypot(dx,dy), ang = Math.atan2(dy,dx) * 180/Math.PI;

    const line = document.createElement("div");
    line.className = "spoke";
    line.style.left = cx+"px"; line.style.top = cy+"px"; line.style.width = len+"px"; line.style.transform = `rotate(${ang}deg)`; line.style.color = colorFor(g.primary);
    graphArea.appendChild(line);

    const node = document.createElement("div");
    node.className = "gene-node" + ((g.secondary || []).length ? " overlap" : "");
    node.style.left = (nx-39)+"px"; node.style.top = (ny-39)+"px"; node.style.color = colorFor(g.primary);
    node.innerHTML = `<div>${g.symbol}<small>${Math.round((g.stringScore||0)*100)}%</small></div>`;
    node.onclick = () => selectGene(g);
    graphArea.appendChild(node);
  });

  renderMetrics(genes, metrics);
  renderEvidenceTrail(genes[0]);
  renderApiStatus(payload.apiStatus || []);
}

function selectGene(g){
  document.getElementById("selectedSymbol").textContent = g.symbol;
  document.getElementById("selectedName").textContent = g.name || "";
  document.getElementById("geneId").textContent = g.entrez || "-";
  document.getElementById("ensemblId").textContent = g.ensembl || "-";
  document.getElementById("uniprotId").textContent = g.uniprot || "-";
  document.getElementById("mainTag").textContent = (g.secondary || []).length ? "Overlap gene" : "Related gene";
  document.getElementById("description").textContent = g.summary || `${g.symbol} is shown as a related gene.`;
  document.getElementById("confidenceScore").textContent = (g.confidence || 0).toFixed(2);
  document.getElementById("confidenceLabel").textContent = (g.confidence || 0) > .75 ? "High Confidence" : (g.confidence || 0) > .45 ? "Moderate Confidence" : "Limited Evidence";
  document.getElementById("gauge").style.setProperty("--gauge", Math.round((g.confidence || 0)*100)+"%");
  renderEvidenceTrail(g);
}

async function runSearch(){
  const query = (document.getElementById("searchInput").value || "TP53").trim();
  if(!query) return;
  setEngine("● LOADING","warn");
  setStatus("Searching backend and evidence sources...");
  document.getElementById("suggestions").style.display = "none";

  try{
    const response = await fetch(`${API_BASE}/api/gene/${encodeURIComponent(query)}`);
    const payload = await response.json();
    drawGraph(payload);
    if(payload.fallback){
      setEngine("● FALLBACK","warn");
      setStatus(payload.message || "Fallback data shown. Check API status panel.");
    }else{
      setEngine("● ONLINE","online");
      setStatus("Loaded live backend-combined evidence from STRING, MyGene, Reactome and QuickGO.");
    }
  }catch(err){
    setEngine("● OFFLINE","warn");
    setStatus("Could not reach backend. Start backend or replace API_BASE in frontend/app.js with your live backend URL.");
  }
}

let autoTimer = null;
async function autocomplete(){
  clearTimeout(autoTimer);
  autoTimer = setTimeout(async () => {
    const q = document.getElementById("searchInput").value.trim();
    const box = document.getElementById("suggestions");
    if(q.length < 2){ box.style.display = "none"; return; }
    try{
      const r = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
      const data = await r.json();
      box.innerHTML = "";
      if(!data.hits || !data.hits.length){ box.style.display = "none"; return; }
      data.hits.slice(0,8).forEach(hit => {
        const item = document.createElement("div");
        item.className = "suggestion";
        item.innerHTML = `<b>${hit.symbol}</b><small>${hit.name || ""}</small>`;
        item.onclick = () => { document.getElementById("searchInput").value = hit.symbol; box.style.display = "none"; runSearch(); };
        box.appendChild(item);
      });
      box.style.display = "block";
    }catch(e){ box.style.display = "none"; }
  }, 250);
}

function download(filename, text){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type:"application/json"}));
  a.download = filename;
  a.click();
}

document.getElementById("saveProject").onclick = () => {
  if(!currentPayload) return;
  localStorage.setItem("spiderScientificLastProject", JSON.stringify(currentPayload));
  setStatus("Project saved in this browser.");
};

document.getElementById("exportJSON").onclick = () => {
  if(!currentPayload) return;
  download(`spider-scientific-${currentPayload.query || "gene"}.json`, JSON.stringify(currentPayload,null,2));
};

document.getElementById("exportPNG").onclick = () => {
  setStatus("Use your browser print/save or screenshot tool to export the graph as an image.");
  window.print();
};

document.getElementById("runGwas").onclick = async () => {
  const genes = document.getElementById("gwasInput").value.trim();
  if(!genes) return;
  setStatus("Analysing gene list...");
  try{
    const r = await fetch(`${API_BASE}/api/gwas`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({genes})
    });
    const data = await r.json();
    const box = document.getElementById("gwasResults");
    box.style.display = "block";
    box.innerHTML = `<div class="side-title">GWAS / GENE LIST RESULTS</div><div class="gwas-grid">${
      data.genes.map(g => `<div class="gwas-item"><b>${g.query}</b><small style="display:block;color:#888">${g.name}</small><div>Related: ${g.relatedGenes}</div><div>Overlaps: ${g.overlapCount}</div></div>`).join("")
    }</div>`;
    setStatus("Gene list analysed.");
  }catch(e){
    setStatus("Gene list analysis failed. Check backend.");
  }
};

document.getElementById("searchBtn").onclick = runSearch;
document.getElementById("searchInput").addEventListener("input", autocomplete);
document.getElementById("searchInput").addEventListener("keypress", e => { if(e.key === "Enter") runSearch(); });
document.addEventListener("click", e => { if(!e.target.closest(".search")) document.getElementById("suggestions").style.display = "none"; });

runSearch();
