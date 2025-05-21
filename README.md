# 🧠 Jira Auto Product Matcher with Gemini

Este projeto é uma API Node.js que automatiza o preenchimento de campos personalizados no Jira com base no resumo (`summary`) de uma issue. Se nenhum produto conhecido for encontrado, a API utiliza **Gemini 1.5 Flash** para extrair e validar um novo nome de produto de forma inteligente.

---

## ✨ Funcionalidades

- 🔍 Compara o resumo da issue com summaries existentes no projeto Jira.
- 🤖 Utiliza Gemini para extrair nomes de produtos do texto, validando se são softwares reais.
- ⚙️ Cria nova opção no campo personalizado "Produto" caso não exista.
- 🛠️ Cria uma nova issue com o nome do produto caso ele seja novo.
- 🗂️ Atualiza a issue original com o campo "Produto".
- 💬 Adiciona um comentário automático com detalhes da criação.

---

## 🛠️ Tecnologias Utilizadas

- Node.js + JavaScript
- Axios
- API do Jira (Jira Cloud REST API v3)
- Google Gemini 1.5 Flash (via Generative Language API)
- Vercel (ou qualquer plataforma serverless)

---

## 📦 Instalação

```bash
git clone https://github.com/seu-usuario/jira-product-matcher.git
cd jira-product-matcher
npm install
