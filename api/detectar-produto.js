import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { issueKey, summary } = req.body;
  const baseUrl = process.env.JIRA_BASE_URL;
  const auth = {
    username: process.env.JIRA_EMAIL,
    password: process.env.JIRA_API_TOKEN,
  };

  const customFieldId = 'customfield_10072';

  try {
    const produto = await extrairProduto(summary);
    const opcoes = await buscarOpcoesCampo(customFieldId, auth, baseUrl);
    const existe = opcoes.some(opcao => opcao.value.toLowerCase() === produto.toLowerCase());

    if (!existe) {
      await criarOpcaoNoCampo(customFieldId, produto, auth, baseUrl);
      await esperar(4000); // Aguarda o Jira registrar
    }

    await atualizarCampoComRetry(issueKey, produto, auth, baseUrl);
    res.status(200).json({ sucesso: true, produto });
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ error: error.message });
  }
}

async function extrairProduto(summary) {
  const prompt = `Extraia apenas o nome do produto ou software mencionado no texto abaixo. Se não houver produto, responda somente "Indefinido".
\n"""
${summary}
"""`;

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  let produto = response.text().trim();

  if (!produto || produto.toLowerCase() === 'indefinido') {
    const match = summary.match(/\/\s*([^/]+)\s*\/\s*\d+$/);
    if (match) {
      produto = match[1].trim();
    } else {
      throw new Error('Produto não identificado via Gemini ou regex');
    }
  }

  return produto;
}

async function buscarOpcoesCampo(customFieldId, auth, baseUrl) {
  const url = `${baseUrl}/rest/api/3/field/${customFieldId}/context/option`;
  const { data } = await axios.get(url, { auth });
  return data.values || [];
}

async function criarOpcaoNoCampo(customFieldId, nome, auth, baseUrl) {
  const contextUrl = `${baseUrl}/rest/api/3/field/${customFieldId}/context`;
  const contextRes = await axios.get(contextUrl, { auth });
  const contextId = contextRes.data.values[0].id;

  const optionUrl = `${baseUrl}/rest/api/3/field/${customFieldId}/context/${contextId}/option`;
  await axios.post(
    optionUrl,
    { options: [{ value: nome }] },
    { auth }
  );
}

async function atualizarCampoProdutoNaIssue(issueKey, produto, auth, baseUrl) {
  const issueUrl = `${baseUrl}/rest/api/3/issue/${issueKey}`;
  await axios.put(
    issueUrl,
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
      console.warn(`Erro ao atualizar (tentativa ${i + 1}): ${error.message}`);
      if (i < tentativas - 1) await esperar(delayMs);
      else throw new Error('Erro ao atualizar campo após várias tentativas');
    }
  }
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
