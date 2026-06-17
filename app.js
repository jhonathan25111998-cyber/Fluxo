import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

/* =========================
   FIREBASE
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyDWUCRDmwf5_332izdNMCRsrjTG5z4Ho9g",
  authDomain: "fluxo-app-c71ec.firebaseapp.com",
  projectId: "fluxo-app-c71ec",
  storageBucket: "fluxo-app-c71ec.firebasestorage.app",
  messagingSenderId: "942507349330",
  appId: "1:942507349330:web:6ce004396cf55ec5ca568b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

/* =========================
   ESTADO GLOBAL
========================= */
let currentUser = null;
window.currentUser = null;

let dbBackup = null;
let usuarioAtual = null;

let tarefas = JSON.parse(localStorage.getItem("tarefas") || "[]");
let metas = JSON.parse(localStorage.getItem("metas") || "[]");
let cardsTarefas = JSON.parse(localStorage.getItem("cardsTarefas") || "[]");
if (cardsTarefas.length === 0) cardsTarefas = [{ id: "default_" + Date.now(), nome: "Minhas Tarefas" }];

let tempoTotalFocado = parseInt(localStorage.getItem("tempoTotalFocado") || "0", 10);
let tempoFocadoHoje = parseInt(localStorage.getItem("tempoFocadoHoje") || "0", 10);
let ultimaDataFoco = localStorage.getItem("ultimaDataFoco") || "";
let ultimaDataReset = localStorage.getItem("ultimaDataReset") || "";
let tarefasReagendadasHoje = parseInt(localStorage.getItem("tarefasReagendadasHoje") || "0", 10);
let ultimaDataReagendamento = localStorage.getItem("ultimaDataReagendamento") || "";

let tarefaReagendando = null;
let tarefaArrastandoId = null;
let tarefaArrastandoOrigem = null;
let tarefaDescricaoAtual = null;
let tarefaEditandoAtual = null;

let dataCalendario = new Date();
let modoCalendario = localStorage.getItem("modoCalendario") || "mes";

/* Modal dia calendário */
let dataModalDiaAtual = null;

/* =========================
   MODO FOCO / POMODORO
========================= */
let tarefaFocoAtual = null;
let timerPomodoro = null;
let segundosRestantes = 25 * 60;
let emPausa = false;
let musicaAtiva = false;

/* =========================
   UTILS
========================= */
function escapeHtml(t) {
  if (!t) return "";
  return t.replace(/[&<>]/g, (m) => (m === "&" ? "&amp;" : m === "<" ? "&lt;" : "&gt;"));
}

function getDataHoje() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
}

function getProximoDiaUtil(dataStr) {
  const data = new Date(dataStr + "T00:00:00");
  data.setDate(data.getDate() + 1);
  while (data.getDay() === 0 || data.getDay() === 6) data.setDate(data.getDate() + 1);
  return data.toISOString().split("T")[0];
}

function getProximaData(recorrencia, dataAtualStr) {
  const data = new Date(dataAtualStr + "T00:00:00");
  switch (recorrencia) {
    case "diaria":
      data.setDate(data.getDate() + 1);
      break;
    case "dias_uteis":
      return getProximoDiaUtil(dataAtualStr);
    case "semanal":
      data.setDate(data.getDate() + 7);
      break;
    case "mensal":
      data.setMonth(data.getMonth() + 1);
      break;
    default:
      return null;
  }
  return data.toISOString().split("T")[0];
}

function formatarDataHeader(d = new Date()) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function formatarDataPtBr(dataStr) {
  if (!dataStr) return "";
  const [y, m, d] = dataStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function uid() {
  return Date.now() + Math.random();
}

/* =========================
   RECORRÊNCIA ROBUSTA
========================= */
function makeSerieId() {
  return "serie_" + Date.now() + "_" + Math.floor(Math.random() * 1e9);
}

function normalizarTarefaRecorrente(t) {
  if (t && t.recorrencia && t.recorrencia !== "" && !t.serieId) {
    t.serieId = makeSerieId();
  }
  return t;
}

function garantirSerieIds() {
  let alterou = false;
  tarefas.forEach((t) => {
    if (t.recorrencia && t.recorrencia !== "" && !t.serieId) {
      t.serieId = makeSerieId();
      alterou = true;
    }
  });
  return alterou;
}

function existePendenteDaSerie(serieId, ignoreId = null) {
  return tarefas.some((x) => x.serieId === serieId && !x.concluida && x.id !== ignoreId);
}

function existeInstanciaDaSerieNaData(serieId, dataStr, ignoreId = null) {
  return tarefas.some((x) => x.serieId === serieId && x.data === dataStr && x.id !== ignoreId);
}

function deduplicarPendentesPorSerieData() {
  const mapa = new Map();
  const removerIds = new Set();

  for (const t of tarefas) {
    if (!t.recorrencia || !t.serieId || t.concluida) continue;
    const chave = `${t.serieId}__${t.data}__pendente`;
    if (!mapa.has(chave)) {
      mapa.set(chave, t);
    } else {
      removerIds.add(t.id);
    }
  }

  if (removerIds.size > 0) {
    tarefas = tarefas.filter((t) => !removerIds.has(t.id));
    return true;
  }
  return false;
}

function deduplicarPendenciaUnicaPorSerie() {
  const hoje = getDataHoje();
  const grupos = new Map();
  const remover = new Set();

  for (const t of tarefas) {
    if (!t.recorrencia || !t.serieId || t.concluida) continue;
    if (!grupos.has(t.serieId)) grupos.set(t.serieId, []);
    grupos.get(t.serieId).push(t);
  }

  for (const [, arr] of grupos) {
    if (arr.length <= 1) continue;

    const futurasOuHoje = arr.filter((x) => x.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));
    const manter =
      futurasOuHoje.length > 0
        ? futurasOuHoje[0]
        : arr.slice().sort((a, b) => b.data.localeCompare(a.data))[0];

    for (const t of arr) {
      if (t.id !== manter.id) remover.add(t.id);
    }
  }

  if (remover.size > 0) {
    tarefas = tarefas.filter((t) => !remover.has(t.id));
    return true;
  }
  return false;
}

function calcularBaseEfetivaConclusao(tarefa) {
  const hoje = getDataHoje();
  return tarefa.data < hoje ? hoje : tarefa.data;
}

function gerarProximaInstanciaSeNecessario(tarefaConcluida) {
  if (!tarefaConcluida) return;
  if (!tarefaConcluida.recorrencia || tarefaConcluida.recorrencia === "") return;

  normalizarTarefaRecorrente(tarefaConcluida);
  const serieId = tarefaConcluida.serieId;
  if (!serieId) return;

  if (existePendenteDaSerie(serieId, tarefaConcluida.id)) return;

  const base = calcularBaseEfetivaConclusao(tarefaConcluida);
  const proximaData = getProximaData(tarefaConcluida.recorrencia, base);
  if (!proximaData) return;

  if (existeInstanciaDaSerieNaData(serieId, proximaData, tarefaConcluida.id)) return;

  tarefas.push({
    id: uid(),
    texto: tarefaConcluida.texto,
    descricao: tarefaConcluida.descricao || "",
    bloco: tarefaConcluida.bloco,
    data: proximaData,
    prioridade: tarefaConcluida.prioridade || "p3",
    recorrencia: tarefaConcluida.recorrencia,
    serieId: serieId,
    concluida: false,
    concluidaEm: null,
    tempoGasto: 0,
    notificado: false,
    ordem: tarefas.filter((t) => t.bloco === tarefaConcluida.bloco && !t.concluida).length,
    origemRecorrente: "conclusao",
    criadoEm: new Date().toISOString()
  });
}

function concluirTarefaComRecorrencia(id) {
  const tarefa = tarefas.find((t) => t.id === id);
  if (!tarefa || tarefa.concluida) return;
  tarefa.concluida = true;
  tarefa.concluidaEm = new Date().toISOString();
  gerarProximaInstanciaSeNecessario(tarefa);
}

/* =========================
   FEEDBACK UI
========================= */
window.mostrarIndicadorSync = function (mensagem, tipo = "success") {
  let indicator = document.getElementById("syncIndicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "syncIndicator";
    indicator.className = "sync-indicator";
    document.body.appendChild(indicator);
  }
  const icon = tipo === "success" ? "✅" : tipo === "error" ? "❌" : "🔄";
  indicator.innerHTML = `${icon} ${mensagem}`;
  indicator.classList.add("show");
  setTimeout(() => indicator.classList.remove("show"), 2200);
};

/* =========================
   LOGIN
========================= */
window.togglePasswordVisibility = (id, btn) => {
  const inp = document.getElementById(id);
  if (!inp) return;
  if (inp.type === "password") {
    inp.type = "text";
    btn.innerHTML = '<i class="far fa-eye-slash"></i>';
  } else {
    inp.type = "password";
    btn.innerHTML = '<i class="far fa-eye"></i>';
  }
};

window.mostrarCadastro = () => {
  const l = document.getElementById("loginForm");
  const r = document.getElementById("registerForm");
  if (l) l.style.display = "none";
  if (r) r.style.display = "block";
};

window.mostrarLogin = () => {
  const l = document.getElementById("loginForm");
  const r = document.getElementById("registerForm");
  if (l) l.style.display = "block";
  if (r) r.style.display = "none";
};

window.fazerLogin = async () => {
  try {
    const email = document.getElementById("loginEmail")?.value?.trim();
    const senha = document.getElementById("loginPassword")?.value;
    await signInWithEmailAndPassword(auth, email, senha);
  } catch {
    const err = document.getElementById("loginErrorMessage");
    if (err) err.textContent = "Email ou senha inválidos!";
  }
};

window.fazerCadastro = async () => {
  const email = document.getElementById("registerEmail")?.value?.trim();
  const pwd = document.getElementById("registerPassword")?.value;
  const conf = document.getElementById("registerConfirm")?.value;
  const err = document.getElementById("registerErrorMessage");

  if (pwd !== conf) {
    if (err) err.textContent = "Senhas não coincidem";
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, email, pwd);
    mostrarIndicadorSync("✅ Conta criada!");
  } catch (e) {
    if (err) err.textContent = e.message || "Erro ao cadastrar";
  }
};

window.loginComGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    mostrarIndicadorSync(`✅ Bem-vindo, ${result.user.displayName || result.user.email}!`);
  } catch {
    mostrarIndicadorSync("❌ Erro no login com Google", "error");
  }
};

window.fazerLogout = () => signOut(auth);

/* =========================
   FIRESTORE SYNC
========================= */
async function salvarTudoFirebase() {
  if (!currentUser) return;
  try {
    const dados = {
      tarefas: JSON.parse(localStorage.getItem("tarefas") || "[]"),
      metas: JSON.parse(localStorage.getItem("metas") || "[]"),
      cardsTarefas: JSON.parse(localStorage.getItem("cardsTarefas") || "[]"),
      tempoTotalFocado: parseInt(localStorage.getItem("tempoTotalFocado") || "0", 10),
      tempoFocadoHoje: parseInt(localStorage.getItem("tempoFocadoHoje") || "0", 10),
      tarefasReagendadasHoje: parseInt(localStorage.getItem("tarefasReagendadasHoje") || "0", 10),
      ultimaAtualizacao: new Date().toISOString()
    };
    await setDoc(doc(db, "usuarios", currentUser.uid), dados);
  } catch (err) {
    console.error(err);
  }
}

async function carregarDadosFirebase() {
  if (!currentUser) return;
  try {
    const docRef = doc(db, "usuarios", currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const d = docSnap.data();
      if (d.tarefas) localStorage.setItem("tarefas", JSON.stringify(d.tarefas));
      if (d.metas) localStorage.setItem("metas", JSON.stringify(d.metas));
      if (d.cardsTarefas?.length > 0) localStorage.setItem("cardsTarefas", JSON.stringify(d.cardsTarefas));
      if (typeof d.tempoTotalFocado === "number") localStorage.setItem("tempoTotalFocado", String(d.tempoTotalFocado));
      if (typeof d.tempoFocadoHoje === "number") localStorage.setItem("tempoFocadoHoje", String(d.tempoFocadoHoje));
      if (typeof d.tarefasReagendadasHoje === "number") localStorage.setItem("tarefasReagendadasHoje", String(d.tarefasReagendadasHoje));
    }

    tarefas = JSON.parse(localStorage.getItem("tarefas") || "[]");
    metas = JSON.parse(localStorage.getItem("metas") || "[]");
    cardsTarefas = JSON.parse(localStorage.getItem("cardsTarefas") || "[]");
    if (cardsTarefas.length === 0) cardsTarefas = [{ id: "default_" + Date.now(), nome: "Minhas Tarefas" }];
  } catch (err) {
    console.error(err);
  }
}

/* =========================
   INDEXEDDB BACKUP
========================= */
function initIndexedDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open("FLUXO_Backup_V3", 2);

    request.onerror = () => resolve();

    request.onsuccess = (event) => {
      dbBackup = event.target.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const dbi = event.target.result;
      if (!dbi.objectStoreNames.contains("backups")) {
        const store = dbi.createObjectStore("backups", { keyPath: "id", autoIncrement: true });
        store.createIndex("usuario", "usuario");
        store.createIndex("timestamp", "timestamp");
      }
    };
  });
}

async function salvarBackupIndexedDB() {
  if (!usuarioAtual || !dbBackup) return;
  const backup = {
    usuario: usuarioAtual,
    timestamp: Date.now(),
    data: new Date().toISOString(),
    tarefas: localStorage.getItem("tarefas"),
    metas: localStorage.getItem("metas"),
    cardsTarefas: localStorage.getItem("cardsTarefas"),
    tempoTotalFocado: localStorage.getItem("tempoTotalFocado"),
    tempoFocadoHoje: localStorage.getItem("tempoFocadoHoje"),
    tarefasReagendadasHoje: localStorage.getItem("tarefasReagendadasHoje")
  };
  const tx = dbBackup.transaction(["backups"], "readwrite");
  tx.objectStore("backups").add(backup);
}

async function listarBackups() {
  if (!usuarioAtual || !dbBackup) return [];
  return new Promise((resolve) => {
    const tx = dbBackup.transaction(["backups"], "readonly");
    const index = tx.objectStore("backups").index("usuario");
    const range = IDBKeyRange.only(usuarioAtual);
    const request = index.getAll(range);
    request.onsuccess = () => resolve((request.result || []).reverse());
    request.onerror = () => resolve([]);
  });
}

async function restaurarBackupIndexedDB(backupId) {
  if (!dbBackup) return;
  const tx = dbBackup.transaction(["backups"], "readonly");
  const request = tx.objectStore("backups").get(backupId);

  request.onsuccess = async () => {
    const backup = request.result;
    if (backup && backup.usuario === usuarioAtual) {
      if (backup.tarefas) localStorage.setItem("tarefas", backup.tarefas);
      if (backup.metas) localStorage.setItem("metas", backup.metas);
      if (backup.cardsTarefas) localStorage.setItem("cardsTarefas", backup.cardsTarefas);
      if (backup.tempoTotalFocado) localStorage.setItem("tempoTotalFocado", backup.tempoTotalFocado);
      if (backup.tempoFocadoHoje) localStorage.setItem("tempoFocadoHoje", backup.tempoFocadoHoje);
      if (backup.tarefasReagendadasHoje) localStorage.setItem("tarefasReagendadasHoje", backup.tarefasReagendadasHoje);
      mostrarIndicadorSync("✅ Backup restaurado!");
      setTimeout(() => location.reload(), 900);
    }
  };
}

async function excluirBackupIndexedDB(backupId) {
  if (!dbBackup) return;
  const tx = dbBackup.transaction(["backups"], "readwrite");
  tx.objectStore("backups").delete(backupId);
  mostrarIndicadorSync("🗑 Backup removido");
}

window.fazerBackupManual = async () => {
  await salvarBackupIndexedDB();
  mostrarIndicadorSync("✅ Backup local salvo");
};

window.restaurarBackupIndexedDB = restaurarBackupIndexedDB;
window.excluirBackupIndexedDB = excluirBackupIndexedDB;

window.importarBackupJSON = function () {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const backup = JSON.parse(e.target.result);
        if (backup.tarefas) localStorage.setItem("tarefas", backup.tarefas);
        if (backup.metas) localStorage.setItem("metas", backup.metas);
        if (backup.cardsTarefas) localStorage.setItem("cardsTarefas", backup.cardsTarefas);
        if (backup.tempoTotalFocado) localStorage.setItem("tempoTotalFocado", backup.tempoTotalFocado);
        if (backup.tempoFocadoHoje) localStorage.setItem("tempoFocadoHoje", backup.tempoFocadoHoje);
        if (backup.tarefasReagendadasHoje) localStorage.setItem("tarefasReagendadasHoje", backup.tarefasReagendadasHoje);
        mostrarIndicadorSync("✅ Backup importado com sucesso!");
        setTimeout(() => location.reload(), 900);
      } catch {
        mostrarIndicadorSync("❌ Erro ao importar backup", "error");
        alert("Arquivo de backup inválido.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

window.exportarBackupJSON = function () {
  const payload = {
    tarefas: localStorage.getItem("tarefas") || "[]",
    metas: localStorage.getItem("metas") || "[]",
    cardsTarefas: localStorage.getItem("cardsTarefas") || "[]",
    tempoTotalFocado: localStorage.getItem("tempoTotalFocado") || "0",
    tempoFocadoHoje: localStorage.getItem("tempoFocadoHoje") || "0",
    tarefasReagendadasHoje: localStorage.getItem("tarefasReagendadasHoje") || "0",
    data: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fluxo-backup-${getDataHoje()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

window.abrirModalBackup = async function () {
  const modal = document.getElementById("modalBackupOverlay");
  const list = document.getElementById("backupList");
  if (!modal || !list) return;

  const backups = await listarBackups();
  if (!backups.length) {
    list.innerHTML = `<div style="color:rgba(255,255,255,.7);font-size:12px;">Nenhum backup encontrado.</div>`;
  } else {
    list.innerHTML = backups.map((b) => `
      <div class="backup-item">
        <div class="backup-info">
          <div class="backup-data">${new Date(b.timestamp).toLocaleString("pt-BR")}</div>
          <div class="backup-tarefas">${JSON.parse(b.tarefas || "[]").length} tarefas</div>
        </div>
        <div class="backup-actions">
          <button onclick="restaurarBackupIndexedDB(${b.id})" title="Restaurar"><i class="fas fa-undo"></i></button>
          <button onclick="excluirBackupIndexedDB(${b.id})" title="Excluir"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
    `).join("");
  }

  modal.classList.add("show");
};

window.fecharModalBackup = function () {
  document.getElementById("modalBackupOverlay")?.classList.remove("show");
};

/* =========================
   NOTIFICAÇÕES
========================= */
window.abrirModalNotificacoes = function () {
  const modal = document.getElementById("modalNotificacoesOverlay");
  const lista = document.getElementById("notificacoesLista");
  if (!modal || !lista) return;

  const hoje = getDataHoje();
  const atrasadas = tarefas.filter(t => t.data && t.data < hoje && !t.concluida);
  const hojePendentes = tarefas.filter(t => t.data === hoje && !t.concluida);

  let html = "";
  if (atrasadas.length === 0 && hojePendentes.length === 0) {
    html = `<div style="text-align:center;color:rgba(255,255,255,0.7);padding:20px;">🎉 Nenhuma notificação pendente!</div>`;
  } else {
    if (atrasadas.length > 0) {
      html += `<div class="notificacao-item importante">
        <div class="notif-titulo">⚠️ Tarefas atrasadas</div>
        <div class="notif-desc">${atrasadas.map(t => escapeHtml(t.texto)).join(", ")}</div>
        <div class="notif-data">${atrasadas.length} tarefa(s) aguardam</div>
      </div>`;
    }
    if (hojePendentes.length > 0) {
      html += `<div class="notificacao-item">
        <div class="notif-titulo">📌 Tarefas para hoje</div>
        <div class="notif-desc">${hojePendentes.map(t => escapeHtml(t.texto)).join(", ")}</div>
        <div class="notif-data">${hojePendentes.length} tarefa(s) pendentes</div>
      </div>`;
    }
  }

  lista.innerHTML = html;
  modal.classList.add("show");
};

window.fecharModalNotificacoes = function () {
  document.getElementById("modalNotificacoesOverlay")?.classList.remove("show");
};

/* =========================
   PERFIL
========================= */
window.abrirModalPerfil = function () {
  const modal = document.getElementById("modalPerfilOverlay");
  const emailEl = document.getElementById("perfilEmail");
  if (!modal || !emailEl) return;

  if (currentUser) {
    emailEl.textContent = currentUser.email || "Usuário";
  } else {
    emailEl.textContent = "Não autenticado";
  }
  modal.classList.add("show");
};

window.fecharModalPerfil = function () {
  document.getElementById("modalPerfilOverlay")?.classList.remove("show");
};

/* =========================
   LÓGICA PRINCIPAL
========================= */
function verificarResetDiario() {
  const hoje = getDataHoje();

  if (ultimaDataReset !== hoje) {
    ultimaDataReset = hoje;
    localStorage.setItem("ultimaDataReset", hoje);

    if (ultimaDataReagendamento !== hoje) {
      tarefasReagendadasHoje = 0;
      localStorage.setItem("tarefasReagendadasHoje", "0");
      localStorage.setItem("ultimaDataReagendamento", hoje);
      ultimaDataReagendamento = hoje;
    }
  }

  if (ultimaDataFoco !== hoje) {
    tempoFocadoHoje = 0;
    localStorage.setItem("tempoFocadoHoje", "0");
    localStorage.setItem("ultimaDataFoco", hoje);
    ultimaDataFoco = hoje;
  }
}

function sincronizarTarefasRecorrentes() {
  let alterou = false;
  if (garantirSerieIds()) alterou = true;
  if (deduplicarPendentesPorSerieData()) alterou = true;
  if (deduplicarPendenciaUnicaPorSerie()) alterou = true;
  return alterou;
}

function salvarDados() {
  garantirSerieIds();
  deduplicarPendentesPorSerieData();
  deduplicarPendenciaUnicaPorSerie();

  localStorage.setItem("tarefas", JSON.stringify(tarefas));
  localStorage.setItem("metas", JSON.stringify(metas));
  localStorage.setItem("cardsTarefas", JSON.stringify(cardsTarefas));
  localStorage.setItem("tempoTotalFocado", String(tempoTotalFocado));
  localStorage.setItem("tempoFocadoHoje", String(tempoFocadoHoje));
  localStorage.setItem("tarefasReagendadasHoje", String(tarefasReagendadasHoje));

  renderizarTarefas();
  renderizarMetas();
  renderizarMetasCarrossel();
  renderizarCalendario();
  atualizarDashboard();
  atualizarRodape();

  if (dataModalDiaAtual) renderizarConteudoModalDia(dataModalDiaAtual);

  if (window.currentUser) setTimeout(() => salvarTudoFirebase(), 400);
}

/* =========================
   TAREFAS
========================= */
window.toggleTarefa = function (id) {
  const t = tarefas.find((x) => x.id === id);
  if (!t) return;

  if (!t.concluida) {
    concluirTarefaComRecorrencia(id);
    mostrarIndicadorSync("✅ Tarefa concluída!");
  } else {
    t.concluida = false;
    t.concluidaEm = null;
    mostrarIndicadorSync("🔄 Tarefa reativada!");
  }
  salvarDados();
};

window.excluirTarefa = function (id) {
  if (!confirm("Excluir tarefa?")) return;
  tarefas = tarefas.filter((t) => t.id !== id);
  salvarDados();
  mostrarIndicadorSync("🗑 Tarefa excluída!");
};

window.abrirModalEdicao = function (id) {
  const tarefa = tarefas.find((t) => t.id === id);
  if (!tarefa) return;
  tarefaEditandoAtual = tarefa;
  document.getElementById("edicaoTitulo").value = tarefa.texto || "";
  document.getElementById("edicaoDescricao").value = tarefa.descricao || "";
  document.getElementById("edicaoData").value = tarefa.data || getDataHoje();
  document.getElementById("edicaoPrioridade").value = tarefa.prioridade || "p3";
  document.getElementById("edicaoRecorrencia").value = tarefa.recorrencia || "";
  document.getElementById("modalEdicaoOverlay").classList.add("show");
};

window.fecharModalEdicao = function () {
  document.getElementById("modalEdicaoOverlay")?.classList.remove("show");
  tarefaEditandoAtual = null;
};

window.salvarEdicaoTarefa = function () {
  if (!tarefaEditandoAtual) return;
  tarefaEditandoAtual.texto = document.getElementById("edicaoTitulo").value.trim();
  tarefaEditandoAtual.descricao = document.getElementById("edicaoDescricao").value;
  tarefaEditandoAtual.data = document.getElementById("edicaoData").value;
  tarefaEditandoAtual.prioridade = document.getElementById("edicaoPrioridade").value;
  tarefaEditandoAtual.recorrencia = document.getElementById("edicaoRecorrencia").value;
  normalizarTarefaRecorrente(tarefaEditandoAtual);
  salvarDados();
  fecharModalEdicao();
  mostrarIndicadorSync("✏️ Tarefa editada!");
};

window.abrirModalDescricao = function (id) {
  const tarefa = tarefas.find((t) => t.id === id);
  if (!tarefa) return;
  tarefaDescricaoAtual = tarefa;
  document.getElementById("modalDescricaoTitulo").textContent = tarefa.texto || "Sem título";
  document.getElementById("modalDescricaoTexto").textContent = tarefa.descricao || "Nenhuma descrição adicionada";
  document.getElementById("modalDescricaoOverlay")?.classList.add("show");
};

window.fecharModalDescricao = function () {
  document.getElementById("modalDescricaoOverlay")?.classList.remove("show");
  tarefaDescricaoAtual = null;
};

window.editarDescricaoModal = function () {
  if (!tarefaDescricaoAtual) return;
  const nova = prompt("Editar descrição:", tarefaDescricaoAtual.descricao || "");
  if (nova !== null) {
    tarefaDescricaoAtual.descricao = nova;
    salvarDados();
    fecharModalDescricao();
    mostrarIndicadorSync("📝 Descrição atualizada!");
  }
};

window.abrirModalReagendar = function (id) {
  tarefaReagendando = tarefas.find((t) => t.id === id);
  if (!tarefaReagendando) return;
  document.getElementById("novaDataReagendar").value = tarefaReagendando.data || getDataHoje();
  document.getElementById("modalReagendarOverlay")?.classList.add("show");
};

window.fecharModalReagendar = function () {
  document.getElementById("modalReagendarOverlay")?.classList.remove("show");
  tarefaReagendando = null;
};

window.confirmarReagendamento = function () {
  const novaData = document.getElementById("novaDataReagendar").value;
  if (!tarefaReagendando || !novaData) return;

  // Evitar duplicata na nova data para séries recorrentes
  if (tarefaReagendando.recorrencia && tarefaReagendando.serieId) {
    const existe = tarefas.some(t =>
      t.serieId === tarefaReagendando.serieId &&
      t.data === novaData &&
      t.id !== tarefaReagendando.id &&
      !t.concluida
    );
    if (existe) {
      mostrarIndicadorSync("⚠️ Já existe uma tarefa pendente nesta data para esta recorrência.", "error");
      return;
    }
  }

  tarefaReagendando.data = novaData;
  tarefaReagendando.notificado = false;
  tarefasReagendadasHoje++;
  normalizarTarefaRecorrente(tarefaReagendando);
  salvarDados();
  fecharModalReagendar();
  mostrarIndicadorSync("📅 Tarefa reagendada!");
};

window.adicionarCardTarefa = function () {
  const nome = prompt("Nome do novo espaço:");
  if (!nome || !nome.trim()) return;
  cardsTarefas.push({ id: "card_" + Date.now(), nome: nome.trim() });
  salvarDados();
  mostrarIndicadorSync(`📁 Espaço "${nome.trim()}" criado!`);
};

window.editarCardTarefa = function (id) {
  const card = cardsTarefas.find((c) => c.id === id);
  if (!card) return;
  const novoNome = prompt("Editar nome:", card.nome);
  if (!novoNome || !novoNome.trim()) return;
  const antigo = card.nome;
  card.nome = novoNome.trim();
  tarefas.forEach((t) => {
    if (t.bloco === antigo) t.bloco = card.nome;
  });
  salvarDados();
  mostrarIndicadorSync("✏️ Espaço renomeado!");
};

window.excluirCardTarefa = function (id) {
  if (!confirm("Excluir este espaço?")) return;
  const card = cardsTarefas.find((c) => c.id === id);
  if (!card) return;
  tarefas = tarefas.filter((t) => t.bloco !== card.nome);
  cardsTarefas = cardsTarefas.filter((c) => c.id !== id);
  if (cardsTarefas.length === 0) cardsTarefas = [{ id: "default_" + Date.now(), nome: "Minhas Tarefas" }];
  salvarDados();
  mostrarIndicadorSync("🗑 Espaço excluído!");
};

window.mostrarFormAdicionar = function (cardId) {
  const form = document.getElementById(`form-${cardId}`);
  if (!form) return;
  form.classList.toggle("show");
  if (form.classList.contains("show")) {
    const input = document.getElementById(`texto-${cardId}`);
    if (input) setTimeout(() => input.focus(), 100);
  }
};

window.adicionarTarefaInline = function (cardId) {
  const card = cardsTarefas.find((c) => c.id === cardId);
  if (!card) return;

  const texto = document.getElementById(`texto-${cardId}`)?.value.trim();
  if (!texto) return;

  const descricao = document.getElementById(`descricao-${cardId}`)?.value.trim() || "";
  const data = document.getElementById(`data-${cardId}`)?.value || getDataHoje();
  const prioridade = document.getElementById(`prioridade-${cardId}`)?.value || "p3";
  const recorrencia = document.getElementById(`recorrencia-${cardId}`)?.value || "";

  const nova = {
    id: uid(),
    texto,
    descricao,
    bloco: card.nome,
    data,
    prioridade,
    recorrencia,
    concluida: false,
    tempoGasto: 0,
    notificado: false,
    ordem: tarefas.filter((t) => t.bloco === card.nome && !t.concluida).length
  };

  normalizarTarefaRecorrente(nova);
  tarefas.push(nova);

  const txt = document.getElementById(`texto-${cardId}`);
  const desc = document.getElementById(`descricao-${cardId}`);
  if (txt) txt.value = "";
  if (desc) desc.value = "";

  document.getElementById(`form-${cardId}`)?.classList.remove("show");
  salvarDados();
  mostrarIndicadorSync("✅ Tarefa adicionada!");
};

window.marcarTodasHoje = function () {
  const hoje = getDataHoje();
  const alvos = tarefas.filter((t) => t.data === hoje && !t.concluida);
  if (alvos.length === 0) {
    alert("🎉 Nenhuma tarefa pendente para hoje!");
    return;
  }
  if (confirm(`Concluir ${alvos.length} tarefa(s) de hoje?`)) {
    alvos.forEach((t) => concluirTarefaComRecorrencia(t.id));
    salvarDados();
    mostrarIndicadorSync(`🎉 ${alvos.length} tarefa(s) concluída(s)!`);
  }
};

/* Drag and Drop */
window.iniciarDragTarefa = function (id, cardNome, event) {
  tarefaArrastandoId = id;
  tarefaArrastandoOrigem = cardNome;
  event.dataTransfer.setData("text/plain", String(id));
  const el = event.target.closest(".tarefa-item");
  if (el) el.classList.add("dragging");
};

window.permitirDropTarefa = (event) => event.preventDefault();
window.permitirDropCard = (event) => {
  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
};
window.removerDragOver = (event) => event.currentTarget.classList.remove("drag-over");

window.soltarTarefa = function (event, cardNomeDestino, tarefaIdDestino) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");
  if (!tarefaArrastandoId) return;

  if (tarefaArrastandoOrigem === cardNomeDestino && tarefaIdDestino) {
    const tarefasDoCard = tarefas
      .filter((t) => t.bloco === cardNomeDestino && !t.concluida)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    const indexOrigem = tarefasDoCard.findIndex((t) => t.id === tarefaArrastandoId);
    const indexDestino = tarefasDoCard.findIndex((t) => t.id === tarefaIdDestino);

    if (indexOrigem !== -1 && indexDestino !== -1) {
      const [item] = tarefasDoCard.splice(indexOrigem, 1);
      tarefasDoCard.splice(indexDestino, 0, item);
      tarefasDoCard.forEach((t, idx) => {
        const g = tarefas.find((gt) => gt.id === t.id);
        if (g) g.ordem = idx;
      });
      salvarDados();
    }
  } else if (tarefaArrastandoOrigem !== cardNomeDestino) {
    const tarefa = tarefas.find((t) => t.id === tarefaArrastandoId);
    if (tarefa) {
      tarefa.bloco = cardNomeDestino;
      salvarDados();
      mostrarIndicadorSync("📦 Tarefa movida");
    }
  }

  tarefaArrastandoId = null;
  tarefaArrastandoOrigem = null;
  document.querySelectorAll(".tarefa-item").forEach((el) => el.classList.remove("dragging"));
};

/* =========================
   MODO FOCO
========================= */
function mostrarNotificacaoBrowser(titulo, corpo) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(titulo, { body: corpo, icon: "logo.png" });
  }
}

window.abrirModoFoco = function (id) {
  const tarefa = tarefas.find((t) => t.id === id);
  if (!tarefa) return;

  tarefaFocoAtual = tarefa;
  segundosRestantes = 25 * 60;
  emPausa = false;

  const txt = document.getElementById("tarefaFocoTexto");
  if (txt) txt.textContent = tarefa.texto;

  const timer = document.getElementById("timerFocoGrande");
  if (timer) timer.textContent = "25:00";

  const bar = document.getElementById("progressoFocoBar");
  if (bar) bar.style.width = "0%";

  const btnIniciar = document.getElementById("btnIniciarFoco");
  const btnPausar = document.getElementById("btnPausarFoco");
  if (btnIniciar) btnIniciar.style.display = "inline-flex";
  if (btnPausar) btnPausar.style.display = "none";

  document.getElementById("modalFocoOverlay")?.classList.add("show");
  mostrarNotificacaoBrowser("🧘 Modo Foco iniciado", `Foco em: ${tarefa.texto}`);
};

window.fecharModoFoco = function () {
  if (timerPomodoro) clearInterval(timerPomodoro);
  timerPomodoro = null;
  document.getElementById("modalFocoOverlay")?.classList.remove("show");
};

function atualizarTimerUI() {
  const m = Math.floor(segundosRestantes / 60);
  const s = segundosRestantes % 60;
  const timer = document.getElementById("timerFocoGrande");
  if (timer) timer.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  const total = 25 * 60;
  const perc = Math.min(100, Math.max(0, ((total - segundosRestantes) / total) * 100));
  const bar = document.getElementById("progressoFocoBar");
  if (bar) bar.style.width = `${perc}%`;
}

window.iniciarPomodoro = function () {
  if (timerPomodoro) return;
  emPausa = false;
  const b1 = document.getElementById("btnIniciarFoco");
  const b2 = document.getElementById("btnPausarFoco");
  if (b1) b1.style.display = "none";
  if (b2) b2.style.display = "inline-flex";

  timerPomodoro = setInterval(() => {
    if (emPausa) return;
    segundosRestantes--;
    atualizarTimerUI();

    if (segundosRestantes <= 0) {
      clearInterval(timerPomodoro);
      timerPomodoro = null;

      tempoFocadoHoje += 25;
      tempoTotalFocado += 25;

      if (tarefaFocoAtual) {
        tarefaFocoAtual.tempoGasto = (tarefaFocoAtual.tempoGasto || 0) + 25;
      }

      salvarDados();
      mostrarIndicadorSync("🍅 Pomodoro concluído!");
      mostrarNotificacaoBrowser("🍅 Pomodoro concluído!", "Parabéns! Você completou um ciclo de foco.");
      if (b1) b1.style.display = "inline-flex";
      if (b2) b2.style.display = "none";
    }
  }, 1000);
};

window.pausarPomodoro = function () {
  emPausa = !emPausa;
  const btn = document.getElementById("btnPausarFoco");
  if (btn) btn.innerHTML = emPausa ? '<i class="fas fa-play"></i> Retomar' : '<i class="fas fa-pause"></i> Pausar';
};

window.prorrogarTempoFoco = function () {
  segundosRestantes += 10 * 60;
  atualizarTimerUI();
  mostrarIndicadorSync("⏱️ +10 minutos adicionados");
};

window.concluirTarefaFoco = function () {
  if (!tarefaFocoAtual) return;
  concluirTarefaComRecorrencia(tarefaFocoAtual.id);
  salvarDados();
  mostrarIndicadorSync("✅ Tarefa concluída no foco!");
  mostrarNotificacaoBrowser("✅ Tarefa concluída!", `"${tarefaFocoAtual.texto}" foi concluída.`);
  fecharModoFoco();
};

window.toggleMusicaFoco = function () {
  const audio = document.getElementById("lofiAudio");
  const btn = document.getElementById("btnMusicaFoco");
  if (!audio || !btn) return;

  if (!musicaAtiva) {
    audio.play().catch(() => {});
    musicaAtiva = true;
    btn.innerHTML = '<i class="fas fa-volume-mute"></i> Parar LoFi';
  } else {
    audio.pause();
    musicaAtiva = false;
    btn.innerHTML = '<i class="fas fa-music"></i> LoFi Focus';
  }
};

window.ajustarVolumeFoco = function (valor) {
  const audio = document.getElementById("lofiAudio");
  if (!audio) return;
  audio.volume = Math.max(0, Math.min(1, Number(valor) / 100));
};

/* =========================
   METAS
========================= */
window.togglePainelMetas = function () {
  const painel = document.getElementById("metasCompletas");
  const btn = document.getElementById("metasToggleBtn");
  if (!painel || !btn) return;

  const aberto = painel.style.display === "block";
  painel.style.display = aberto ? "none" : "block";
  btn.textContent = aberto ? "Ver metas" : "Ocultar metas";
};

function renderizarMetas() {
  const container = document.getElementById("metasGrid");
  if (!container) return;

  container.innerHTML = metas
    .map(
      (m) => `
      <div class="meta-card-mini" style="background:rgba(255,255,255,0.08); padding:12px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:10px; flex:1;">
          <div class="${m.concluida ? "circulo-concluido" : "circulo-pendente"}" onclick="toggleMeta(${m.id})">
            ${m.concluida ? '<i class="fas fa-check" style="color:white;font-size:12px;"></i>' : ""}
          </div>
          <div>
            <div class="titulo-meta">${escapeHtml(m.texto)}</div>
            <small style="color:rgba(255,255,255,0.5); font-size:11px;">${escapeHtml(m.categoria || "")}</small>
          </div>
        </div>
        <button onclick="excluirMeta(${m.id})" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `
    )
    .join("");

  const total = metas.length;
  const concl = metas.filter((m) => m.concluida).length;
  const progresso = total ? Math.round((concl / total) * 100) : 0;

  const t = document.getElementById("totalMetas");
  const c = document.getElementById("concluidasMetas");
  const p = document.getElementById("progressoMetas");
  if (t) t.textContent = String(total);
  if (c) c.textContent = String(concl);
  if (p) p.textContent = String(progresso);
}

function renderizarMetasCarrossel() {
  const container = document.getElementById("metasCarousel");
  if (!container) return;
  container.style.display = "none";
  container.innerHTML = "";
}

window.adicionarMeta = function () {
  const texto = document.getElementById("novaMetaTexto")?.value?.trim();
  const categoria = document.getElementById("novaMetaCategoria")?.value || "Geral";
  if (!texto) return;
  metas.push({ id: Date.now(), texto, categoria, concluida: false });
  const inp = document.getElementById("novaMetaTexto");
  if (inp) inp.value = "";
  salvarDados();
  mostrarIndicadorSync("🎯 Meta adicionada!");
};

window.toggleMeta = function (id) {
  const m = metas.find((x) => x.id === id);
  if (!m) return;
  m.concluida = !m.concluida;
  salvarDados();
  mostrarIndicadorSync(m.concluida ? "✅ Meta concluída!" : "🔄 Meta reativada!");
};

window.excluirMeta = function (id) {
  if (!confirm("Excluir meta?")) return;
  metas = metas.filter((m) => m.id !== id);
  salvarDados();
  mostrarIndicadorSync("🗑 Meta excluída!");
};

/* =========================
   DASHBOARD / RODAPÉ
========================= */
function atualizarDashboard() {
  const hoje = getDataHoje();
  const tarefasHoje = tarefas.filter((t) => t.data === hoje && !t.concluida);
  const tarefasAtrasadas = tarefas.filter((t) => t.data && t.data < hoje && !t.concluida);

  const alerta = document.getElementById("dashboardAlerta");
  if (!alerta) return;

  const alertaTexto = document.getElementById("alertaTexto");
  const alertaSubtexto = document.getElementById("alertaSubtexto");
  const alertaBtn = document.getElementById("alertaBtn");

  if (tarefasAtrasadas.length > 0) {
    alerta.style.display = "inline-flex";
    if (alertaTexto) alertaTexto.textContent = `Você tem ${tarefasAtrasadas.length} tarefa(s) atrasada(s)!`;
    if (alertaSubtexto) alertaSubtexto.textContent = "Reagende ou conclua agora";
    if (alertaBtn) alertaBtn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (tarefasHoje.length > 0) {
    alerta.style.display = "inline-flex";
    if (alertaTexto) alertaTexto.textContent = `Você tem ${tarefasHoje.length} tarefa(s) para hoje!`;
    if (alertaSubtexto) alertaSubtexto.textContent = "Organize seu dia 🎯";
    if (alertaBtn) alertaBtn.onclick = () => irParaHoje();
  } else {
    alerta.style.display = "none";
  }
}

function atualizarRodape() {
  const hoje = getDataHoje();
  const concluidas = tarefas.filter((t) => t.concluida && t.data === hoje).length;
  const pendentes = tarefas.filter((t) => !t.concluida && t.data === hoje).length;
  const total = concluidas + pendentes;
  const taxa = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  const footerConcluidas = document.getElementById("footerConcluidas");
  const footerTaxa = document.getElementById("footerTaxa");
  const footerPendentes = document.getElementById("footerPendentes");
  const footerTempo = document.getElementById("footerTempo");
  const footerReagendadas = document.getElementById("footerReagendadasCount");

  if (footerConcluidas) footerConcluidas.textContent = String(concluidas);
  if (footerTaxa) footerTaxa.textContent = `${taxa}%`;
  if (footerPendentes) footerPendentes.textContent = String(pendentes);
  if (footerTempo) footerTempo.textContent = `${Math.floor(tempoFocadoHoje / 60)}h ${tempoFocadoHoje % 60}m`;
  if (footerReagendadas) footerReagendadas.textContent = String(tarefasReagendadasHoje);
}

/* =========================
   CALENDÁRIO / VIEW
========================= */
const VIEW_STORAGE_KEY = "fluxo_view_mode";

function setActiveViewButton(view) {
  const btnCards = document.querySelector('.view-btn[onclick*="cards"]');
  const btnCalendario = document.querySelector('.view-btn[onclick*="calendario"]');
  btnCards?.classList.toggle("active", view === "cards");
  btnCalendario?.classList.toggle("active", view === "calendario");
}

function setView(view, persist = true) {
  const cards = document.getElementById("cardsView");
  const cal = document.getElementById("calendarioView");
  if (!cards || !cal) return;

  if (view === "calendario") {
    cards.style.display = "none";
    cal.style.display = "block";
    renderizarCalendario();
  } else {
    cards.style.display = "block";
    cal.style.display = "none";
  }

  setActiveViewButton(view);
  if (persist) localStorage.setItem(VIEW_STORAGE_KEY, view);
}

window.toggleView = function (view) {
  setView(view, true);
};

window.mudarModoCalendario = function (modo) {
  modoCalendario = modo;
  localStorage.setItem("modoCalendario", modo);
  renderizarCalendario();
  // Atualizar botões ativos
  document.querySelectorAll(".cal-view-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === modo);
  });
};

window.mudarMes = function (delta) {
  dataCalendario.setMonth(dataCalendario.getMonth() + delta);
  renderizarCalendario();
};

window.irParaHoje = function () {
  dataCalendario = new Date();
  const cal = document.getElementById("calendarioView");
  if (cal && cal.style.display !== "none") renderizarCalendario();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

/* ===== MODAL DIA CALENDÁRIO ===== */
function renderizarConteudoModalDia(dataStr) {
  const tituloEl = document.getElementById("modalDiaTitulo");
  const resumoEl = document.getElementById("modalDiaResumo");
  const listaEl = document.getElementById("modalDiaLista");
  if (!tituloEl || !resumoEl || !listaEl) return;

  const tarefasDia = tarefas
    .filter((t) => t.data === dataStr && !t.concluida)
    .sort((a, b) => {
      const ordem = { p1: 1, p2: 2, p3: 3 };
      const pa = ordem[a.prioridade || "p3"];
      const pb = ordem[b.prioridade || "p3"];
      if (pa !== pb) return pa - pb;
      return (a.ordem || 0) - (b.ordem || 0);
    });

  tituloEl.textContent = formatarDataPtBr(dataStr);
  resumoEl.textContent = tarefasDia.length === 0
    ? "Nenhuma tarefa pendente neste dia."
    : `${tarefasDia.length} tarefa(s) pendente(s)`;

  if (tarefasDia.length === 0) {
    listaEl.innerHTML = `<div class="modal-dia-empty">Sem tarefas pendentes para este dia 🎉</div>`;
    return;
  }

  const recorrenciaLabel = {
    diaria: "Diária",
    dias_uteis: "Dias úteis",
    semanal: "Semanal",
    mensal: "Mensal"
  };

  listaEl.innerHTML = tarefasDia.map((t) => {
    const cls = t.prioridade === "p1" ? "p1" : t.prioridade === "p2" ? "p2" : "p3";
    const bloco = t.bloco ? `<span class="modal-dia-tag"><i class="fas fa-folder-open"></i> ${escapeHtml(t.bloco)}</span>` : "";
    const rec = t.recorrencia ? `<span class="modal-dia-tag"><i class="fas fa-redo-alt"></i> ${recorrenciaLabel[t.recorrencia] || "Recorrente"}</span>` : "";
    const pri = `<span class="modal-dia-tag">${
      t.prioridade === "p1" ? "🔴 Alta" : t.prioridade === "p2" ? "🟡 Média" : "🟢 Baixa"
    }</span>`;

    return `
      <div class="modal-dia-item ${cls}">
        <div class="modal-dia-main">
          <div class="modal-dia-title">${escapeHtml(t.texto)}</div>
          ${t.descricao ? `<div class="modal-dia-desc">${escapeHtml(t.descricao)}</div>` : ""}
          <div class="modal-dia-tags">
            ${pri}
            ${bloco}
            ${rec}
          </div>
        </div>

        <div class="modal-dia-actions">
          <button class="modal-dia-btn" title="Concluir" onclick="toggleTarefa(${JSON.stringify(t.id)}); event.stopPropagation();">
            <i class="fas fa-check"></i>
          </button>
          <button class="modal-dia-btn" title="Editar" onclick="abrirModalEdicao(${JSON.stringify(t.id)}); event.stopPropagation();">
            <i class="fas fa-edit"></i>
          </button>
          <button class="modal-dia-btn" title="Reagendar" onclick="abrirModalReagendar(${JSON.stringify(t.id)}); event.stopPropagation();">
            <i class="fas fa-calendar-alt"></i>
          </button>
          <button class="modal-dia-btn danger" title="Excluir" onclick="excluirTarefa(${JSON.stringify(t.id)}); event.stopPropagation();">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

window.adicionarTarefaNoDiaModal = function () {
  if (!dataModalDiaAtual) return;

  const textoEl = document.getElementById("modalDiaNovoTexto");
  const descEl = document.getElementById("modalDiaNovaDescricao");
  const priEl = document.getElementById("modalDiaNovaPrioridade");
  const recEl = document.getElementById("modalDiaNovaRecorrencia");

  const texto = textoEl?.value?.trim();
  const descricao = descEl?.value?.trim() || "";
  const prioridade = priEl?.value || "p2";
  const recorrencia = recEl?.value || "";

  if (!texto) {
    alert("Digite o título da tarefa.");
    return;
  }

  const blocoPadrao = (cardsTarefas[0] && cardsTarefas[0].nome) ? cardsTarefas[0].nome : "Minhas Tarefas";

  const nova = {
    id: uid(),
    texto,
    descricao,
    bloco: blocoPadrao,
    data: dataModalDiaAtual,
    prioridade,
    recorrencia,
    concluida: false,
    tempoGasto: 0,
    notificado: false,
    ordem: tarefas.filter((t) => t.bloco === blocoPadrao && !t.concluida).length
  };

  normalizarTarefaRecorrente(nova);
  tarefas.push(nova);

  if (textoEl) textoEl.value = "";
  if (descEl) descEl.value = "";
  if (priEl) priEl.value = "p2";
  if (recEl) recEl.value = "";

  salvarDados();
  mostrarIndicadorSync("✅ Tarefa adicionada no calendário!");
};

window.abrirDiaCalendario = function (dataStr) {
  dataModalDiaAtual = dataStr;
  renderizarConteudoModalDia(dataStr);

  const textoEl = document.getElementById("modalDiaNovoTexto");
  const descEl = document.getElementById("modalDiaNovaDescricao");
  const priEl = document.getElementById("modalDiaNovaPrioridade");
  const recEl = document.getElementById("modalDiaNovaRecorrencia");
  if (textoEl) textoEl.value = "";
  if (descEl) descEl.value = "";
  if (priEl) priEl.value = "p2";
  if (recEl) recEl.value = "";

  document.getElementById("modalDiaOverlay")?.classList.add("show");
};

window.fecharDiaCalendario = function () {
  document.getElementById("modalDiaOverlay")?.classList.remove("show");
  dataModalDiaAtual = null;
};

/* ===== RENDERIZAÇÃO DO CALENDÁRIO (com modos) ===== */
function renderizarCalendario() {
  const grade = document.getElementById("calendarioGrade");
  const mesLabel = document.getElementById("calendarioMes");
  if (!grade) return;

  const ano = dataCalendario.getFullYear();
  const mes = dataCalendario.getMonth();
  const hoje = getDataHoje();
  const isMobile = window.innerWidth <= 768;

  if (mesLabel) {
    mesLabel.textContent = dataCalendario.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric"
    });
  }

  // Limpar classe de modo
  grade.className = "calendario-grade";
  if (modoCalendario === "semana") grade.classList.add("modo-semana");
  else if (modoCalendario === "dia") grade.classList.add("modo-dia");

  let html = "";

  if (modoCalendario === "mes") {
    // Modo mês: grade 7x
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const inicioSemana = (primeiroDia.getDay() + 6) % 7;
    const totalDias = ultimoDia.getDate();

    const diasSemana = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    html = diasSemana
      .map((d) => `<div style="font-size:12px;opacity:.75;text-align:center;padding:6px 0;color:white;">${d}</div>`)
      .join("");

    for (let i = 0; i < inicioSemana; i++) html += `<div></div>`;

    for (let dia = 1; dia <= totalDias; dia++) {
      const dataStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      html += gerarCelulaDia(dataStr, dia, hoje, false, isMobile);
    }
  } else if (modoCalendario === "semana") {
    // Modo semana: 7 dias a partir da segunda-feira da semana atual
    const dataInicio = new Date(ano, mes, 1);
    const diaSemana = (dataInicio.getDay() + 6) % 7; // 0=seg, 6=dom
    const inicioSemanaOffset = -diaSemana;
    const dataSegunda = new Date(ano, mes, 1);
    dataSegunda.setDate(dataSegunda.getDate() + inicioSemanaOffset);

    // Ajustar para a semana que contém dataCalendario
    const diffDias = (dataCalendario - dataSegunda) / (1000*60*60*24);
    const semanaAtual = Math.floor(diffDias / 7);
    dataSegunda.setDate(dataSegunda.getDate() + semanaAtual * 7);

    // Cabeçalho com dias da semana
    const diasSemana = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    html = diasSemana
      .map((d) => `<div style="font-size:12px;opacity:.75;text-align:center;padding:6px 0;color:white;">${d}</div>`)
      .join("");

    for (let i = 0; i < 7; i++) {
      const dataDia = new Date(dataSegunda);
      dataDia.setDate(dataDia.getDate() + i);
      const dia = dataDia.getDate();
      const mesDia = dataDia.getMonth() + 1;
      const anoDia = dataDia.getFullYear();
      const dataStr = `${anoDia}-${String(mesDia).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      html += gerarCelulaDia(dataStr, dia, hoje, false, isMobile);
    }
  } else if (modoCalendario === "dia") {
    // Modo dia: apenas o dia selecionado (dataCalendario)
    const dia = dataCalendario.getDate();
    const mesDia = dataCalendario.getMonth() + 1;
    const anoDia = dataCalendario.getFullYear();
    const dataStr = `${anoDia}-${String(mesDia).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    // Cabeçalho com o dia da semana e data
    const nomeDia = dataCalendario.toLocaleDateString("pt-BR", { weekday: "long" });
    html = `<div style="grid-column:1; text-align:center; color:white; font-weight:600; padding:8px 0;">${nomeDia}, ${dia}/${mesDia}/${anoDia}</div>`;
    html += gerarCelulaDia(dataStr, dia, hoje, true, isMobile);
  }

  grade.innerHTML = html;
}

function gerarCelulaDia(dataStr, dia, hoje, expandido = false, isMobile = false) {
  const tarefasDia = tarefas
    .filter((t) => t.data === dataStr && !t.concluida)
    .sort((a, b) => {
      const ordem = { p1: 1, p2: 2, p3: 3 };
      return ordem[a.prioridade || "p3"] - ordem[b.prioridade || "p3"];
    });

  const isHoje = dataStr === hoje;
  const maxVisiveis = isMobile ? 2 : 3;
  const visiveis = expandido ? tarefasDia : tarefasDia.slice(0, maxVisiveis);
  const restantes = tarefasDia.length - visiveis.length;

  const tarefasHtml = visiveis
    .map((t) => {
      const cls = t.prioridade === "p1" ? "p1" : t.prioridade === "p2" ? "p2" : "p3";
      return `
        <div class="cal-task ${cls}" title="${escapeHtml(t.texto)}">
          <span>${escapeHtml(t.texto)}</span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="cal-dia ${isHoje ? "hoje" : ""}" onclick="abrirDiaCalendario('${dataStr}')">
      <div class="cal-dia-topo">
        <span class="cal-dia-num">${dia}</span>
        ${tarefasDia.length > 0 ? `<span class="cal-dia-badge">${tarefasDia.length}</span>` : ""}
      </div>
      <div class="cal-dia-lista">
        ${tarefasHtml}
        ${restantes > 0 && !expandido ? `<div class="cal-task-more">+${restantes} mais</div>` : ""}
      </div>
    </div>
  `;
}

/* =========================
   RENDER TAREFAS (CARDS)
========================= */
function renderizarTarefas() {
  const container = document.getElementById("blocosTarefas");
  if (!container) return;

  const hoje = getDataHoje();
  container.innerHTML = "";

  cardsTarefas.forEach((card) => {
    let lista = tarefas.filter((t) => t.bloco === card.nome);
    lista = lista.filter((t) => {
      if (!t.data || t.concluida) return false;
      return t.data === hoje || t.data < hoje;
    });

    const ativas = lista.filter((t) => !t.concluida).length;
    const cardId = card.id;

    const tarefasHtml = lista
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .map((t) => {
        const atrasada = t.data && t.data < hoje;
        const recorrenciaLabel = {
          diaria: "Diária",
          dias_uteis: "Dias úteis",
          semanal: "Semanal",
          mensal: "Mensal"
        }[t.recorrencia] || "";

        const classePrioridade = t.prioridade === "p1" ? "p1" : t.prioridade === "p2" ? "p2" : "p3";

        return `<div class="tarefa-item ${classePrioridade}"
          draggable="true"
          ondragstart="iniciarDragTarefa(${JSON.stringify(t.id)}, '${escapeHtml(card.nome).replace(/'/g, "\\'")}', event)"
          ondragend="document.querySelectorAll('.tarefa-item').forEach(el=>el.classList.remove('dragging'))"
          ondragover="permitirDropTarefa(event)"
          ondrop="soltarTarefa(event, '${escapeHtml(card.nome).replace(/'/g, "\\'")}', ${JSON.stringify(t.id)})">

          <div class="task-left">
            <div class="drag-handle"><i class="fas fa-grip-vertical"></i></div>
            <input type="checkbox" class="task-checkbox" ${t.concluida ? "checked" : ""} onchange="toggleTarefa(${JSON.stringify(t.id)})">
            <div class="task-info">
              <div class="task-title" onclick="abrirModalEdicao(${JSON.stringify(t.id)})" title="Clique para editar">${escapeHtml(t.texto)}</div>
              <div class="task-meta">
                <span class="meta-date ${atrasada ? "badge atrasada" : ""}"
                  onclick="abrirModalReagendar(${JSON.stringify(t.id)}); event.stopPropagation()">
                  <i class="fas fa-calendar"></i> ${t.data} ${atrasada ? "⚠" : ""}
                </span>
                ${t.recorrencia ? `<span class="meta-tag"><i class="fas fa-redo-alt"></i> ${recorrenciaLabel}</span>` : ""}
                ${t.tempoGasto ? `<span class="meta-tag"><i class="fas fa-clock"></i> ${Math.floor(t.tempoGasto / 60)}min</span>` : ""}
              </div>
            </div>
          </div>

          <div class="task-actions-2x2">
            <button class="task-action-btn" onclick="abrirModoFoco(${JSON.stringify(t.id)}); event.stopPropagation()" title="Modo Foco">
              <i class="fas fa-clock"></i>
            </button>
            <button class="task-action-btn danger" onclick="excluirTarefa(${JSON.stringify(t.id)}); event.stopPropagation()" title="Excluir">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>`;
      })
      .join("");

    const div = document.createElement("div");
    div.className = "card-espaco";
    div.setAttribute("ondragover", "permitirDropCard(event)");
    div.setAttribute("ondragleave", "removerDragOver(event)");
    div.setAttribute("ondrop", `soltarTarefa(event, '${escapeHtml(card.nome).replace(/'/g, "\\'")}', null)`);

    div.innerHTML = `
      <div class="card-header">
        <span><i class="fas fa-list-ul"></i> ${escapeHtml(card.nome)}</span>
        <div>
          <span style="color:white;">${ativas} ativas</span>
          <button onclick="editarCardTarefa('${card.id}')"><i class="fas fa-edit"></i></button>
          <button onclick="excluirCardTarefa('${card.id}')"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>

      <div class="card-content">
        ${
          lista.length === 0
            ? `<div class="estado-vazio" style="text-align:center;padding:40px;">
                <i class="fas fa-check-circle" style="font-size:32px;opacity:0.5;"></i>
                <p style="color:white;">Tudo certo</p>
                <small style="color:rgba(255,255,255,0.5);">Adicione uma tarefa</small>
              </div>`
            : tarefasHtml
        }
      </div>

      <button class="btn-nova-tarefa" onclick="mostrarFormAdicionar('${cardId}')">
        <i class="fas fa-plus-circle"></i> Nova Tarefa
      </button>

      <div class="inline-form" id="form-${cardId}">
        <input type="text" id="texto-${cardId}" placeholder="Título...">
        <textarea id="descricao-${cardId}" placeholder="Descrição..." rows="2"></textarea>
        <input type="date" id="data-${cardId}" value="${getDataHoje()}">
        <select id="prioridade-${cardId}">
          <option value="p3">🟢 Baixa</option>
          <option value="p2">🟡 Média</option>
          <option value="p1">🔴 Alta</option>
        </select>
        <select id="recorrencia-${cardId}">
          <option value="">Sem recorrência</option>
          <option value="diaria">Diária</option>
          <option value="dias_uteis">Dias úteis</option>
          <option value="semanal">Semanal</option>
          <option value="mensal">Mensal</option>
        </select>
        <div class="inline-form-buttons">
          <button class="btn-confirm" onclick="adicionarTarefaInline('${cardId}')">Adicionar</button>
          <button class="btn-cancel" onclick="document.getElementById('form-${cardId}').classList.remove('show')">Cancelar</button>
        </div>
      </div>
    `;

    container.appendChild(div);
  });

  const addCard = document.createElement("div");
  addCard.className = "card-novo-espaco";
  addCard.onclick = () => adicionarCardTarefa();
  addCard.innerHTML = `<div><i class="fas fa-plus-circle"></i><p>Novo Espaço</p></div>`;
  container.appendChild(addCard);
}

/* =========================
   STATUS / TEMA / EVENTOS
========================= */
function atualizarStatusConexao() {
  const el = document.getElementById("statusConnection");
  if (!el) return;
  if (navigator.onLine) {
    el.classList.remove("status-offline");
    el.classList.add("status-online");
    el.innerHTML = `<i class="fas fa-wifi"></i> Online`;
  } else {
    el.classList.remove("status-online");
    el.classList.add("status-offline");
    el.innerHTML = `<i class="fas fa-wifi"></i> Offline`;
  }
}

function aplicarTemaSalvo() {
  const tema = localStorage.getItem("temaFluxo") || "dark";
  document.body.classList.toggle("dark-theme", tema === "dark");
  const icon = document.querySelector("#themeToggle i");
  if (icon) icon.className = tema === "dark" ? "fas fa-sun" : "fas fa-moon";
}

function toggleTema() {
  const dark = document.body.classList.toggle("dark-theme");
  localStorage.setItem("temaFluxo", dark ? "dark" : "light");
  const icon = document.querySelector("#themeToggle i");
  if (icon) icon.className = dark ? "fas fa-sun" : "fas fa-moon";
}

function bindUI() {
  document.getElementById("logoutBtn")?.addEventListener("click", () => fazerLogout());
  document.getElementById("themeToggle")?.addEventListener("click", toggleTema);

  document.getElementById("syncNowBtn")?.addEventListener("click", () => {
    const ok = sincronizarTarefasRecorrentes();
    salvarDados();
    if (!ok) mostrarIndicadorSync("ℹ️ Nada novo para sincronizar", "info");
  });

  document.getElementById("backupBtn")?.addEventListener("click", () => abrirModalBackup());

  document.getElementById("notifyBtn")?.addEventListener("click", () => abrirModalNotificacoes());

  document.getElementById("rescheduleBtn")?.addEventListener("click", () => {
    const hoje = getDataHoje();
    const atrasadas = tarefas.filter((t) => t.data && t.data < hoje && !t.concluida);
    if (atrasadas.length === 0) {
      mostrarIndicadorSync("🎉 Sem tarefas atrasadas");
      return;
    }
    if (!confirm(`Reagendar ${atrasadas.length} tarefa(s) atrasada(s) para hoje?`)) return;
    atrasadas.forEach((t) => {
      t.data = hoje;
      t.notificado = false;
      tarefasReagendadasHoje++;
      normalizarTarefaRecorrente(t);
    });
    salvarDados();
    mostrarIndicadorSync(`📅 ${atrasadas.length} tarefa(s) reagendada(s)!`);
  });

  // Dropdown toggle
  const dropdownToggle = document.getElementById("dropdownToggle");
  const dropdownContent = document.getElementById("dropdownContent");
  if (dropdownToggle && dropdownContent) {
    dropdownToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdownContent.classList.toggle("show");
    });
    document.addEventListener("click", () => dropdownContent.classList.remove("show"));
  }

  const modalDia = document.getElementById("modalDiaOverlay");
  if (modalDia) {
    modalDia.addEventListener("click", (e) => {
      if (e.target === modalDia) fecharDiaCalendario();
    });
  }

  // Fechar modais com clique no overlay
  document.querySelectorAll(".modal-descricao-overlay, .modal-backup-overlay, .modal-edicao-overlay, .modal-reagendar-overlay, .modal-notificacoes-overlay, .modal-perfil-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.remove("show");
      }
    });
  });

  window.addEventListener("online", atualizarStatusConexao);
  window.addEventListener("offline", atualizarStatusConexao);
}

/* =========================
   INIT
========================= */
async function initApp() {
  await initIndexedDB();
  verificarResetDiario();
  aplicarTemaSalvo();
  bindUI();
  atualizarStatusConexao();

  const dataHeader = document.getElementById("dataHojeHeader");
  const dataMobile = document.getElementById("dataHojeMobile");
  const textoData = formatarDataHeader(new Date());
  if (dataHeader) dataHeader.textContent = textoData;
  if (dataMobile) dataMobile.textContent = textoData;

  const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
  setView(savedView === "calendario" ? "calendario" : "cards", false);

  // Definir modo de calendário padrão para mobile
  const isMobile = window.innerWidth <= 768;
  if (isMobile && !localStorage.getItem("modoCalendario")) {
    modoCalendario = "semana";
    localStorage.setItem("modoCalendario", modoCalendario);
  }

  // Atualizar botões ativos do calendário
  document.querySelectorAll(".cal-view-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === modoCalendario);
  });

  // Pedir permissão de notificação
  if ("Notification" in window) {
    Notification.requestPermission();
  }

  // Listener para redimensionamento (mobile)
  window.addEventListener("resize", () => {
    const mobile = window.innerWidth <= 768;
    const atual = localStorage.getItem("modoCalendario");
    if (mobile && !atual) {
      modoCalendario = "semana";
      localStorage.setItem("modoCalendario", "semana");
      renderizarCalendario();
    }
  });

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    window.currentUser = user || null;

    const loginOverlay = document.getElementById("loginOverlay");
    const mainApp = document.getElementById("mainApp");
    const tooltipEmail = document.getElementById("userEmailTooltip");

    if (user) {
      usuarioAtual = user.uid;
      if (tooltipEmail) tooltipEmail.textContent = user.email || "";
      if (loginOverlay) loginOverlay.style.display = "none";
      if (mainApp) mainApp.style.display = "block";

      await carregarDadosFirebase();
      tarefas = JSON.parse(localStorage.getItem("tarefas") || "[]");
      metas = JSON.parse(localStorage.getItem("metas") || "[]");
      cardsTarefas = JSON.parse(localStorage.getItem("cardsTarefas") || "[]");
      if (cardsTarefas.length === 0) cardsTarefas = [{ id: "default_" + Date.now(), nome: "Minhas Tarefas" }];

      const mudou = sincronizarTarefasRecorrentes();
      if (mudou) {
        salvarDados();
      } else {
        renderizarTarefas();
        renderizarMetas();
        renderizarMetasCarrossel();
        renderizarCalendario();
        atualizarDashboard();
        atualizarRodape();
      }
    } else {
      if (loginOverlay) loginOverlay.style.display = "flex";
      if (mainApp) mainApp.style.display = "none";
    }
  });

  renderizarTarefas();
  renderizarMetas();
  renderizarMetasCarrossel();
  renderizarCalendario();
  atualizarDashboard();
  atualizarRodape();
}

initApp();
