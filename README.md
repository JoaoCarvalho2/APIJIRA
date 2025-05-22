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
```

🔐 Variáveis de Ambiente
Crie um arquivo .env com os seguintes dados:

JIRA_BASE_URL=https://suaempresa.atlassian.net
JIRA_EMAIL=seu-email@empresa.com
JIRA_API_TOKEN=xxxxxxx
JIRA_PROJECT_KEY= (sua project key)
GEMINI_API_KEY=AIzaSy...  # Obtido no Google AI Studio

🔁 Fluxo da Lógica
graph TD
    A[Recebe resumo de issue] --> B[Busca summaries do projeto]
    B --> C{Resumo semelhante?}
    C -- Sim --> D[Atualiza campo "Produto"]
    C -- Não --> E[Usa Gemini para extrair nome]
    E --> F{É software real?}
    F -- Não --> G[Retorna erro de extração]
    F -- Sim --> H[Verifica se existe no campo]
    H -- Existe --> I[Atualiza campo]
    H -- Não existe --> J[Cria opção + Cria nova issue]
    J --> K[Atualiza campo + Adiciona comentário]

💡 Obs: Caso o nome extraído já exista, ele é reaproveitado. Se for semelhante a outro existente, o sistema evita duplicação.

📡 Endpoint
POST /api/produto
Body:

{
  "summary": "Erro ao integrar com Microsoft Teams",
  "issueKey": "IMP-123"
}

Resposta de exemplo:

{
  "produto": "Microsoft Teams",
  "criadoAutomaticamente": false,
  "atualizadoNaIssueOriginal": true
}

📘 Comentário Exemplo na Issue
Produto "Microsoft Teams" não foi encontrado nas issues e foi criado automaticamente como IMP-789.

🧠 Sobre o Gemini 1.5 Flash
Utilizamos o Gemini 1.5 Flash, um modelo de linguagem da Google:

Para extrair o nome do produto do resumo de texto.

Validar automaticamente se o nome representa um software real.

Evitar preenchimentos genéricos como “problema”, “sistema” ou frases completas.

🚧 Próximos Passos
 Adicionar cache para evitar consultas repetidas ao Gemini

 Log e dashboard de uso da IA

 Integração com SerpAPI para validação no Google Search

 Suporte a múltiplos contextos personalizados no Jira

👨‍💻 Autor
Desenvolvido por João Victor
📫 Contato: joaovictorbarbosadecarvalho@outlook.com

