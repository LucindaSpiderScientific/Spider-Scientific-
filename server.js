const express = require("express");
const cors = require("cors");
const geneRoutes = require("./routes/gene");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({limit:"2mb"}));

app.get("/", (req,res) => {
  res.json({
    status:"Spider Scientific backend v2 running",
    routes:["/api/gene/TP53", "/api/search?q=TGF", "POST /api/gwas"]
  });
});

app.use("/api", geneRoutes);

app.listen(PORT, () => console.log(`Spider Scientific backend v2 running on port ${PORT}`));