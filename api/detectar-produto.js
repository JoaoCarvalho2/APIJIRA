import axios from "axios";

// Função para normalizar texto (sem acento, caixa baixa, etc.)
function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Comparação de nomes semelhantes
function encontrarProdutoSemelhante(nome, lista) {
  const nomeNormalizado = normalizarTexto(nome);
  return lista.find(opt => {
    const optVal = normalizarTexto(opt.value);
    return optVal === nomeNormalizado ||
           nomeNormalizado.includes(optVal) ||
           optVal.includes(nomeNormalizado);
  });
}

// 1. Extrair e validar nome do produto com Gemini
async function extrairProdutoValidoDoSummary(summary) {
  const API_KEY = process.env.GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;

  const extracaoPrompt = `A partir deste resumo, extraia apenas o nome do produto ou software mencionado:\n\n"${summary}"\n\nA resposta deve conter apenas o nome do produto, sem explicações.`;

  try {
    const responseExtracao = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: extracaoPrompt }] }] })
    });

    const produto = responseExtracao?.ok
      ? (await responseExtracao.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      : null;

    if (!produto) return null;

    const validacaoPrompt = `"${produto}" é um software real, ferramenta ou produto de tecnologia conhecido? Responda apenas com "SIM" ou "NÃO".`;

    const responseValidacao = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: validacaoPrompt }] }] })
    });

    const validacao = responseValidacao?.ok
      ? (await responseValidacao.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase()
      : "NÃO";

    return validacao === "SIM" ? produto : null;

  } catch (error) {
    console.error("❗ Erro ao consultar Gemini:", error.message);
    return null;
  }
}

// 2. Buscar opções do campo no contexto
async function buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl) {
  const response = await axios.get(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/${contextId}/option`,
    { auth }
  );
  return response.data.values || [];
}

// 3. Criar nova opção no campo
async function criarOpcaoNoCampo(customFieldId, contextId, novoValor, auth, baseUrl) {
  const body = { options: [{ value: novoValor }] };

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

// 4. Atualizar campo da issue
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

// 5. Criar issue no Jira
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

// 6. Adicionar comentário
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
  const contextId = "11104";

  try {
    // 🔍 Buscar todas as summaries das issues do projeto
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

    // ➤ Extrair e validar com Gemini
    const produtoExtraido = await extrairProdutoValidoDoSummary(summary);
    if (!produtoExtraido) {
      return res.status(200).json({
        produto: "Não encontrado",
        error: "Produto não pôde ser extraído ou não é reconhecido como software real"
      });
    }

    // 🔍 Verificar se já existe no campo
    const opcoes = await buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl);
    let opcaoExistente = encontrarProdutoSemelhante(produtoExtraido, opcoes);

    let valorFinal = produtoExtraido;

    if (!opcaoExistente) {
      await criarOpcaoNoCampo(customFieldId, contextId, produtoExtraido, auth, baseUrl);
      await new Promise(resolve => setTimeout(resolve, 1500)); // esperar 1.5s
      const novasOpcoes = await buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl);
      opcaoExistente = encontrarProdutoSemelhante(produtoExtraido, novasOpcoes);
      if (!opcaoExistente) {
        throw new Error(`Nova opção "${produtoExtraido}" não foi localizada após criação.`);
      }
    }

    valorFinal = opcaoExistente.value;

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
