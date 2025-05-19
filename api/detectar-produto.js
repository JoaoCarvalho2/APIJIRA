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

// 2. Buscar opções do campo
async function buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl) {
  const response = await axios.get(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/${contextId}/option`,
    { auth }
  );
  return response.data.values || [];
}


// 3. Criar nova opção no campo
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

// 4. Atualizar campo na issue
async function atualizarCampoProdutoNaIssue(issueKey, produto, auth, baseUrl) {
  const customFieldId = "customfield_10878";

  const contextId = "11104";
  const opcoes = await buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl);

  const existe = opcoes.some(opt => opt.value.toLowerCase() === produto.toLowerCase());

  if (!existe) {
    const contextId = "11104"; // ID fixo do contexto padrão global
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

// 5. Criar nova issue no projeto
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

// 6. Comentar na issue original
async function adicionarComentarioNaIssue(issueKey, comentario, auth, baseUrl) {
  await axios.post(
    `${baseUrl}/rest/api/3/issue/${issueKey}/comment`,
    { body: comentario },
    { auth }
  );
}

// 7. Handler principal
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { summary, issueKey } = req.body || {};
  if (!summary || !issueKey) {
    return res.status(400).json({ error: "Resumo ou issueKey não fornecido" });
  }

  const auth = {
    username: process.env.JIRA_EMAIL,
    password: process.env.JIRA_API_TOKEN,
  };

  const baseUrl = process.env.JIRA_BASE_URL;
  const projectKey = process.env.JIRA_PROJECT_KEY;
  const customFieldId = "customfield_10878";

  try {
    // Buscar todas as issues do projeto
    let allIssues = [];
    let startAt = 0;
    const maxResults = 100;
    let total = 0;

    do {
      const response = await axios.get(
        `${baseUrl}/rest/api/3/search?jql=project=${projectKey}&startAt=${startAt}&maxResults=${maxResults}`,
        { auth }
      );

      allIssues = allIssues.concat(response.data.issues);
      total = response.data.total;
      startAt += maxResults;
    } while (startAt < total);

    const summaries = allIssues.map(issue => issue.fields.summary);
    const summaryLower = summary.toLowerCase();

    const produtoEncontrado = summaries.find(s =>
      summaryLower.includes(s.toLowerCase()) || s.toLowerCase().includes(summaryLower)
    );

    if (produtoEncontrado) {
      await atualizarCampoProdutoNaIssue(issueKey, produtoEncontrado, auth, baseUrl);
      return res.status(200).json({
        produto: produtoEncontrado,
        criadoAutomaticamente: false,
        atualizadoNaIssueOriginal: true
      });
    }

    const produtoExtraido = await extrairProdutoDoSummary(summary);
    if (!produtoExtraido) {
      return res.status(200).json({
        produto: "Não encontrado",
        error: "Produto não pôde ser extraído automaticamente"
      });
    }

    const novaIssueKey = await criarIssueNoJira(produtoExtraido, auth, projectKey, baseUrl);
    await atualizarCampoProdutoNaIssue(issueKey, produtoExtraido, auth, baseUrl);
    await adicionarComentarioNaIssue(
      issueKey,
      `Produto "${produtoExtraido}" não foi encontrado e foi criado automaticamente como ${novaIssueKey}.`,
      auth,
      baseUrl
    );

    return res.status(200).json({
      produto: produtoExtraido,
      criadoAutomaticamente: true,
      novaIssue: novaIssueKey,
      atualizadoNaIssueOriginal: true
    });

  } catch (error) {
    console.error("❗ Erro geral:", error.response?.data || error.message || error);
    return res.status(500).json({
      error: "Erro interno ao processar requisição",
      details: error.response?.data || error.message || error
    });
  }
}
