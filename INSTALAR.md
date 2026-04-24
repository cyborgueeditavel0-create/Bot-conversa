# 🚀 BotConversa — Guia de Instalação no Railway (GRÁTIS)

## O que você vai ter no final:
✅ QR Code REAL do WhatsApp
✅ Bot respondendo automaticamente
✅ Painel online acessível de qualquer lugar
✅ Sem precisar deixar o PC ligado

---

## PASSO 1 — Criar conta no GitHub (gratuito)

1. Acesse https://github.com e clique em **Sign up**
2. Crie sua conta (use seu email)
3. Confirme o email

---

## PASSO 2 — Criar o repositório com os arquivos

1. No GitHub, clique em **"New repository"** (botão verde)
2. Nome: `botconversa`
3. Deixe como **Public**
4. Clique **Create repository**

Agora faça upload dos arquivos:
1. Clique em **"uploading an existing file"**
2. Faça upload de:
   - `server.js`
   - `package.json`
   - Crie uma pasta `public` e faça upload do `index.html` dentro dela

---

## PASSO 3 — Deploy no Railway

1. Acesse https://railway.app
2. Clique **"Start a New Project"**
3. Escolha **"Deploy from GitHub repo"**
4. Conecte sua conta GitHub e selecione o repositório `botconversa`
5. Railway vai detectar o Node.js automaticamente e fazer o deploy

**Aguarde 2-3 minutos** para o deploy concluir.

---

## PASSO 4 — Acessar seu bot

1. No Railway, clique no seu projeto
2. Clique em **"Settings"** → **"Domains"**
3. Clique em **"Generate Domain"**
4. Você vai receber uma URL tipo: `https://botconversa-production.up.railway.app`

**Abra essa URL no navegador** — seu painel vai aparecer!

---

## PASSO 5 — Conectar o WhatsApp

1. Na página que abriu, aguarde o QR Code aparecer (leva ~10 segundos)
2. Abra o WhatsApp no celular
3. Vá em **⋮ Menu → Dispositivos conectados → Conectar dispositivo**
4. Escaneie o QR Code da tela
5. ✅ Pronto! O bot vai responder automaticamente!

---

## ⚡ Configurar o fluxo do bot

Na aba **"Fluxo do Bot"** você pode:
- Mudar a mensagem de boas-vindas
- Adicionar palavras-chave e respostas automáticas
- Ativar/desativar o bot

**Exemplo de configuração:**
```
Palavra-chave: preco
Resposta: Nossos planos custam R$49/mês. Quer saber mais?

Palavra-chave: horario
Resposta: Atendemos de segunda a sexta, das 8h às 18h.
```

---

## ❓ Problemas comuns

**QR Code não aparece?**
→ Aguarde 30 segundos e recarregue a página. O servidor está iniciando.

**Bot parou de responder?**
→ No Railway, clique em "Restart" no seu projeto.

**Sessão desconectou?**
→ Vá na aba Conexão e escaneie o QR Code novamente.

---

## 💡 Dica importante

O Railway tem **500 horas grátis por mês**. Para uso contínuo (24/7), 
considere o plano pago ($5/mês) ou use o Render.com que tem tier gratuito 
permanente (mas fica offline após inatividade).

---

Desenvolvido com ❤️ usando Baileys + Node.js
