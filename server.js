const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Serve o frontend ──────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Estado global ─────────────────────────────────────────
let sock = null;
let qrCodeData = null;
let isConnected = false;
let connectedPhone = '';
let msgSent = 0;
let msgReceived = 0;

// Fluxo do bot (editável pelo frontend)
let botFlow = {
  ativo: true,
  mensagemBoasVindas: '👋 Olá! Bem-vindo! Como posso ajudar?\n\nDigite *1* para Suporte\nDigite *2* para Vendas\nDigite *3* para Falar com humano',
  respostas: {
    '1': '🛠 Você escolheu *Suporte*. Me descreva seu problema e um atendente irá te ajudar em breve!',
    '2': '💰 Você escolheu *Vendas*. Nossos planos começam a partir de R$49/mês. Quer saber mais?',
    '3': '👤 Transferindo para um atendente humano... Aguarde!',
  },
  mensagemPadrao: '❓ Não entendi. Digite *1*, *2* ou *3* para continuar.'
};

// ── Inicia WhatsApp ───────────────────────────────────────
async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['BotConversa', 'Chrome', '1.0'],
  });

  // QR Code gerado → manda pro frontend via WebSocket
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Converte QR para imagem base64 e envia pro browser
      qrCodeData = await QRCode.toDataURL(qr);
      isConnected = false;
      io.emit('qr', { qr: qrCodeData });
      io.emit('status', { connected: false, status: 'Escaneie o QR Code' });
      console.log('📱 QR Code gerado — aguardando escaneamento...');
    }

    if (connection === 'open') {
      isConnected = true;
      qrCodeData = null;
      connectedPhone = sock.user?.id?.split(':')[0] || '';
      io.emit('connected', {
        phone: '+' + connectedPhone,
        status: 'Conectado',
        session: sock.user?.id
      });
      io.emit('status', { connected: true, status: 'Conectado ✅' });
      console.log('✅ WhatsApp conectado! Número:', connectedPhone);
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;

      isConnected = false;
      io.emit('disconnected', {});
      io.emit('status', { connected: false, status: 'Desconectado' });
      console.log('❌ Conexão encerrada. Reconectando:', shouldReconnect);

      if (shouldReconnect) {
        setTimeout(startWhatsApp, 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Recebe mensagens e responde pelo fluxo ──────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue; // ignora mensagens próprias
      if (!msg.message) continue;

      const from = msg.key.remoteJid;
      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ''
      ).trim().toLowerCase();

      msgReceived++;
      io.emit('stats', { sent: msgSent, received: msgReceived });
      io.emit('newMessage', { from, text, time: new Date().toISOString() });

      console.log(`📨 Mensagem de ${from}: ${text}`);

      if (!botFlow.ativo) continue;

      // Lógica do fluxo
      let resposta = '';

      if (!text || text === 'oi' || text === 'olá' || text === 'ola' || text === 'inicio' || text === 'início' || text === 'menu') {
        resposta = botFlow.mensagemBoasVindas;
      } else if (botFlow.respostas[text]) {
        resposta = botFlow.respostas[text];
      } else {
        // Checa se contém alguma chave
        const chaveEncontrada = Object.keys(botFlow.respostas).find(k => text.includes(k));
        resposta = chaveEncontrada ? botFlow.respostas[chaveEncontrada] : botFlow.mensagemPadrao;
      }

      if (resposta) {
        // Simula "digitando..."
        await sock.sendPresenceUpdate('composing', from);
        await new Promise(r => setTimeout(r, 1000 + resposta.length * 20));
        await sock.sendPresenceUpdate('paused', from);

        await sock.sendMessage(from, { text: resposta });
        msgSent++;
        io.emit('stats', { sent: msgSent, received: msgReceived });
        console.log(`✉️ Resposta enviada para ${from}`);
      }
    }
  });
}

// ── API REST ──────────────────────────────────────────────

// Status da conexão
app.get('/api/status', (req, res) => {
  res.json({
    connected: isConnected,
    phone: connectedPhone ? '+' + connectedPhone : null,
    qr: qrCodeData,
    stats: { sent: msgSent, received: msgReceived }
  });
});

// Atualiza fluxo do bot
app.post('/api/flow', (req, res) => {
  botFlow = { ...botFlow, ...req.body };
  res.json({ ok: true, flow: botFlow });
});

// Envia mensagem manual
app.post('/api/send', async (req, res) => {
  const { number, message } = req.body;
  if (!isConnected) return res.status(400).json({ error: 'Não conectado' });
  try {
    const jid = number.replace(/\D/g, '') + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: message });
    msgSent++;
    io.emit('stats', { sent: msgSent, received: msgReceived });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Desconectar
app.post('/api/disconnect', async (req, res) => {
  if (sock) await sock.logout();
  res.json({ ok: true });
});

// ── WebSocket ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🖥 Frontend conectado via WebSocket');

  // Manda estado atual pra quem acabou de conectar
  if (isConnected) {
    socket.emit('connected', { phone: '+' + connectedPhone, status: 'Conectado ✅' });
  } else if (qrCodeData) {
    socket.emit('qr', { qr: qrCodeData });
  }

  socket.emit('stats', { sent: msgSent, received: msgReceived });

  socket.on('updateFlow', (flow) => {
    botFlow = { ...botFlow, ...flow };
    console.log('🔄 Fluxo atualizado pelo frontend');
  });
});

// ── Inicia ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 BotConversa rodando na porta ${PORT}`);
  startWhatsApp();
});
