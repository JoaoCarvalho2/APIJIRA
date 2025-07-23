import axios from "axios";

// Função para extrair o nome do produto usando regex
function extrairNomeProduto(summary) {
  // Padrão: "Empresa / Produto / Número"
  const regex = /^[^\/]+\/\s*([^\/]+)\/\s*\d+/;
  const match = summary.match(regex);
  
  if (match && match[1]) {
    // Remove informações de versão/licença (opcional)
    const produto = match[1]
      .replace(/(Professional|Enterprise|Standard|License|Workstation|\d+\.\d+|\(.*\))/gi, '')
      .trim();
    
    return produto;
  }
  return null;
}

// Buscar opções do campo no contexto
async function buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl) {
  const response = await axios.get(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/${contextId}/option`,
    { auth }
  );
  return response.data.values || [];
}

// Criar nova opção no campo
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

// Atualizar campo da issue
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

// Comparação de nomes semelhantes
function encontrarProdutoSemelhante(nome, lista) {
  const nomeLower = nome.toLowerCase().trim();
  return lista.find(opt => {
    const optLower = opt.value.toLowerCase().trim();
    return optLower === nomeLower || 
           nomeLower.includes(optLower) || 
           optLower.includes(nomeLower);
  });
}

// Handler principal
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
  const customFieldId = "customfield_10878";
  const contextId = "11104";

  try {
    // Extrair nome do produto usando regex
    const produtoExtraido = extrairNomeProduto(summary);
    if (!produtoExtraido) {
      return res.status(400).json({ error: "Não foi possível extrair o nome do produto do summary" });
    }

    // Buscar opções existentes no campo
    const opcoes = await buscarOpcoesDoCampo(customFieldId, contextId, auth, baseUrl);
    
    // Verificar se já existe uma opção similar
    const similar = encontrarProdutoSemelhante(produtoExtraido, opcoes);
    const valorFinal = similar?.value || produtoExtraido;

    // Se não encontrou similar, cria nova opção
    if (!similar) {
      await criarOpcaoNoCampo(customFieldId, contextId, produtoExtraido, auth, baseUrl);
    }

    // Atualiza a issue original com o valor encontrado/criado
    await atualizarCampoProdutoNaIssue(issueKey, valorFinal, auth, baseUrl);

    return res.status(200).json({
      produto: valorFinal,
      criadoAutomaticamente: !similar,
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