# 🔧 Como Configurar Variáveis de Ambiente no Netlify

## 📋 Variáveis Necessárias

Seu app precisa de **uma** dessas chaves de IA (escolha **uma ou outra**):

| Variável | Valor | Aonde Conseguir |
|----------|-------|-----------------|
| `GROQ_API_KEY` | `gsk_...` (Recomendado) | [console.groq.com](https://console.groq.com) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `AIza...` (Alternativa) | [ai.google.dev](https://ai.google.dev) |

**Extras** (já configurado, mas você pode adicionar):
- `NEXT_PUBLIC_SUPABASE_URL` = URL do seu projeto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Chave pública do Supabase

---

## ✅ Passo-a-Passo no Netlify

### 1️⃣ Vá para as Configurações do Site

- URL: https://app.netlify.com/sites/talken/settings/environment
- **OU** em Site → Settings → Build & Deploy → Environment

### 2️⃣ Click em "Add a variable" (ou o botão +)

Preencha assim:

```
Key:   GROQ_API_KEY
Value: gsk_... (sua chave)
```

**Importante**: Deixe "Context" em **"Production"** (padrão)

### 3️⃣ Repita para outras variáveis (opcional)

Se quiser usar Google Generative AI, adicione também:

```
Key:   GOOGLE_GENERATIVE_AI_API_KEY
Value: AIza... (sua chave)
```

### 4️⃣ Salve e Redeploy

Após salvar as variáveis:

1. Vá para **Deploys** tab
2. Clique no deploy mais recente
3. Clique em **"Retry build"** (ou o ícone ⟳)
4. Aguarde ~40 segundos

---

## 🧪 Testar Localmente

### Setup no Codespaces

1. Crie (ou copie) o arquivo `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edite `.env.local` e adicione sua chave real:
   ```
   GROQ_API_KEY=gsk_...sua_chave_aqui...
   ```

3. Execute o desenvolvimento:
   ```bash
   npm run dev
   ```

4. Abra http://localhost:3000 e teste!

### ⚠️ IMPORTANTE: Nunca commite `.env.local`

O arquivo `.env.local` já está no `.gitignore`. Nunca faça push com secrets!

---

## 🔍 Troubleshooting

### ❌ "Erro: Chave não encontrada"

✅ Solução: Você esqueceu de adicionar no Netlify. Repita o Passo 2 acima.

### ❌ "401 Unauthorized"

✅ Solução: Sua chave expirou ou é inválida. Verifique em:
- [Groq Console](https://console.groq.com/keys)
- [Google AI Console](https://aistudio.google.com)

### ❌ "Rate limit exceeded"

✅ Solução: Aguarde 1 minuto ou upgrade seu plano

### ❌ Build falha no Netlify

✅ Solução:
1. Verifique os **Build logs**: https://app.netlify.com/sites/talken/deploys
2. Procure por erros de secrets scanning
3. Certifique-se de que `.env.local` está no `.gitignore`

---

## 📊 Qual Modelo Usar?

### **Groq + Llama 3.1** (Recomendado para produção) ✅

- **Custo**: Grátis! (Rate limit generoso)
- **Velocidade**: ~100ms
- **Qualidade**: Comparável ao GPT-3.5
- **Setup**: 2 minutos
- **Para usar**: Adicione `GROQ_API_KEY`

### **Google Generative AI** (Alternativa)

- **Custo**: Grátis com limites (pay-as-you-go)
- **Velocidade**: ~300ms
- **Qualidade**: Muito boa (Gemini)
- **Setup**: 5 minutos
- **Para usar**: Adicione `GOOGLE_GENERATIVE_AI_API_KEY`

---

## 📚 Recursos Úteis

- [Documentação Groq](https://console.groq.com/docs)
- [Google AI Studio](https://aistudio.google.com)
- [Netlify Environment](https://docs.netlify.com/build-release-manage/save-and-find-environment-variables/)

---

## 🆘 Ainda com dúvida?

Verifique os **logs de build** do Netlify:
```
https://app.netlify.com/sites/talken/deploys
```

Procure por mensagens de erro que indicam qual variável está faltando!
