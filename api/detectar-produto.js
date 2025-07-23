import axios from "axios";

// 1. Extrair e validar nome do produto
async function extrairProdutoValidoDoSummary(summary) {
  const API_KEY = process.env.GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-latest:generateContent?key=${API_KEY}`;

  // Tenta extrair com regex
  const match = summary.match(/^(.+?)\s*\/\s*(.+?)\s*\/\s*(\d+)\s*$/);
  const nomeSoftwareRegex = match ? match[2].trim() : null;

  if (nomeSoftwareRegex) {
    const validacaoPrompt = `"${nomeSoftwareRegex}" é um software real, ferramenta ou produto de tecnologia conhecido? Responda apenas com "SIM" ou "NÃO".`;

    const responseValidacao = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: validacaoPrompt }] }] })
    });

    const validacao = responseValidacao?.ok
      ? (await responseValidacao.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase()
      : "NÃO";

    if (validacao === "SIM") return { produto: nomeSoftwareRegex, viaRegex: true };
  }

  // Se regex não funcionou, tenta Gemini
  const extracaoPrompt = `A partir deste resumo, extraia apenas o nome do produto ou software mencionado:\n\n"${summary}"\n\nA resposta deve conter apenas o nome do produto ou software, sem explicações.`;

  try {
    const responseExtracao = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: extracaoPrompt }] }] })
    });

    const produto = responseExtracao?.ok
      ? (await responseExtracao.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      : null;

    if (!produto) return nomeSoftwareRegex ? { produto: nomeSoftwareRegex, viaRegex: true } : null;

    const validacaoPrompt = `"${produto}" é um software real, ferramenta ou produto de tecnologia conhecido? Responda apenas com "SIM" ou "NÃO".`;

    const responseValidacao = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: validacaoPrompt }] }] })
    });

    const validacao = responseValidacao?.ok
      ? (await responseValidacao.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase()
      : "NÃO";

    if (validacao === "SIM") return { produto, viaRegex: false };

    // Fallback final: tenta retornar o nome do meio via regex mesmo sem validar
    return nomeSoftwareRegex ? { produto: nomeSoftwareRegex, viaRegex: true } : null;

  } catch (error) {
    console.error("❗ Erro ao consultar Gemini:", error.message);
    return nomeSoftwareRegex ? { produto: nomeSoftwareRegex, viaRegex: true } : null;
  }
}

async function buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl) {
  const response = await axios.get(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/${contextId}/option`,
    { auth }
  );
  return response.data.values || [];
}

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

async function adicionarComentarioNaIssue(issueKey, comentario, auth, baseUrl) {
  const corpo = comentario.replace(/"/g, '\\"');
  await axios.post(
    `${baseUrl}/rest/api/3/issue/${issueKey}/comment`,
    { body: corpo },
    { auth }
  );
}

function encontrarProdutoSemelhante(nome, lista) {
  const nomeLower = nome.toLowerCase();
  return lista.find(
    opt => opt.value.toLowerCase() === nomeLower ||
           nomeLower.includes(opt.value.toLowerCase()) ||
           opt.value.toLowerCase().includes(nomeLower)
  );
}

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
  const contextId = "11104";

  try {
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

    // ➤ Extrair e validar produto
    const extracao = await extrairProdutoValidoDoSummary(summary);
    if (!extracao || !extracao.produto) {
      return res.status(200).json({
        produto: "Não encontrado",
        error: "Produto não pôde ser extraído ou validado"
      });
    }

    const opcoes = await buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl);
    const similar = encontrarProdutoSemelhante(extracao.produto, opcoes);
    const valorFinal = similar?.value || extracao.produto;

    if (!similar) {
      await criarOpcaoNoCampo(customFieldId, contextId, extracao.produto, auth, baseUrl);
    }

    const novaIssueKey = await criarIssueNoJira(extracao.produto, auth, projectKey, baseUrl);

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
      atualizadoNaIssueOriginal: true,
      viaRegex: extracao.viaRegex
    });

  } catch (error) {
    console.error("❗ Erro geral:", error.response?.data || error.message || error);
    return res.status(500).json({
      error: "Erro interno ao processar requisição",
      details: error.response?.data || error.message || error
    });
  }
}
