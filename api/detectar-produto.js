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

// 2. Buscar todas as opções de campo (não só do contexto)
async function buscarTodasOpcoesDoCampo(customFieldId, auth, baseUrl) {
  const response = await axios.get(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/option/suggestions/edit`,
    {
      auth,
      params: {
        fieldId: customFieldId,
        // O Jira aceita busca parcial via `query`, mas deixamos vazio para trazer todas
      }
    }
  );
  return response.data?.suggestedOptions || [];
}

// 3. Criar nova opção no campo (tratando duplicadas)
async function criarOpcaoNoCampo(customFieldId, contextId, novoValor, auth, baseUrl) {
  const body = {
    options: [{ value: novoValor }]
  };

  try {
    await axios.post(
      `${baseUrl}/rest/api/3/field/${customFieldId}/context/${contextId}/option`,
      body,
      { auth }
    );
  } catch (error) {
    const mensagem = error.response?.data?.errorMessages?.[0] || "";
    if (mensagem.includes("must be unique in its field")) {
      console.warn(`⚠️ Opção "${novoValor}" já existe. Ignorando criação.`);
      return;
    }
    throw error;
  }
}

// 4. Atualizar campo na issue
async function atualizarCampoProdutoNaIssue(issueKey, produto, auth, baseUrl) {
  const customFieldId = "customfield_10878";

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

// 7. Comparação aproximada (case insensitive)
function encontrarProdutoSemelhante(nome, lista) {
  const nomeLower = nome.toLowerCase();
  return lista.find(
    opt => opt.value.toLowerCase() === nomeLower ||
           nomeLower.includes(opt.value.toLowerCase()) ||
           opt.value.toLowerCase().includes(nomeLower)
  );
}

// 8. Handler principal
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
  const contextId = "11104"; // contexto fixo (único agora)

  try {
    // 🔍 Buscar todas as issues do projeto
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

    // ➤ Usar Gemini para extrair produto
    const produtoExtraido = await extrairProdutoDoSummary(summary);
    if (!produtoExtraido) {
      return res.status(200).json({
        produto: "Não encontrado",
        error: "Produto não pôde ser extraído automaticamente"
      });
    }

    // 🔍 Verificar se produto extraído já existe nas opções do campo
    const todasOpcoes = await buscarTodasOpcoesDoCampo(customFieldId, auth, baseUrl);
    const similar = encontrarProdutoSemelhante(produtoExtraido, todasOpcoes);

    const valorFinal = similar?.value || produtoExtraido;

    if (!similar) {
      await criarOpcaoNoCampo(customFieldId, contextId, produtoExtraido, auth, baseUrl);
    }

    const novaIssueKey = await criarIssueNoJira(produtoExtraido, auth, projectKey, baseUrl);

    await atualizarCampoProdutoNaIssue(issueKey, valorFinal, auth, baseUrl);
    await adicionarComentarioNaIssue(
      issueKey,
      `Produto "${valorFinal}" não foi encontrado nas issues e foi criado automaticamente como ${novaIssueKey}.`,
      auth,
      baseUrl
    );

    return res.status(200).json({
      produto: valorFinal,
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
