const fetch = global.fetch;
async function go() {
  try {
    const res = await fetch("https://staging2.silhouetteamerica.com/rest/V1/products?searchCriteria[pageSize]=2&searchCriteria[currentPage]=1", {
      headers: { "Authorization": "Bearer dve87aciyyc8hfrhtiknskudu35p7iy6", "Content-Type": "application/json" }
    });
    console.log("Status:", res.status);
    const txt = await res.text();
    console.log("Response:", txt.substring(0, 500));
  } catch(e) { console.error(e); }
}
go();
