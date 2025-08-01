import axios from "axios";

// 1. Extrair e validar nome do produto com Gemini
async function extrairProdutoValidoDoSummary(summary) {
  const API_KEY = process.env.GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

  const padraoResumo = /^.+\s*\/\s*.+\s*\/\s*\d+\s*$/;
  if (!padraoResumo.test(summary)) {
    console.warn("[AVISO] Resumo fora do padrão:", summary);
    return null;
  }

  const partes = summary.split(" /");
  let nomePossivel = partes[1]?.trim();
  if (!nomePossivel) return null;

  // Limpeza
  nomePossivel = nomePossivel
    .replace(/\s*-\s*.*$/, "")
    .replace(/\b(Annual|Anual|Mensal|Monthly|Yearly|Semestral|)\b/gi, "")
    .replace(/[^\w\s]/g, "")
    .trim();

  console.log("[EXTRAÇÃO] Nome possível extraído:", nomePossivel);

  const extracaoPrompt = `Esse texto representa um possível nome de software: "${nomePossivel}". Retorne apenas o nome do produto não envolvendo versão nem nada, sem explicações.`;

  try {
    const responseExtracao = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: extracaoPrompt }] }]
      })
    });

    const bodyExtracao = await responseExtracao.json();
    console.log("[DEBUG] Corpo da resposta (extração):", JSON.stringify(bodyExtracao));

    const produto = bodyExtracao?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

    console.log("[VALIDAÇÃO] Produto retornado pelo Gemini:", produto);

    if (!produto) {
      console.log("[INFO] Produto não pôde ser extraído ou validado");
      return null;
    }

    const validacaoPrompt = `"${produto}" é um software real, ferramenta ou produto de tecnologia conhecido? Responda apenas com "SIM" ou "NÃO".`;

    const responseValidacao = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: validacaoPrompt }] }]
      })
    });

    const bodyValidacao = await responseValidacao.json();
    console.log("[DEBUG] Corpo da resposta (validação):", JSON.stringify(bodyValidacao));

    const validacao = bodyValidacao?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() || "NÃO";

    console.log("[VALIDAÇÃO] Resultado da validação:", validacao);

    return validacao === "SIM" ? produto : null;

  } catch (error) {
    console.error("[ERRO] Erro ao consultar Gemini:", error.message);
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

// 3. Criar nova opção
async function criarOpcaoNoCampo(customFieldId, contextId, novoValor, auth, baseUrl) {
  const body = { options: [{ value: novoValor }] };

  try {
    await axios.post(
      `${baseUrl}/rest/api/3/field/${customFieldId}/context/${contextId}/option`,
      body,
      { auth }
    );
    console.log(`[INFO] Nova opção criada: ${novoValor}`);
  } catch (error) {
    const mensagem = error.response?.data?.errorMessages?.[0] || "";
    if (mensagem.includes("must be unique in its field")) {
      console.warn(`[INFO] Opção já existente ignorada: ${novoValor}`);
      return;
    }
    throw error;
  }
}

// 4. Atualizar campo
async function atualizarCampoProdutoNaIssue(issueKey, produto, auth, baseUrl) {
  const customFieldId = "customfield_10878";
  await axios.patch(
    `${baseUrl}/rest/api/3/issue/${issueKey}`,
    { fields: { [customFieldId]: { value: produto } } },
    { auth }
  );
  console.log(`[INFO] Produto "${produto}" atualizado na issue ${issueKey}`);
}

// 5. Criar issue auxiliar
async function criarIssueNoJira(produto, auth, projectKey, baseUrl) {
  const issueData = {
    fields: {
      project: { key: projectKey },
      summary: produto,
      issuetype: { name: "Task" }
    }
  };

  const response = await axios.post(`${baseUrl}/rest/api/3/issue`, issueData, { auth });
  console.log(`[INFO] Nova issue criada para produto "${produto}": ${response.data.key}`);
  return response.data.key;
}

// 6. Comentar issue
async function adicionarComentarioNaIssue(issueKey, comentario, auth, baseUrl) {
  await axios.post(
    `${baseUrl}/rest/api/3/issue/${issueKey}/comment`,
    { body: comentario },
    { auth }
  );
}

// 7. Produto semelhante
function encontrarProdutoSemelhante(nome, lista) {
  const nomeLower = nome.toLowerCase();
  return lista.find(
    opt =>
      opt.value.toLowerCase() === nomeLower ||
      nomeLower.includes(opt.value.toLowerCase()) ||
      opt.value.toLowerCase().includes(nomeLower)
  );
}

// 8. Handler principal
// [... código anterior intacto ...]

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { summary, issueKey } = req.body || {};
  if (!summary || !issueKey) {
    console.warn("[AVISO] Campos obrigatórios ausentes:", { summary, issueKey });
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
    console.log(`[INÍCIO] Processando issue ${issueKey} com summary: "${summary}"`);

    // ➤ Extrair e validar com Gemini
    const produtoExtraido = await extrairProdutoValidoDoSummary(summary);
    if (!produtoExtraido) {
      console.log("[INFO] Nenhum produto válido extraído pelo Gemini.");
      return res.status(200).json({
        produto: "Não encontrado",
        error: "Produto não pôde ser extraído ou não é reconhecido como software real"
      });
    }

    console.log(`[VALIDADO] Produto extraído e validado: "${produtoExtraido}"`);

    const opcoes = await buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl);
    const similar = encontrarProdutoSemelhante(produtoExtraido, opcoes);

    const valorFinal = similar?.value || produtoExtraido;
    if (similar) {
      console.log(`[INFO] Produto semelhante encontrado nas opções: "${similar.value}"`);
    } else {
      console.log(`[INFO] Produto não encontrado nas opções. Criando novo: "${produtoExtraido}"`);
      await criarOpcaoNoCampo(customFieldId, contextId, produtoExtraido, auth, baseUrl);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar propagação
    }

    await atualizarCampoProdutoNaIssue(issueKey, valorFinal, auth, baseUrl);

    let novaIssueKey = null;
    if (!similar) {
      novaIssueKey = await criarIssueNoJira(produtoExtraido, auth, projectKey, baseUrl);
      await adicionarComentarioNaIssue(
        issueKey,
        `Produto "${valorFinal}" não foi encontrado nas opções e foi criado automaticamente como issue ${novaIssueKey}.`,
        auth,
        baseUrl
      );
    }

    console.log(`[SUCESSO] Campo de produto atualizado na issue ${issueKey}`);

    return res.status(200).json({
      produto: valorFinal,
      criadoAutomaticamente: !similar,
      novaIssue: novaIssueKey,
      atualizadoNaIssueOriginal: true
    });

  } catch (error) {
    const erroDetalhado = error.response?.data || error.message || error;
    console.error("[ERRO] Erro geral ao processar:", erroDetalhado);
    return res.status(500).json({
      error: "Erro interno ao processar requisição",
      details: erroDetalhado
    });
  }
}