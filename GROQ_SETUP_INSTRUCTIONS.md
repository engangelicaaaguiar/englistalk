# 🚀 Configuração Groq + Nelify

## Status Atual ✅

- ✅ Código do route.ts atualizado para usar Groq API
- ✅ Pacote @ai-sdk/openai instalado
- ✅ Deploy no Netlify realizado
- ✅ Git atualizado (sem secrets no repositório)
- ⏳ **Pendente**: Adicionar chave GROQ_API_KEY no Netlify

## 🔑 Passo-a-Passo para Configurar no Netlify

### 1. Acesse as Variáveis de Ambiente do Netlify

1. Vá para: https://app.netlify.com/sites/talken/settings/build
2. Clique em **"Environment variables"** (ou **"Build & deploy"** → **"Environment"**)
3. Clique em **"Add a variable"** ou **"New variable"**

### 2. Adicione a Chave Groq

Preencha assim:

| Campo | Valor |
|-------|-------|
| **Key** | `GROQ_API_KEY` |
| **Value** | `gsk_...` (sua chave fornecida) |
| **Context** | Production (selecionar) |

### 3. Salve e Redeploy

1. Clique em **"Save"**
2. Vá para a aba **"Deploys"**
3. Clique em **"Trigger deploy"** → **"Deploy site"** (ou no botão de ▶️)
4. Aguarde o build terminar (~30-40s)

## ✅ Como Verificar se Funcionou

1. Acesse https://talken.netlify.app
2. Na página do app (após login), fale "Hello"
3. Você deve receber uma resposta do Llama 3.1 em poucos segundos (muito rápido!)

## 📝 Logs de Diagnóstico

Se algo não funcionar, verifique:

- **Netlify Function Logs**: https://app.netlify.com/sites/talken/functions
- **Build Logs**: https://app.netlify.com/sites/talken/deploys

Procure por:
- ✅ `"llama-3.1-8b-instant"` na resposta
- ❌ Erros de autenticação (401)
- ❌ Erros de rate limit

## 🔄 Local Para testar localmente:

1. Certifique-se de que `.env.local` tem:
   ```
   GROQ_API_KEY=gsk_...
   ```
   (Use a chave fornecida)
   ```bash
   npm run dev
   ```

3. Acesse http://localhost:3000 e teste

## 🎯 Model Info

- **Modelo**: `llama-3.1-8b-instant` (Groq)
- **Status**: Free tier (ilimitado)
- **Velocidade**: ~100ms por resposta
- **Qualidade**: Comparável ao GPT-3.5

## ❓ Troubleshooting

### "Erro: Chave GROQ_API_KEY não encontrada"

→ Adicione a variável no Netlify e redeploy

### "401 Unauthorized"

→ Chave expirada ou inválida. Verifique em groq.com

### "Rate limit exceeded"

→ Aguarde 1 minuto ou considere usar Groq Pro

---

**Suporte**: [Documentação Groq](https://console.groq.com/docs)
