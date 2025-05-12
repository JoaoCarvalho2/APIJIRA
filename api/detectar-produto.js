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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { summary } = req.body;

  if (!summary) {
    return res.status(400).json({ error: 'Resumo não fornecido' });
  }

  try {
    const response = await axios.get(
      `${JIRA_BASE_URL}/rest/api/3/search?jql=project=${JIRA_PROJECT_KEY}`,
      { auth }
    );

    const issues = response.data.issues;
    const produtoEncontrado = issues.find(issue =>
        issue.fields.summary.toLowerCase().includes(summary.toLowerCase())
      )?.fields.summary;
      
      
    if (!produtoEncontrado) {
      return res.status(200).json({ produto: 'Não encontrado', summary });
    }

    return res.status(200).json({ produto: produtoEncontrado, summary });
  } catch (error) {
    console.error(error.response?.data || error.message);
    return res.status(500).json({ error: 'Erro ao buscar issues do Jira' });
  }
}
