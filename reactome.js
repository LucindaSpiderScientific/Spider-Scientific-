const { fetchJSON } = require("../utils/fetchJSON");

async function fetchReactome(uniprot){
  if(!uniprot) return { pathways:[], apiStatus:[{ source:"Reactome", ok:false, status:"No UniProt ID", cached:false }] };

  const result = await fetchJSON(
    `https://reactome.org/ContentService/data/mapping/UniProt/${encodeURIComponent(uniprot)}/pathways?species=9606`,
    {},
    [],
    "Reactome"
  );

  const pathways = Array.isArray(result.data) ? result.data.map(x => ({
    name:x.displayName || x.name || "",
    stableId:x.stId || x.stableIdentifier || "",
    source:"Reactome",
    url:x.stId ? `https://reactome.org/content/detail/${x.stId}` : "https://reactome.org"
  })).filter(x => x.name).slice(0, 15) : [];

  return { pathways, apiStatus:[{ source:"Reactome", ok:result.ok, status:result.status, cached:result.cached, count:pathways.length }] };
}

module.exports = { fetchReactome };