import axios from "axios";

// 🔁 Delay para aguardar criação da opção no campo
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// 🎯 Regex: extrair o valor entre as barras
function extrairEntreBarras(texto) {
  const match = texto.match(/^.+\s*\/\s*(.+?)\s*\/\s*\d+\s*$/);
  return match?.[1]?.trim() || null;
}

// 1. Extrair e validar nome do produto com Gemini
async function extrairProdutoValidoDoSummary(summary) {
  const API_KEY = process.env.GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-latest:generateContent?key=${API_KEY}`;

  const textoBase = extrairEntreBarras(summary) || summary;

  const extracaoPrompt = `A partir deste nome, diga apenas o nome do software ou produto:\n\n"${textoBase}"\n\nA resposta deve conter apenas o nome do produto, sem explicações.`;

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

// ... [demais funções permanecem iguais] ...

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
  const contextId = "11104";

  try {
    // 🔍 Buscar summaries existentes
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
    const similar = encontrarProdutoSemelhante(produtoExtraido, opcoes);

    const valorFinal = similar?.value || produtoExtraido;

    if (!similar) {
      await criarOpcaoNoCampo(customFieldId, contextId, produtoExtraido, auth, baseUrl);
      await delay(3000); // 🕒 Espera 3 segundos para o Jira propagar a nova opção
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
