import axios from "axios";

// 1. Extrair produto com Gemini
async function extrairProdutoDoSummary(summary) {
  const API_KEY = process.env.GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;

  const prompt = `A partir deste resumo, extraia apenas o nome do produto ou software mencionado:\n\n"${summary}"\n\nA resposta deve conter apenas o nome do produto, sem explicações.`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (error) {
    console.error("❗ Erro ao consultar Gemini:", error.message);
    return null;
  }
}

// 2. Criação de issue
async function criarIssueNoJira(produto, auth, projectKey, baseUrl) {
  const issueData = {
    fields: {
      project: { key: projectKey },
      summary: produto,
      issuetype: { name: "Task" }
    }
  };

  const response = await axios.post(`${baseUrl}/rest/api/3/issue`, issueData, { auth });
  return response.data.key;
}

// 3. Comentário
async function adicionarComentarioNaIssue(issueKey, comentario, auth, baseUrl) {
  await axios.post(
    `${baseUrl}/rest/api/3/issue/${issueKey}/comment`,
    { body: comentario },
    { auth }
  );
}

// 4. Atualizar campo personalizado
async function buscarOpcoesDoCampo(customFieldId, auth, baseUrl) {
  const response = await axios.get(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/option`,
    { auth }
  );
  return response.data.values || [];
}

async function buscarContextoDoCampo(customFieldId, auth, baseUrl) {
  const response = await axios.get(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context`,
    { auth }
  );
  return response.data.values?.[0]?.id;
}

async function criarOpcaoNoCampo(customFieldId, contextId, novoValor, auth, baseUrl) {
  const body = {
    options: [{ value: novoValor }]
  };

  await axios.post(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/${contextId}/option`,
    body,
    { auth }
  );
}

async function atualizarCampoProdutoNaIssue(issueKey, produto, auth, baseUrl) {
  const customFieldId = "customfield_10878";

  const opcoes = await buscarOpcoesDoCampo(customFieldId, auth, baseUrl);
  const existe = opcoes.some(opt => opt.value.toLowerCase() === produto.toLowerCase());

  if (!existe) {
    const contextId = await buscarContextoDoCampo(customFieldId, auth, baseUrl);
    await criarOpcaoNoCampo(customFieldId, contextId, produto, auth, baseUrl);
  }

  await axios.put(
    `${baseUrl}/rest/api/3/issue/${issueKey}`,
    {
      fields: {
        [customFieldId]: { value: produto }
      }
    },
    { auth }
  );
}

// 5. Handler principal
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { summary, issueKey } = req.body || {};

  if (!summary || !issueKey) {
    console.error("❌ summary ou issueKey ausente:", { summary, issueKey });
    return res.status(400).json({ error: "Resumo ou issueKey não fornecido" });
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
    // Buscar summaries existentes
    let allIssues = [];
    let startAt = 0;
    const maxResults = 100;
    let total = 0;

    do {
      const url = `${JIRA_BASE_URL}/rest/api/3/search?jql=project=${JIRA_PROJECT_KEY}&startAt=${startAt}&maxResults=${maxResults}`;
      const response = await axios.get(url, { auth });

      allIssues = allIssues.concat(response.data.issues);
      startAt += maxResults;
      total = response.data.total;
    } while (startAt < total);

    const summaries = allIssues.map(issue => issue.fields.summary);
    const summaryLower = summary.toLowerCase();
    summaries.sort((a, b) => b.length - a.length);

    const produtoEncontrado = summaries.find(s =>
      summaryLower.includes(s.toLowerCase()) || s.toLowerCase().includes(summaryLower)
    );

    if (produtoEncontrado) {
      await atualizarCampoProdutoNaIssue(issueKey, produtoEncontrado, auth, JIRA_BASE_URL);

      return res.status(200).json({
        produto: produtoEncontrado,
        summaryRecebido: summary,
        criadoAutomaticamente: false,
        atualizadoNaIssueOriginal: true
      });
    }

    const produtoExtraido = await extrairProdutoDoSummary(summary);
    if (!produtoExtraido) {
      return res.status(200).json({
        produto: "Não encontrado",
        summaryRecebido: summary,
        error: "Produto não pôde ser extraído automaticamente"
      });
    }

    const novaIssueKey = await criarIssueNoJira(produtoExtraido, auth, JIRA_PROJECT_KEY, JIRA_BASE_URL);
    await atualizarCampoProdutoNaIssue(issueKey, produtoExtraido, auth, JIRA_BASE_URL);
    await adicionarComentarioNaIssue(
      issueKey,
      `Produto "${produtoExtraido}" não foi encontrado e foi criado automaticamente como ${novaIssueKey}.`,
      auth,
      JIRA_BASE_URL
    );

    return res.status(200).json({
      produto: produtoExtraido,
      criadoAutomaticamente: true,
      novaIssue: novaIssueKey,
      summaryRecebido: summary,
      atualizadoNaIssueOriginal: true
    });

  } catch (error) {
    console.error("❗ Erro geral:", error.message);
    return res.status(500).json({ error: "Erro interno ao processar requisição" });
  }
}
