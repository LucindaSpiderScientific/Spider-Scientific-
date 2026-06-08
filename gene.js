const express = require("express");
const router = express.Router();

const { resolveGene, searchGenes, getUniProt, getEnsembl, getHGNC } = require("../services/mygene");
const { fetchString, cleanInteractions } = require("../services/stringdb");
const { fetchReactome } = require("../services/reactome");
const { fetchQuickGO } = require("../services/quickgo");
const { classify, evidenceWeights } = require("../scoring/classify");
const { norm } = require("../utils/norm");

function fallbackGenes(symbol){
  const tgfb = /^TGFB|^TGFBR|^SMAD/.test(norm(symbol));
  const rows = tgfb ? [
    ["TGFBR1","TGF beta receptor 1","signaling",["growth","development"],.96],
    ["TGFBR2","TGF beta receptor 2","signaling",["immune","growth"],.95],
    ["SMAD2","SMAD family member 2","signaling",["development"],.92],
    ["SMAD3","SMAD family member 3","signaling",["immune","growth"],.91],
    ["SMAD4","SMAD family member 4","signaling",["development"],.89],
    ["LTBP1","latent TGF beta binding protein 1","matrix",["development"],.82],
    ["ENG","endoglin","development",["matrix","signaling"],.79],
    ["FOXP3","forkhead box P3","immune",["growth"],.75],
    ["IL10","interleukin 10","immune",["signaling"],.72],
    ["COL1A1","collagen type I alpha 1 chain","matrix",["development"],.69],
    ["MMP2","matrix metallopeptidase 2","matrix",["growth"],.66],
    ["AKT1","AKT serine/threonine kinase 1","metabolism",["growth","signaling"],.64]
  ] : [
    ["MDM2","MDM2 proto-oncogene","growth",["signaling"],.96],
    ["ATM","ATM serine/threonine kinase","signaling",["growth"],.94],
    ["CHEK2","checkpoint kinase 2","signaling",["growth"],.91],
    ["BRCA1","BRCA1 DNA repair associated","growth",["disease"],.89],
    ["CDKN1A","cyclin dependent kinase inhibitor 1A","growth",["signaling"],.88],
    ["BAX","BCL2 associated X","growth",[],.84],
    ["CASP3","caspase 3","growth",["immune"],.81],
    ["E2F1","E2F transcription factor 1","signaling",[],.78],
    ["MYC","MYC proto-oncogene","growth",["disease"],.76],
    ["SIRT1","sirtuin 1","metabolism",[],.74],
    ["CTNNB1","catenin beta 1","signaling",["development"],.71],
    ["GADD45A","growth arrest and DNA damage inducible alpha","growth",[],.69]
  ];

  return rows.map(x => ({
    symbol:x[0],
    name:x[1],
    summary:"Fallback demo evidence. Production mode should show live API status rather than treating this as scientific evidence.",
    primary:x[2],
    secondary:x[3],
    stringScore:x[4],
    confidence:x[4],
    hgnc:"-",
    uniprot:"-",
    ensembl:"-",
    entrez:"-",
    reactome:[],
    quickgo:[],
    evidenceTrail:[{source:"Fallback", label:"Demo fallback data", value:x[4], url:""}],
    evidenceByCategory:{},
    evidence:{ string:false, mygene:false, reactome:false, quickgo:false, fallback:true }
  }));
}

function metricsFromGenes(genes, kind){
  const counts = {};
  if(kind === "functions"){
    genes.forEach(g => g.quickgo.slice(0,5).forEach(x => counts[x.name] = (counts[x.name] || 0) + ((evidenceWeights[x.evidenceCode] ?? 2) / 7)));
  }else if(kind === "pathways"){
    genes.forEach(g => g.reactome.slice(0,5).forEach(x => counts[x.name] = (counts[x.name] || 0) + 1));
  }else if(kind === "overlap"){
    genes.filter(g => g.secondary.length).forEach(g => counts[g.symbol] = g.secondary.length + 1);
  }else if(kind === "sources"){
    counts["STRING interactions"] = genes.filter(g => g.evidence.string).length;
    counts["MyGene annotations"] = genes.filter(g => g.evidence.mygene).length;
    counts["Reactome matches"] = genes.filter(g => g.evidence.reactome).length;
    counts["QuickGO matches"] = genes.filter(g => g.evidence.quickgo).length;
  }
  return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5);
}

async function enrichPartner(partner, index){
  const statuses = [];
  const resolved = await resolveGene(partner.symbol);
  statuses.push(...resolved.apiStatus);
  const meta = resolved.gene;
  const uniprot = getUniProt(meta);

  let reactome = [], quickgo = [];

  if(index < 12 && uniprot){
    const [r, q] = await Promise.all([fetchReactome(uniprot), fetchQuickGO(uniprot)]);
    reactome = r.pathways;
    quickgo = q.terms;
    statuses.push(...r.apiStatus, ...q.apiStatus);
  }

  const cat = classify(partner.symbol, meta, reactome, quickgo);
  const sourceCount = 1 + (meta ? 1 : 0) + (reactome.length ? 1 : 0) + (quickgo.length ? 1 : 0);
  const confidence = Math.min(.99, (partner.stringScore || 0) * .62 + sourceCount * .08 + cat.secondary.length * .03);

  const evidenceTrail = [
    ...(partner.evidenceTrail || []),
    ...(reactome.slice(0,5).map(x => ({source:"Reactome", label:x.name, value:1, url:x.url}))),
    ...(quickgo.slice(0,5).map(x => ({source:"QuickGO", label:x.name, value:x.evidenceCode || "", url:x.url})))
  ];

  return {
    symbol:partner.symbol,
    name:meta?.name || "",
    summary:meta?.summary || "",
    type:meta?.type_of_gene || "",
    entrez:meta?.entrezgene || "",
    uniprot,
    ensembl:getEnsembl(meta),
    hgnc:getHGNC(meta),
    stringScore:partner.stringScore,
    primary:cat.primary,
    secondary:cat.secondary,
    catScores:cat.scores,
    evidenceByCategory:cat.evidenceByCategory,
    confidence,
    reactome,
    quickgo,
    evidenceTrail,
    apiStatus:statuses,
    evidence:{ string:true, mygene:Boolean(meta), reactome:reactome.length > 0, quickgo:quickgo.length > 0, fallback:false }
  };
}

async function buildGenePayload(query){
  const apiStatus = [];
  const resolved = await resolveGene(query);
  apiStatus.push(...resolved.apiStatus);
  const coreMeta = resolved.gene;

  if(!coreMeta){
    return {
      query:norm(query),
      core:{ symbol:norm(query), name:"Gene not resolved" },
      genes:fallbackGenes(query),
      metrics:{},
      apiStatus,
      fallback:true,
      message:"Gene could not be resolved through exact, alias, name, Ensembl or Entrez search."
    };
  }

  const symbol = norm(coreMeta.symbol || query);
  const stringResult = await fetchString(symbol);
  apiStatus.push(...stringResult.apiStatus);
  const partners = cleanInteractions(stringResult.data, symbol);

  if(!partners.length){
    return {
      query:symbol,
      core:{
        symbol,
        name:coreMeta.name || "",
        summary:coreMeta.summary || "",
        entrez:coreMeta.entrezgene || "",
        uniprot:getUniProt(coreMeta),
        ensembl:getEnsembl(coreMeta),
        hgnc:getHGNC(coreMeta),
        type:coreMeta.type_of_gene || ""
      },
      genes:fallbackGenes(symbol),
      metrics:{},
      apiStatus,
      fallback:true,
      message:"Gene resolved, but no usable STRING partners returned. Fallback graph used."
    };
  }

  const genes = [];
  for(let i=0;i<partners.length;i+=4){
    const batch = partners.slice(i, i+4);
    const enriched = await Promise.all(batch.map((p, offset) => enrichPartner(p, i+offset)));
    enriched.forEach(g => apiStatus.push(...g.apiStatus));
    genes.push(...enriched);
  }

  return {
    query:symbol,
    core:{
      symbol,
      name:coreMeta.name || "",
      summary:coreMeta.summary || "",
      entrez:coreMeta.entrezgene || "",
      uniprot:getUniProt(coreMeta),
      ensembl:getEnsembl(coreMeta),
      hgnc:getHGNC(coreMeta),
      type:coreMeta.type_of_gene || ""
    },
    genes,
    metrics:{
      functions:metricsFromGenes(genes,"functions"),
      pathways:metricsFromGenes(genes,"pathways"),
      overlap:metricsFromGenes(genes,"overlap"),
      sources:metricsFromGenes(genes,"sources")
    },
    apiStatus,
    fallback:false
  };
}

router.get("/search", async (req,res) => {
  const q = String(req.query.q || "").trim();
  if(q.length < 2) return res.json({ hits:[] });
  const result = await searchGenes(q);
  res.json(result);
});

router.get("/gene/:query", async (req,res) => {
  try{
    res.json(await buildGenePayload(req.params.query));
  }catch(err){
    res.json({
      query:norm(req.params.query),
      core:{symbol:norm(req.params.query)},
      genes:fallbackGenes(req.params.query),
      metrics:{},
      apiStatus:[{source:"Backend", ok:false, status:err.message}],
      fallback:true,
      error:err.message
    });
  }
});

router.post("/gwas", express.json({limit:"2mb"}), async (req,res) => {
  const genes = String(req.body.genes || "")
    .split(/[\n,\t ;]+/)
    .map(norm)
    .filter(Boolean)
    .slice(0,40);

  const summaries = [];
  for(const gene of genes){
    const payload = await buildGenePayload(gene);
    const overlapCount = (payload.genes || []).filter(g => g.secondary?.length).length;
    summaries.push({
      query:payload.query,
      name:payload.core?.name || "",
      relatedGenes:(payload.genes || []).length,
      overlapCount,
      topPathways:payload.metrics?.pathways || [],
      topFunctions:payload.metrics?.functions || [],
      fallback:payload.fallback
    });
  }

  res.json({ count:summaries.length, genes:summaries });
});

module.exports = router;