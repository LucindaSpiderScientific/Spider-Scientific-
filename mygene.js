const { fetchJSON } = require("../utils/fetchJSON");
const { norm } = require("../utils/norm");

function getUniProt(meta){
  const u = meta?.uniprot || {};
  const swiss = u["Swiss-Prot"] || u.SwissProt;
  const trembl = u.TrEMBL;
  if(Array.isArray(swiss)) return swiss[0];
  if(typeof swiss === "string") return swiss;
  if(Array.isArray(trembl)) return trembl[0];
  if(typeof trembl === "string") return trembl;
  return "";
}

function getEnsembl(meta){
  const e = meta?.ensembl;
  if(!e) return "";
  if(typeof e === "string") return e;
  if(Array.isArray(e)) return e[0]?.gene || e[0] || "";
  return e.gene || "";
}

function getHGNC(meta){
  const h = meta?.hgnc;
  if(!h) return "";
  if(typeof h === "string") return h;
  return h.id || h.symbol || "";
}

function scoreHit(hit, query){
  const q = norm(query);
  let score = 0;
  if(norm(hit.symbol) === q) score += 120;
  if(String(hit.entrezgene || "") === query) score += 100;
  if(getEnsembl(hit).toUpperCase() === q) score += 100;
  if(getUniProt(hit).toUpperCase() === q) score += 100;
  const aliases = hit.alias || [];
  if(Array.isArray(aliases) && aliases.map(norm).includes(q)) score += 75;
  if(typeof aliases === "string" && norm(aliases) === q) score += 75;
  if((hit.type_of_gene || "").includes("protein-coding")) score += 10;
  if(hit.summary) score += 5;
  return score;
}

async function resolveGene(query){
  const q = String(query || "").trim();
  const fields = "symbol,name,summary,entrezgene,type_of_gene,go,pathway,uniprot,ensembl,hgnc,taxid,alias";
  const searches = [
    `symbol:${encodeURIComponent(q)}`,
    `alias:${encodeURIComponent(q)}`,
    `name:${encodeURIComponent(q)}`,
    encodeURIComponent(q)
  ];

  if(/^ENSG/i.test(q)) searches.unshift(`ensembl.gene:${encodeURIComponent(q)}`);
  if(/^\\d+$/.test(q)) searches.unshift(`entrezgene:${encodeURIComponent(q)}`);

  let allHits = [];
  const apiStatus = [];

  for(const s of searches){
    const result = await fetchJSON(
      `https://mygene.info/v3/query?q=${s}&species=human&size=10&fields=${fields}`,
      {},
      { hits: [] },
      "MyGene"
    );
    apiStatus.push({ source:"MyGene", query:s, ok:result.ok, status:result.status, cached:result.cached });
    if(result.data?.hits?.length) allHits.push(...result.data.hits);
  }

  const seen = new Set();
  allHits = allHits.filter(h => {
    const key = h._id || h.entrezgene || h.symbol;
    if(!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if(!allHits.length) return { gene:null, apiStatus };

  allHits.sort((a,b) => scoreHit(b,q) - scoreHit(a,q));
  return { gene:allHits[0], apiStatus };
}

async function searchGenes(q){
  const fields = "symbol,name,entrezgene,type_of_gene,uniprot,ensembl,hgnc";
  const result = await fetchJSON(
    `https://mygene.info/v3/query?q=${encodeURIComponent(q)}*&species=human&size=12&fields=${fields}`,
    {},
    { hits: [] },
    "MyGene"
  );
  const hits = (result.data.hits || []).map(h => ({
    symbol:h.symbol,
    name:h.name || "",
    entrez:h.entrezgene || "",
    uniprot:getUniProt(h),
    ensembl:getEnsembl(h)
  })).filter(h => h.symbol);
  return { hits, apiStatus:[{ source:"MyGene", ok:result.ok, status:result.status, cached:result.cached }] };
}

module.exports = { resolveGene, searchGenes, getUniProt, getEnsembl, getHGNC };