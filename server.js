const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const httpServer = createServer(app);

// ✅ CORS e transports corrigidos para funcionar atrás de proxy
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['polling', 'websocket'] // polling primeiro garante fallback
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Health check — útil pra saber se o processo tá vivo
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let sock = null;
let qrCodeData = null;
let isConnected = false;
let connectedPhone = '';
let msgSent = 0;
let msgReceived = 0;

let botFlow = {
  ativo: true,
  mensagemBoasVindas: '👋 Olá! Bem-vindo! Como posso ajudar?\n\nDigite *1* para Suporte\nDigite *2* para Vendas\nDigite *3* para Falar com humano',
  respostas: {
    '1': '🛠 Você escolheu *Suporte*. Me descreva seu problema!',
    '2': '💰 Você escolheu *Vendas*. Nossos planos a partir de R$49/mês.',
    '3': '👤 Transferindo para atendente humano... Aguarde!',
  },
  mensagemPadrao: '❓ Não entendi. Digite *1*, *2* ou *3* para continuar.'
};

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // ✅ imprime no terminal também para debug
    browser: ['BotConversa', 'Chrome', '1.0'],
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 QR Code gerado — emitindo para frontend...');
      qrCodeData = await QRCode.toDataURL(qr);
      isConnected = false;
      // ✅ emite para todos os sockets conectados
      io.emit('qr', { qr: qrCodeData });
      io.emit('status', { connected: false, status: 'Escaneie o QR Code' });
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
      qrCodeData = null;
      io.emit('disconnected', {});
      io.emit('status', { connected: false, status: 'Desconectado' });
      console.log('❌ Conexão encerrada. Reconectando:', shouldReconnect);

      if (shouldReconnect) setTimeout(startWhatsApp, 3000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const from = msg.key.remoteJid;
      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || ''
      ).trim().toLowerCase();

      msgReceived++;
      io.emit('stats', { sent: msgSent, received: msgReceived });
      io.emit('newMessage', { from, text, time: new Date().toISOString() });
      console.log(`📨 Mensagem de ${from}: ${text}`);

      if (!botFlow.ativo) continue;

      let resposta = '';
      if (!text || ['oi','olá','ola','inicio','início','menu'].includes(text)) {
        resposta = botFlow.mensagemBoasVindas;
      } else if (botFlow.respostas[text]) {
        resposta = botFlow.respostas[text];
      } else {
        const chave = Object.keys(botFlow.respostas).find(k => text.includes(k));
        resposta = chave ? botFlow.respostas[chave] : botFlow.mensagemPadrao;
      }

      if (resposta) {
        await sock.sendPresenceUpdate('composing', from);
        await new Promise(r => setTimeout(r, 1000 + resposta.length * 20));
        await sock.sendPresenceUpdate('paused', from);
        await sock.sendMessage(from, { text: resposta });
        msgSent++;
        io.emit('stats', { sent: msgSent, received: msgReceived });
      }
    }
  });
}

// ── API REST ──────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    connected: isConnected,
    phone: connectedPhone ? '+' + connectedPhone : null,
    qr: qrCodeData,
    stats: { sent: msgSent, received: msgReceived }
  });
});

app.post('/api/flow', (req, res) => {
  botFlow = { ...botFlow, ...req.body };
  res.json({ ok: true, flow: botFlow });
});

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

app.post('/api/disconnect', async (req, res) => {
  if (sock) await sock.logout();
  res.json({ ok: true });
});

// ── WebSocket ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🖥 Frontend conectado via WebSocket. ID:', socket.id);

  // ✅ Reenvia estado atual para quem acabou de conectar
  if (isConnected) {
    socket.emit('connected', { phone: '+' + connectedPhone, status: 'Conectado ✅' });
    socket.emit('status', { connected: true, status: 'Conectado ✅' });
  } else if (qrCodeData) {
    // ✅ Garante que o QR já gerado chega para quem conectou depois
    socket.emit('qr', { qr: qrCodeData });
    socket.emit('status', { connected: false, status: 'Escaneie o QR Code' });
  } else {
    socket.emit('status', { connected: false, status: 'Aguardando QR...' });
  }

  socket.emit('stats', { sent: msgSent, received: msgReceived });

  socket.on('updateFlow', (flow) => {
    botFlow = { ...botFlow, ...flow };
    console.log('🔄 Fluxo atualizado pelo frontend');
  });

  socket.on('disconnect', (reason) => {
    console.log('🖥 Frontend desconectado:', socket.id, '| Motivo:', reason);
  });
});

// ── Inicia ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => { // ✅ escuta em todas as interfaces
  console.log(`🚀 BotConversa rodando na porta ${PORT}`);
  startWhatsApp();
});
