import axios from "axios";

// 1. Extrair e validar nome do produto com Gemini
async function extrairProdutoValidoDoSummary(summary) {
  const API_KEY = process.env.GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

  const padraoResumo = /^.+\s*\/\s*.+\s*\/\s*\d+\s*$/;
  if (!padraoResumo.test(summary)) {
    console.warn("[AVISO] Resumo fora do padrão:", summary);
    return { produto: null, validado: false };
  }

  const partes = summary.split(" /");
  let nomePossivel = partes[1]?.trim();
  if (!nomePossivel) return { produto: null, validado: false };

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

    console.log("Resposta do Gemini extraçãoPrompt", extracaoPrompt);

    const bodyExtracao = await responseExtracao.json();
    console.log("[DEBUG] Corpo da resposta (extração):", JSON.stringify(bodyExtracao));

    const produto = bodyExtracao?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

    console.log("[VALIDAÇÃO] Produto retornado pelo Gemini:", produto);

    if (!produto) {
      console.log("[INFO] Produto não pôde ser extraído");
      return { produto: null, validado: false };
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

    return {
      produto,
      validado: validacao === "SIM"
    };

  } catch (error) {
    console.error("[ERRO] Erro ao consultar Gemini:", error.message);
    return { produto: null, validado: false };
  }
}

// Handler principal (webhook)
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { summary, issueKey } = req.body || {};
  if (!summary || !issueKey) {
    console.warn("[AVISO] Campos obrigatórios ausentes:", { summary, issueKey });
    return res.status(400).json({ error: "Resumo ou issueKey não fornecido" });
  }

  try {
    console.log(`[INÍCIO] Processando issue ${issueKey} com summary: "${summary}"`);

    const { produto, validado } = await extrairProdutoValidoDoSummary(summary);

    if (!produto) {
      console.log("[INFO] Nenhum produto foi extraído.");
      return res.status(200).json({
        produto: "Não encontrado",
        validado: false,
        error: "Produto não pôde ser extraído"
      });
    }

    console.log(`[RESULTADO] Produto: "${produto}" | Validado: ${validado}`);

    return res.status(200).json({
      produto,
      validado
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
