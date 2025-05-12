require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

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

// Busca todos os summaries do projeto especificado
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

// Procura um nome de produto (summary) existente dentro do novo summary
async function detectarProduto(summary) {
  const todosSummaries = await buscarSummariesDoProjeto();

  for (let existente of todosSummaries) {
    if (summary.toLowerCase().includes(existente.toLowerCase())) {
      return existente;
    }
  }

  return null;
}

app.post('/detectar-produto', async (req, res) => {
  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: 'Resumo não fornecido' });

  try {
    const produto = await detectarProduto(summary);
    return res.json({ produto });
  } catch (error) {
    console.error('Erro ao consultar o Jira:', error.message);
    return res.status(500).json({ error: 'Erro ao consultar Jira' });
  }
});

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
