import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { issueKey, summary } = req.body;
  const baseUrl = process.env.JIRA_URL;
  const auth = {
    username: process.env.JIRA_USER,
    password: process.env.JIRA_TOKEN,
  };

  const customFieldId = 'customfield_10072';

  try {
    const produto = await encontrarProduto(summary);
    let valorFinal = produto;

    const opcoes = await buscarOpcoesCampo(customFieldId, auth, baseUrl);
    const existe = opcoes.some(opcao => opcao.value.toLowerCase() === produto.toLowerCase());

    if (!existe) {
      await criarOpcaoNoCampo(customFieldId, produto, auth, baseUrl);
      await esperar(4000); // Aguarda 4 segundos para o Jira registrar a nova opção
    }

    await atualizarCampoComRetry(issueKey, valorFinal, auth, baseUrl);

    res.status(200).json({ sucesso: true, produto });
  } catch (error) {
    console.error('Erro geral:', error);
    res.status(500).json({ erro: error.message });
  }
}

async function encontrarProduto(summary) {
  const prompt = `Extraia apenas o nome do produto ou software mencionado nesse texto:
"""
${summary}
"""

Se não houver produto, responda apenas com "Indefinido".`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  let produto = response.text().trim();

  // Se Gemini falhar, aplica regex para tentar capturar nome do software
  if (!produto || produto.toLowerCase() === 'indefinido') {
    const match = summary.match(/\/\s*([^/]+)\s*\/\s*\d+$/);
    if (match) {
      produto = match[1].trim();
      console.warn('Fallback para regex. Produto extraído:', produto);
    } else {
      throw new Error('Não foi possível extrair o nome do produto.');
    }
  }

  return produto;
}

async function buscarOpcoesCampo(customFieldId, auth, baseUrl) {
  const response = await axios.get(`${baseUrl}/rest/api/3/field/${customFieldId}/context/option`, { auth });
  return response.data.values || [];
}

async function criarOpcaoNoCampo(customFieldId, nome, auth, baseUrl) {
  const response = await axios.get(`${baseUrl}/rest/api/3/field/${customFieldId}/context`, { auth });
  const contextId = response.data.values[0].id;

  await axios.post(
    `${baseUrl}/rest/api/3/field/${customFieldId}/context/${contextId}/option`,
    { options: [{ value: nome }] },
    { auth }
  );
}

async function atualizarCampoProdutoNaIssue(issueKey, produto, auth, baseUrl) {
  await axios.put(
    `${baseUrl}/rest/api/3/issue/${issueKey}`,
    {
      fields: {
        customfield_10072: { value: produto },
      },
    },
    { auth }
  );
}

async function atualizarCampoComRetry(issueKey, produto, auth, baseUrl, tentativas = 3, delayMs = 3000) {
  for (let i = 0; i < tentativas; i++) {
    try {
      await atualizarCampoProdutoNaIssue(issueKey, produto, auth, baseUrl);
      return;
    } catch (error) {
      const mensagem = error.response?.data || error.message;
      console.warn(`Tentativa ${i + 1} falhou: ${mensagem}`);
      if (i < tentativas - 1) {
        await esperar(delayMs);
      } else {
        throw new Error(`Falha ao atualizar campo após ${tentativas} tentativas.`);
      }
    }
  }
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
