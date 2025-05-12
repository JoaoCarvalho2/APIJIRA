import axios from 'axios';

const {
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_BASE_URL,
  JIRA_PROJECT_KEY
} = process.env;

const auth = {
  username: JIRA_EMAIL,
  password: JIRA_API_TOKEN
};

// ... resto do código


async function buscarSummariesDoProjeto() {
  const jql = `project=${JIRA_PROJECT_KEY}`;
  const url = `${JIRA_BASE_URL}/rest/api/3/search`;

  const response = await axios.get(url, {
    auth,
    params: {
      jql,
      fields: 'summary',
      maxResults: 100
    }
  });

  return response.data.issues.map(issue => issue.fields.summary);
}

async function detectarProduto(summary) {
  const todosSummaries = await buscarSummariesDoProjeto();
  for (let existente of todosSummaries) {
    if (summary.toLowerCase().includes(existente.toLowerCase())) {
      return existente;
    }
  }
  return null;
}

// ⚠️ Exporta handler compatível com Vercel
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: 'Resumo não fornecido' });

  try {
    const produto = await detectarProduto(summary);
    return res.status(200).json({ produto });
  } catch (error) {
    console.error('Erro ao consultar o Jira:', error.message);
    return res.status(500).json({ error: 'Erro ao consultar Jira' });
  }
}


