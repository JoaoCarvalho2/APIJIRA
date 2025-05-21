🧠 Jira Auto Product Matcher with Gemini
Este projeto é uma API Node.js que automatiza o preenchimento de campos personalizados no Jira com base no resumo (summary) de uma issue. Se nenhum produto conhecido for encontrado, a API utiliza Gemini 1.5 Flash para extrair e validar um novo nome de produto de forma inteligente.

✨ Funcionalidades
🔍 Compara o resumo da issue com summaries existentes no projeto Jira.

🤖 Utiliza Gemini para extrair nomes de produtos do texto, validando se são softwares reais.

⚙️ Cria nova opção no campo personalizado "Produto" caso não exista.

🛠️ Cria uma nova issue com o nome do produto caso ele seja novo.

🗂️ Atualiza a issue original com o campo "Produto".

💬 Adiciona um comentário automático com detalhes da criação.

🛠️ Tecnologias Utilizadas
Node.js + JavaScript

Axios

API do Jira (Jira Cloud REST API v3)

Google Gemini 1.5 Flash (via Generative Language API)

Vercel (ou qualquer plataforma serverless)

📦 Instalação
Clone o repositório:

bash
Copiar
Editar
git clone https://github.com/seu-usuario/jira-product-matcher.git
cd jira-product-matcher
Instale as dependências:

bash
Copiar
Editar
npm install
🔐 Variáveis de Ambiente (.env)
Crie um arquivo .env com as seguintes variáveis:

env
Copiar
Editar
JIRA_BASE_URL=https://suaempresa.atlassian.net
JIRA_EMAIL=seu-email@empresa.com
JIRA_API_TOKEN=xxxxxxx
JIRA_PROJECT_KEY=IMP
GEMINI_API_KEY=AIzaSy...  # Obtido no Google AI Studio
🔁 Fluxo da Lógica
mermaid
Copiar
Editar
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
📡 Endpoints
POST /api/produto
Corpo da requisição:
json
Copiar
Editar
{
  "summary": "Erro ao integrar com Microsoft Teams",
  "issueKey": "IMP-123"
}
Resposta (exemplo):
json
Copiar
Editar
{
  "produto": "Microsoft Teams",
  "criadoAutomaticamente": false,
  "atualizadoNaIssueOriginal": true
}
📘 Exemplo de Comentário Adicionado
Produto "Microsoft Teams" não foi encontrado nas issues e foi criado automaticamente como IMP-789.

🧠 Sobre o Gemini 1.5 Flash
Utilizamos o Gemini 1.5 Flash, um LLM rápido e avançado do Google, para:

Extrair o nome do produto do campo summary.

Validar se o nome extraído representa um software real, usando prompt refinado e resposta binária ("SIM" ou "NÃO").

🚧 Próximos Passos
 Adicionar cache para evitar consultas repetidas ao Gemini

 Log e dashboard de uso da IA

 Integração opcional com SerpAPI para validação via Google Search

👨‍💻 Autor
Desenvolvido por [Seu Nome] — projeto em desenvolvimento para automação e inteligência aplicada no Jira.
📫 Contato: [seuemail@dominio.com]
