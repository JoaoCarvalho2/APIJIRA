# 🧠 APIJIRA - API de Detecção de Produto via Jira Cloud

Esta API recebe um resumo (`summary`) e tenta identificar a qual produto ele pertence, com base em issues de um projeto específico no Jira Cloud. Útil para automações, workflows e categorização de chamados de forma inteligente.

---

## 🚀 Tecnologias Utilizadas

- [Node.js](https://nodejs.org/)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Axios](https://axios-http.com/)
- Jira REST API (v3)

---

## 📦 Estrutura

### Endpoint

`POST /api/detectar-produto`

---

## 📥 Requisição

```json
{
  "summary": "Re: 123456 - Dúvidas sobre o LABELVIEW Pro"
}
```

- `summary` (string): Campo obrigatório contendo o resumo da issue ou chamado a ser analisado.

---

## 📤 Resposta

### ✅ Produto encontrado

```json
{
  "produto": "LABELVIEW Pro",
  "summaryRecebido": "Re: 123456 - Dúvidas sobre o LABELVIEW Pro"
}
```

### ❌ Produto não encontrado

```json
{
  "produto": "Não encontrado",
  "summaryRecebido": "Re: 123456 - Dúvidas sobre o Produto Desconhecido",
  "summariesDoProjeto": [
    "LABELVIEW Pro",
    "Lumion",
    "ZWCAD Professional",
    ...
  ]
}
```

---

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env.local` com as seguintes variáveis:

```env
JIRA_EMAIL=seu_email@dominio.com
JIRA_API_TOKEN=seu_token_api
JIRA_BASE_URL=https://targetware.atlassian.net
JIRA_PROJECT_KEY=IMP
```

Você pode gerar um token de API aqui: [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

---

## 🧠 Como funciona

1. A API faz requisições paginadas ao Jira para buscar **todos os summaries** das issues no projeto definido.
2. Compara o `summary` enviado com os summaries das issues existentes.
3. Retorna o primeiro produto correspondente encontrado (baseado em uma verificação `includes`, sem case sensitive).

---

## 🔍 Melhorias Futuras

- ✅ Paginação correta com `startAt` para garantir busca completa
- 🔄 Substituir `includes()` por comparação com fuzzy search (ex: Levenshtein)
- 🧠 Machine learning para categorização mais precisa (opcional)
- 📁 Cache com Redis ou Vercel KV para evitar chamadas repetidas ao Jira

---

## 🛠 Exemplo de uso com curl

```bash
curl -X POST https://seu-endpoint.vercel.app/api/detectar-produto   -H "Content-Type: application/json"   -d '{"summary": "Erro ao abrir o Lumion"}'
```

---

## 🧪 Testes e Logs

Os logs são exibidos via `console.log` para depuração durante execução:

- `🔗 Buscando do Jira:` URL usada
- `📋 Summaries:` lista de summaries do projeto
- `✅ Produto encontrado:` nome do produto detectado
- `❌ Produto não encontrado`

---

## 👤 Autor

Desenvolvido por JoãoCarvalho.

---

## 🧾 Licença

MIT - Utilize e modifique livremente.