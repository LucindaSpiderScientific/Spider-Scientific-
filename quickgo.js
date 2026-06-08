const { fetchJSON } = require("../utils/fetchJSON");

async function fetchQuickGO(uniprot){
  if(!uniprot) return { terms:[], apiStatus:[{ source:"QuickGO", ok:false, status:"No UniProt ID", cached:false }] };

  const result = await fetchJSON(
    `https://www.ebi.ac.uk/QuickGO/services/annotation/search?geneProductId=UniProtKB:${encodeURIComponent(uniprot)}&taxonId=9606&aspect=biological_process&limit=80`,
    { headers:{ Accept:"application/json" } },
    { results:[] },
    "QuickGO"
  );

  const seen = new Set();
  const terms = (result.data.results || []).map(x => ({
    name:x.goName || x.goId || "",
    goId:x.goId || "",
    evidenceCode:x.evidenceCode || "",
    source:"QuickGO",
    url:x.goId ? `https://www.ebi.ac.uk/QuickGO/term/${x.goId}` : "https://www.ebi.ac.uk/QuickGO/"
  })).filter(x => {
    const key = x.goId || x.name;
    if(!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);

  return { terms, apiStatus:[{ source:"QuickGO", ok:result.ok, status:result.status, cached:result.cached, count:terms.length }] };
}

module.exports = { fetchQuickGO };