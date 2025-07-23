const axios = require("axios");

// 1. Normalizar texto para comparação
function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// 2. Verificar similaridade com opções do campo Produto
function encontrarProdutoSemelhante(nomeProduto, opcoes) {
  const nomeNormalizado = normalizarTexto(nomeProduto);
  return opcoes.find(
    (opt) => normalizarTexto(opt.value) === nomeNormalizado
  );
}

// 3. Buscar opções válidas do campo Produto
async function buscarOpcoesProduto(customFieldId, auth, baseUrl) {
  const response = await axios.get(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/option`,
    { auth }
  );
  return response.data.values;
}

// 4. Criar nova opção no campo Produto
async function criarNovaOpcaoProduto(customFieldId, nomeProduto, auth, baseUrl) {
  const response = await axios.post(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/option`,
    {
      options: [{ value: nomeProduto }],
    },
    { auth }
  );
  return response.data.options[0];
}

// 5. Atualizar campo Produto na issue
async function atualizarCampoProdutoNaIssue(issueKey, produto, auth, baseUrl) {
  const customFieldId = "customfield_10878";
  await axios.put(
    `${baseUrl}/rest/api/3/issue/${issueKey}`,
    {
      fields: {
        [customFieldId]: { value: produto },
      },
    },
    { auth }
  );
}

// 6. Extrair nome do produto com Gemini
async function extrairProdutoValidoDoSummary(summary) {
  const prompt = `Extraia APENAS o nome do software ou sistema do resumo abaixo. NÃO inclua informações como licenças, número de computadores, planos ou fabricantes.

Resumo: "${summary}"

Responda somente com o nome do software, como "Resolume Arena", "Bartender", "Windows 10", "SketchUp", etc. Se não houver nenhum, responda apenas com "N/A".`;

  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }
  );

  const texto = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return texto?.replace(/^"|"$/g, "") || "N/A";
}

// 7. Função principal da Vercel API
module.exports = async (req, res) => {
  const { issueKey, summary } = req.body;

  const customFieldId = "customfield_10878";
  const auth = {
    username: process.env.JIRA_EMAIL,
    password: process.env.JIRA_API_TOKEN,
  };
  const baseUrl = process.env.JIRA_BASE_URL;

  try {
    // Extrair produto com Gemini
    const produtoExtraido = await extrairProdutoValidoDoSummary(summary);
    console.log(`📦 Produto extraído: "${produtoExtraido}"`);

    if (!produtoExtraido || produtoExtraido.toLowerCase() === "n/a") {
      return res.status(400).json({ error: "Nenhum produto identificado no summary." });
    }

    // Buscar opções atuais do campo
    const opcoes = await buscarOpcoesProduto(customFieldId, auth, baseUrl);

    // Verificar similaridade ou inclusão
    let similar = encontrarProdutoSemelhante(produtoExtraido, opcoes);

    if (!similar) {
      for (const opt of opcoes) {
        if (normalizarTexto(produtoExtraido).includes(normalizarTexto(opt.value))) {
          similar = opt;
          console.log(`🔁 Produto extraído inclui uma opção existente: usando "${opt.value}"`);
          break;
        }
      }
    }

    const valorFinal = similar?.value || produtoExtraido;

    // Se não for uma opção existente, cria
    if (!similar) {
      console.warn(`⚠️ Produto "${produtoExtraido}" não corresponde a nenhuma opção existente. Será criado.`);
      await criarNovaOpcaoProduto(customFieldId, produtoExtraido, auth, baseUrl);
    }

    // Atualizar o campo na issue
    await atualizarCampoProdutoNaIssue(issueKey, valorFinal, auth, baseUrl);

    res.status(200).json({
      message: `Campo Produto atualizado com "${valorFinal}" na issue ${issueKey}`,
    });
  } catch (error) {
    console.error("Erro ao atualizar produto:", error.response?.data || error.message);
    res.status(500).json({
      error: "Erro interno ao processar requisição",
      details: error.response?.data || error.message,
    });
  }
};
