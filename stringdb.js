const { fetchJSON } = require("../utils/fetchJSON");
const { norm } = require("../utils/norm");

async function fetchString(symbol){
  const statuses = [];
  let result = await fetchJSON(
    `https://string-db.org/api/json/network?identifiers=${encodeURIComponent(symbol)}&species=9606&required_score=700`,
    {},
    [],
    "STRING"
  );
  statuses.push({ source:"STRING", ok:result.ok, status:result.status, cached:result.cached, threshold:700 });
  let data = Array.isArray(result.data) ? result.data : [];

  if(data.length < 5){
    result = await fetchJSON(
      `https://string-db.org/api/json/network?identifiers=${encodeURIComponent(symbol)}&species=9606&required_score=400`,
      {},
      [],
      "STRING"
    );
    statuses.push({ source:"STRING", ok:result.ok, status:result.status, cached:result.cached, threshold:400 });
    data = Array.isArray(result.data) ? result.data : [];
  }

  return { data, apiStatus:statuses };
}

function cleanInteractions(raw, coreSymbol){
  const core = norm(coreSymbol);
  const seen = new Set();
  const out = [];
  raw.forEach(x => {
    const a = norm(x.preferredName_A);
    const b = norm(x.preferredName_B);
    const partner = a === core ? b : a;
    if(partner && partner !== core && !seen.has(partner)){
      seen.add(partner);
      out.push({
        symbol:partner,
        stringScore:Number(x.score || 0),
        evidenceTrail:[{
          source:"STRING",
          label:"Protein interaction confidence",
          value:Number(x.score || 0),
          url:"https://string-db.org"
        }]
      });
    }
  });
  return out.sort((a,b) => b.stringScore - a.stringScore).slice(0, 16);
}

module.exports = { fetchString, cleanInteractions };