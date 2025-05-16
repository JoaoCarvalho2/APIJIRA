import axios from "axios";
import stringSimilarity from "string-similarity";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { summary } = req.body;

  if (!summary) {
    return res.status(400).json({ error: "Resumo não fornecido" });
  }

  const JIRA_EMAIL = process.env.JIRA_EMAIL;
  const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
  const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
  const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

  const auth = {
    username: JIRA_EMAIL,
    password: JIRA_API_TOKEN,
  };

  try {
    let allIssues = [];
    let startAt = 0;
    const maxResults = 100;
    let total = 0;

    do {
      const url = `${JIRA_BASE_URL}/rest/api/3/search?jql=project=${JIRA_PROJECT_KEY}&startAt=${startAt}&maxResults=${maxResults}`;
      const response = await axios.get(url, { auth });
      const issues = response.data.issues;

      allIssues = allIssues.concat(issues);
      startAt += maxResults;
      total = response.data.total;
    } while (startAt < total);

    const summaries = allIssues.map(issue => issue.fields.summary);

    console.log("📨 Summary recebido:", summary);
    console.log("🔍 Comparando com summaries do Jira...");

    const bestMatch = stringSimilarity.findBestMatch(summary, summaries);
    const produtoEncontrado = bestMatch.bestMatch.rating > 0.4 ? bestMatch.bestMatch.target : null;

    if (produtoEncontrado) {
      console.log("✅ Produto encontrado:", produtoEncontrado);
      return res.status(200).json({
        produto: produtoEncontrado,
        summaryRecebido: summary,
        similaridade: bestMatch.bestMatch.rating.toFixed(2)
      });
    } else {
      console.log("❌ Produto não encontrado");
      return res.status(200).json({
        produto: "Não encontrado",
        summaryRecebido: summary,
        summariesDoProjeto: summaries
      });
    }
  } catch (error) {
    console.error("❗ Erro ao buscar dados do Jira:", error.message);
    return res.status(500).json({ error: "Erro ao buscar dados do Jira" });
  }
}
