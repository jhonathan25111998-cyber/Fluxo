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

/* =========================================================
   FIREBASE
========================================================= */
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

/* =========================================================
   ESTADO GLOBAL
========================================================= */
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
let dataCalendario = new Date();
let tarefaDescricaoAtual = null;
let tarefaEditandoAtual = null;

let pomodoroInterval = null;
let tempoRestante = 25 * 60;
let pomodoroAtivo = false;
let pomodoroPausado = false;
let tarefaFocoAtual = null;
let emPausaEntrePomodoros = false;
let tempoFocoInicio = 0;

let lofiAudioElement = null;
let lofiActive = false;

/* =========================================================
   HELPERS
========================================================= */
function uid() {
  return Date.now() + Math.random();
}

function getDataHoje() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
}

function escapeHtml(t) {
  if (!t) return "";
  return t.replace(/[&<>]/g, (m) => {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
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

function atualizarDataHeader() {
  const hoje = new Date();
  const dataHeader = document.getElementById("dataHojeHeader");
  const dataMobile = document.getElementById("dataHojeMobile");
  if (dataHeader) {
    dataHeader.textContent = hoje.toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }
  if (dataMobile) {
    dataMobile.textContent = hoje.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }
}

/* =========================================================
   FEEDBACK
========================================================= */
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
  setTimeout(() => indicator.classList.remove("show"), 2000);
};

/* =========================================================
   AUTH UI
========================================================= */
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
  document.getElementById("loginForm").style.display = "none";
  document.getElementById("registerForm").style.display = "block";
};

window.mostrarLogin = () => {
  document.getElementById("loginForm").style.display = "block";
  document.getElementById("registerForm").style.display = "none";
};

window.fazerLogin = async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("loginEmail").value,
      document.getElementById("loginPassword").value
    );
  } catch {
    document.getElementById("loginErrorMessage").textContent = "Email ou senha inválidos!";
  }
};

window.fazerCadastro = async () => {
  const pwd = document.getElementById("registerPassword").value;
  if (pwd !== document.getElementById("registerConfirm").value) {
    document.getElementById("registerErrorMessage").textContent = "Senhas não coincidem";
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, document.getElementById("registerEmail").value, pwd);
    window.mostrarIndicadorSync("✅ Conta criada!");
  } catch (e) {
    document.getElementById("registerErrorMessage").textContent = e.message;
  }
};

window.loginComGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    window.mostrarIndicadorSync(`✅ Bem-vindo, ${result.user.displayName || result.user.email}!`);
  } catch {
    window.mostrarIndicadorSync("❌ Erro no login com Google", "error");
  }
};

window.fazerLogout = () => signOut(auth);

/* =========================================================
   FIRESTORE SYNC
========================================================= */
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
      if (d.cardsTarefas && d.cardsTarefas.length > 0) localStorage.setItem("cardsTarefas", JSON.stringify(d.cardsTarefas));
      if (typeof d.tempoTotalFocado === "number") localStorage.setItem("tempoTotalFocado", String(d.tempoTotalFocado));
      if (typeof d.tempoFocadoHoje === "number") localStorage.setItem("tempoFocadoHoje", String(d.tempoFocadoHoje));
      if (typeof d.tarefasReagendadasHoje === "number") localStorage.setItem("tarefasReagendadasHoje", String(d.tarefasReagendadasHoje));
      window.mostrarIndicadorSync("☁️ Dados carregados!");
    }
  } catch (err) {
    console.error(err);
  }
}
window.salvarTudoFirebase = salvarTudoFirebase;

/* =========================================================
   BACKUP (INDEXEDDB + JSON)
========================================================= */
function initIndexedDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open("FLUXO_Backup_V3", 2);
    request.onerror = () => {
      console.log("Erro IndexedDB");
      resolve();
    };
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
  window.mostrarIndicadorSync("💾 Backup salvo!");
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
      window.mostrarIndicadorSync("✅ Backup restaurado!");
      setTimeout(() => location.reload(), 1000);
    }
  };
}

async function excluirBackupIndexedDB(backupId) {
  if (!dbBackup) return;
  const tx = dbBackup.transaction(["backups"], "readwrite");
  tx.objectStore("backups").delete(backupId);
  window.mostrarIndicadorSync("🗑️ Backup removido");
  window.abrirModalBackup();
}

window.fazerBackupManual = async () => {
  await salvarBackupIndexedDB();
  window.abrirModalBackup();
};

window.abrirModalBackup = async () => {
  const backups = await listarBackups();
  const container = document.getElementById("backupList");
  if (!container) return;
  if (backups.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.5);padding:20px;">Nenhum backup encontrado</div>';
  } else {
    container.innerHTML = backups
      .map(
        (b) => `
      <div class="backup-item">
        <div class="backup-info">
          <div class="backup-data"><i class="far fa-calendar-alt"></i> ${new Date(b.timestamp).toLocaleString("pt-BR")}</div>
          <div class="backup-tarefas">📋 ${b.tarefas ? JSON.parse(b.tarefas || "[]").length : 0} tarefas</div>
        </div>
        <div class="backup-actions">
          <button onclick="window.restaurarBackupIndexedDB(${b.id})" title="Restaurar"><i class="fas fa-undo-alt"></i></button>
          <button onclick="window.excluirBackupIndexedDB(${b.id})" title="Excluir"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
    `
      )
      .join("");
  }
  document.getElementById("modalBackupOverlay")?.classList.add("show");
};

window.fecharModalBackup = () => document.getElementById("modalBackupOverlay")?.classList.remove("show");
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

        window.mostrarIndicadorSync("✅ Backup importado com sucesso!");
        setTimeout(() => {
          if (window.recarregarSistema) window.recarregarSistema();
          else location.reload();
        }, 1000);
      } catch (error) {
        console.error("Erro ao importar backup:", error);
        window.mostrarIndicadorSync("❌ Erro ao importar backup - arquivo inválido", "error");
        alert("Arquivo de backup inválido. Certifique-se de importar um JSON válido exportado pelo FLUXO.");
      }
    };
    reader.onerror = function () {
      window.mostrarIndicadorSync("❌ Erro ao ler o arquivo", "error");
    };
    reader.readAsText(file);
  };
  input.click();
};

window.exportarBackupJSON = function () {
  const backup = {
    usuario: usuarioAtual,
    data: new Date().toISOString(),
    tarefas: localStorage.getItem("tarefas"),
    metas: localStorage.getItem("metas"),
    cardsTarefas: localStorage.getItem("cardsTarefas"),
    tempoTotalFocado: localStorage.getItem("tempoTotalFocado"),
    tempoFocadoHoje: localStorage.getItem("tempoFocadoHoje"),
    tarefasReagendadasHoje: localStorage.getItem("tarefasReagendadasHoje")
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  a.download = `fluxo_${(usuarioAtual || "user").replace(/[^\w.-]/g, "_")}_${new Date().toISOString().slice(0, 19)}.json`;
  a.click();
  window.mostrarIndicadorSync("📥 Backup exportado!");
};

/* =========================================================
   REGRAS DE RESET / RECORRÊNCIA
========================================================= */
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
    salvarDados();
  }
}

function sincronizarTarefasRecorrentes() {
  const syncBtn = document.getElementById("syncNowBtn");
  if (syncBtn) {
    syncBtn.classList.add("syncing");
    syncBtn.disabled = true;
  }

  window.mostrarIndicadorSync("🔄 Verificando tarefas recorrentes...");
  const hoje = getDataHoje();
  let tarefasGeradas = 0;

  const tarefasConcluidasRecorrentes = tarefas.filter((t) => t.recorrencia && t.recorrencia !== "" && t.concluida);

  for (const t of tarefasConcluidasRecorrentes) {
    let proximaData = getProximaData(t.recorrencia, t.data);
    if (!proximaData) continue;

    while (proximaData < hoje) {
      const p = getProximaData(t.recorrencia, proximaData);
      if (!p) break;
      proximaData = p;
    }

    if (proximaData >= hoje) {
      const existe = tarefas.some(
        (e) => e.texto === t.texto && e.data === proximaData && e.recorrencia === t.recorrencia && e.bloco === t.bloco
      );
      if (!existe) {
        tarefas.push({
          id: uid(),
          texto: t.texto,
          descricao: t.descricao || "",
          bloco: t.bloco,
          data: proximaData,
          prioridade: t.prioridade || "p3",
          recorrencia: t.recorrencia,
          concluida: false,
          tempoGasto: 0,
          notificado: false,
          ordem: tarefas.filter((x) => x.bloco === t.bloco && !x.concluida).length
        });
        tarefasGeradas++;
      }
    }
  }

  if (tarefasGeradas > 0) {
    salvarDados();
    window.mostrarIndicadorSync(`✅ ${tarefasGeradas} tarefa(s) recorrente(s) gerada(s)`);
  } else {
    window.mostrarIndicadorSync("✅ Nenhuma tarefa recorrente pendente");
  }

  if (syncBtn) {
    setTimeout(() => {
      syncBtn.classList.remove("syncing");
      syncBtn.disabled = false;
    }, 500);
  }
}

/* =========================================================
   DADOS / RENDER
========================================================= */
function salvarDados() {
  localStorage.setItem("tarefas", JSON.stringify(tarefas));
  localStorage.setItem("metas", JSON.stringify(metas));
  localStorage.setItem("cardsTarefas", JSON.stringify(cardsTarefas));
  localStorage.setItem("tempoTotalFocado", String(tempoTotalFocado));
  localStorage.setItem("tempoFocadoHoje", String(tempoFocadoHoje));
  localStorage.setItem("tarefasReagendadasHoje", String(tarefasReagendadasHoje));

  renderizarTarefas();
  renderizarMetas();
  renderizarCalendario();
  atualizarDashboard();
  renderizarMetasCarrossel(); // oculto, sem competir com tarefas
  atualizarRodape();

  if (window.currentUser) setTimeout(() => window.salvarTudoFirebase(), 500);
}

window.recarregarSistema = function () {
  tarefas = JSON.parse(localStorage.getItem("tarefas") || "[]");
  metas = JSON.parse(localStorage.getItem("metas") || "[]");
  cardsTarefas = JSON.parse(localStorage.getItem("cardsTarefas") || "[]");
  tempoTotalFocado = parseInt(localStorage.getItem("tempoTotalFocado") || "0", 10);
  tempoFocadoHoje = parseInt(localStorage.getItem("tempoFocadoHoje") || "0", 10);
  ultimaDataFoco = localStorage.getItem("ultimaDataFoco") || "";
  tarefasReagendadasHoje = parseInt(localStorage.getItem("tarefasReagendadasHoje") || "0", 10);
  ultimaDataReagendamento = localStorage.getItem("ultimaDataReagendamento") || "";

  if (cardsTarefas.length === 0) cardsTarefas = [{ id: "default_" + Date.now(), nome: "Minhas Tarefas" }];

  verificarResetDiario();
  renderizarTarefas();
  renderizarMetas();
  renderizarCalendario();
  atualizarDashboard();
  renderizarMetasCarrossel();
  atualizarRodape();
  atualizarDataHeader();

  setTimeout(() => window.toggleView("cards"), 100);
};

/* =========================================================
   METAS (DISCRETO)
========================================================= */
window.togglePainelMetas = function () {
  const painel = document.getElementById("metasCompletas");
  const btn = document.getElementById("metasToggleBtn");
  if (!painel || !btn) return;

  const aberto = painel.style.display === "block";
  painel.style.display = aberto ? "none" : "block";
  btn.textContent = aberto ? "Ver metas" : "Ocultar metas";
};

function renderizarMetasCarrossel() {
  // escondido para deixar tarefas como foco principal
  const container = document.getElementById("metasCarousel");
  if (!container) return;
  container.style.display = "none";
  container.innerHTML = "";
}

function renderizarMetas() {
  const total = metas.length;
  const concluidas = metas.filter((m) => m.atingida).length;
  const prog = total ? Math.round((concluidas / total) * 100) : 0;

  const elTotal = document.getElementById("totalMetas");
  const elConcluidas = document.getElementById("concluidasMetas");
  const elProg = document.getElementById("progressoMetas");

  if (elTotal) elTotal.textContent = String(total);
  if (elConcluidas) elConcluidas.textContent = String(concluidas);
  if (elProg) elProg.textContent = String(prog);

  const container = document.getElementById("metasGrid");
  if (!container) return;

  if (total === 0) {
    container.innerHTML =
      '<div style="text-align:center;padding:40px;"><i class="fas fa-flag-checkered" style="font-size:48px;opacity:0.5;"></i><p style="color:white;">Nenhuma meta definida</p></div>';
    return;
  }

  container.innerHTML = metas
    .map(
      (m) => `
      <div class="meta-item" style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;">
        <div>
          <div style="color:white;">${escapeHtml(m.texto)}</div>
          <div style="color:#fbbf24;font-size:11px;">${escapeHtml(m.categoria || "")}</div>
        </div>
        <div>
          <button onclick="window.toggleMeta(${m.id})" style="background:${m.atingida ? "#22c55e" : "rgba(255,255,255,0.1)"};border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;color:white;">${m.atingida ? "✓" : ""}</button>
          <button onclick="window.excluirMeta(${m.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;margin-left:8px;"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
    `
    )
    .join("");
}

window.adicionarMeta = function () {
  const texto = document.getElementById("novaMetaTexto").value.trim();
  if (!texto) return;
  metas.push({
    id: Date.now(),
    texto,
    categoria: document.getElementById("novaMetaCategoria").value,
    atingida: false
  });
  document.getElementById("novaMetaTexto").value = "";
  salvarDados();
  window.mostrarIndicadorSync("🎯 Meta adicionada!");
};

window.toggleMeta = function (id) {
  const m = metas.find((x) => x.id === id);
  if (!m) return;
  m.atingida = !m.atingida;
  salvarDados();
};

window.excluirMeta = function (id) {
  if (!confirm("Excluir meta?")) return;
  metas = metas.filter((m) => m.id !== id);
  salvarDados();
  window.mostrarIndicadorSync("🗑️ Meta excluída!");
};

/* =========================================================
   TAREFAS
========================================================= */
function concluirComDuplicatas(id) {
  const tarefa = tarefas.find((t) => t.id === id);
  if (!tarefa) return;

  tarefa.concluida = true;

  // marca duplicatas simples no mesmo dia/bloco/texto
  tarefas.forEach((t) => {
    if (
      t.id !== id &&
      t.texto?.toLowerCase().trim() === tarefa.texto?.toLowerCase().trim() &&
      t.data === tarefa.data &&
      !t.concluida &&
      t.bloco === tarefa.bloco
    ) {
      t.concluida = true;
    }
  });

  // gera próxima ocorrência
  if (tarefa.recorrencia && tarefa.recorrencia !== "") {
    const novaDataStr = getProximaData(tarefa.recorrencia, tarefa.data);
    if (novaDataStr) {
      const existe = tarefas.some(
        (t) =>
          t.texto === tarefa.texto &&
          t.data === novaDataStr &&
          t.recorrencia === tarefa.recorrencia &&
          t.bloco === tarefa.bloco
      );
      if (!existe) {
        tarefas.push({
          id: uid(),
          texto: tarefa.texto,
          descricao: tarefa.descricao || "",
          bloco: tarefa.bloco,
          data: novaDataStr,
          prioridade: tarefa.prioridade || "p3",
          recorrencia: tarefa.recorrencia,
          concluida: false,
          tempoGasto: 0,
          notificado: false,
          ordem: tarefas.filter((x) => x.bloco === tarefa.bloco && !x.concluida).length
        });
      }
    }
  }

  salvarDados();
  window.mostrarIndicadorSync("✅ Tarefa concluída!");
}

window.toggleTarefa = function (id) {
  const t = tarefas.find((x) => x.id === id);
  if (!t) return;
  if (!t.concluida) concluirComDuplicatas(id);
  else {
    t.concluida = false;
    salvarDados();
    window.mostrarIndicadorSync("🔄 Tarefa reativada!");
  }
};

window.excluirTarefa = function (id) {
  if (!confirm("Excluir tarefa?")) return;
  tarefas = tarefas.filter((t) => t.id !== id);
  salvarDados();
  window.mostrarIndicadorSync("🗑️ Tarefa excluída!");
};

window.editarTarefaCompleta = function (id) {
  window.abrirModalEdicao(id);
};

window.abrirModalDescricao = function (tarefaId) {
  const tarefa = tarefas.find((t) => t.id === tarefaId);
  if (!tarefa) return;
  tarefaDescricaoAtual = tarefa;
  document.getElementById("modalDescricaoTitulo").textContent = tarefa.texto || "Sem título";
  const descricaoTexto = tarefa.descricao && tarefa.descricao.trim() ? tarefa.descricao : "Nenhuma descrição adicionada";
  document.getElementById("modalDescricaoTexto").textContent = descricaoTexto;
  document.getElementById("modalDescricaoOverlay").classList.add("show");
};

window.fecharModalDescricao = function () {
  document.getElementById("modalDescricaoOverlay")?.classList.remove("show");
  tarefaDescricaoAtual = null;
};

window.editarDescricaoModal = function () {
  if (!tarefaDescricaoAtual) return;
  const novaDescricao = prompt("Editar descrição:", tarefaDescricaoAtual.descricao || "");
  if (novaDescricao !== null) {
    tarefaDescricaoAtual.descricao = novaDescricao;
    salvarDados();
    window.fecharModalDescricao();
    window.mostrarIndicadorSync("📝 Descrição atualizada!");
  }
};

window.abrirModalEdicao = function (tarefaId) {
  const tarefa = tarefas.find((t) => t.id === tarefaId);
  if (!tarefa) return;
  tarefaEditandoAtual = tarefa;

  document.getElementById("edicaoTitulo").value = tarefa.texto;
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

  salvarDados();
  window.fecharModalEdicao();
  window.mostrarIndicadorSync("✏️ Tarefa editada!");
};

window.abrirModalReagendar = function (id) {
  tarefaReagendando = tarefas.find((t) => t.id === id);
  if (tarefaReagendando) {
    document.getElementById("novaDataReagendar").value = tarefaReagendando.data || getDataHoje();
    document.getElementById("modalReagendarOverlay").classList.add("show");
  }
};

window.fecharModalReagendar = function () {
  document.getElementById("modalReagendarOverlay")?.classList.remove("show");
  tarefaReagendando = null;
};

window.confirmarReagendamento = function () {
  const novaData = document.getElementById("novaDataReagendar").value;
  if (tarefaReagendando && novaData) {
    tarefaReagendando.data = novaData;
    tarefaReagendando.notificado = false;
    salvarDados();
    window.fecharModalReagendar();
    window.mostrarIndicadorSync("📅 Tarefa reagendada!");
  }
};

window.adicionarCardTarefa = function () {
  const nome = prompt("Nome do novo espaço:");
  if (nome && nome.trim()) {
    cardsTarefas.push({ id: "card_" + Date.now(), nome: nome.trim() });
    salvarDados();
    window.mostrarIndicadorSync(`📁 Espaço "${nome}" criado!`);
  }
};

window.editarCardTarefa = function (id) {
  const card = cardsTarefas.find((c) => c.id === id);
  if (!card) return;
  const novoNome = prompt("Editar nome:", card.nome);
  if (novoNome && novoNome.trim()) {
    const antigoNome = card.nome;
    card.nome = novoNome.trim();
    tarefas.forEach((t) => {
      if (t.bloco === antigoNome) t.bloco = card.nome;
    });
    salvarDados();
    window.mostrarIndicadorSync("✏️ Espaço renomeado!");
  }
};

window.excluirCardTarefa = function (id) {
  if (!confirm("Excluir este espaço?")) return;
  const card = cardsTarefas.find((c) => c.id === id);
  cardsTarefas = cardsTarefas.filter((c) => c.id !== id);

  // remove tarefas do card excluído
  if (card) tarefas = tarefas.filter((t) => t.bloco !== card.nome);

  if (cardsTarefas.length === 0) cardsTarefas = [{ id: "default_" + Date.now(), nome: "Minhas Tarefas" }];
  salvarDados();
  window.mostrarIndicadorSync("🗑️ Espaço excluído!");
};

window.mostrarFormAdicionar = function (cardId) {
  document.getElementById(`form-${cardId}`)?.classList.toggle("show");
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

  tarefas.push({
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
  });

  const campoTexto = document.getElementById(`texto-${cardId}`);
  const campoDesc = document.getElementById(`descricao-${cardId}`);
  if (campoTexto) campoTexto.value = "";
  if (campoDesc) campoDesc.value = "";
  document.getElementById(`form-${cardId}`)?.classList.remove("show");

  salvarDados();
  window.mostrarIndicadorSync("✅ Tarefa adicionada!");
};

window.marcarTodasHoje = function () {
  const hoje = getDataHoje();
  const alvos = tarefas.filter((t) => t.data === hoje && !t.concluida);
  if (alvos.length === 0) {
    alert("🎉 Nenhuma tarefa pendente para hoje!");
    return;
  }
  if (confirm(`Concluir ${alvos.length} tarefa(s) de hoje?`)) {
    alvos.forEach((t) => (t.concluida = true));
    salvarDados();
    alert(`✅ ${alvos.length} tarefa(s) concluída(s)!`);
    window.mostrarIndicadorSync(`🎉 ${alvos.length} tarefas concluídas!`);
  }
};

/* =========================================================
   DRAG & DROP
========================================================= */
window.iniciarDragTarefa = function (id, cardNome, event) {
  tarefaArrastandoId = id;
  tarefaArrastandoOrigem = cardNome;
  event.dataTransfer.setData("text/plain", id);
  const el = event.target.closest(".tarefa-item");
  if (el) el.classList.add("dragging");
};

window.permitirDropTarefa = function (event) {
  event.preventDefault();
};

window.permitirDropCard = function (event) {
  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
};

window.removerDragOver = function (event) {
  event.currentTarget.classList.remove("drag-over");
};

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
        const tarefaGlobal = tarefas.find((gt) => gt.id === t.id);
        if (tarefaGlobal) tarefaGlobal.ordem = idx;
      });
      salvarDados();
    }
  } else if (tarefaArrastandoOrigem !== cardNomeDestino) {
    const tarefa = tarefas.find((t) => t.id === tarefaArrastandoId);
    if (tarefa) {
      tarefa.bloco = cardNomeDestino;
      salvarDados();
      window.mostrarIndicadorSync("📦 Tarefa movida");
    }
  }

  tarefaArrastandoId = null;
  tarefaArrastandoOrigem = null;
  document.querySelectorAll(".tarefa-item").forEach((el) => el.classList.remove("dragging"));
};

/* =========================================================
   RENDER TAREFAS
========================================================= */
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
        const recorrenciaLabel =
          {
            diaria: "Diária",
            dias_uteis: "Dias úteis",
            semanal: "Semanal",
            mensal: "Mensal"
          }[t.recorrencia] || t.recorrencia || "";

        return `<div class="tarefa-item ${t.prioridade === "p1" ? "p1" : t.prioridade === "p2" ? "p2" : ""}" draggable="true"
          ondragstart="window.iniciarDragTarefa(${JSON.stringify(t.id)}, '${escapeHtml(card.nome).replace(/'/g, "\\'")}', event)"
          ondragend="document.querySelectorAll('.tarefa-item').forEach(el=>el.classList.remove('dragging'))"
          ondragover="window.permitirDropTarefa(event)"
          ondrop="window.soltarTarefa(event, '${escapeHtml(card.nome).replace(/'/g, "\\'")}', ${JSON.stringify(t.id)})">

          <div class="task-left">
            <div class="drag-handle"><i class="fas fa-grip-vertical"></i></div>
            <input type="checkbox" class="task-checkbox" ${t.concluida ? "checked" : ""} onchange="window.toggleTarefa(${JSON.stringify(t.id)})">
            <div class="task-info">
              <div class="task-title">${escapeHtml(t.texto)}</div>
              <div class="task-meta">
                <span class="meta-date ${atrasada ? "badge atrasada" : ""}" onclick="window.abrirModalReagendar(${JSON.stringify(t.id)}); event.stopPropagation()">
                  <i class="fas fa-calendar"></i> ${t.data} ${atrasada ? "⚠️" : ""}
                </span>
                ${t.recorrencia ? `<span class="meta-tag"><i class="fas fa-redo-alt"></i> ${recorrenciaLabel}</span>` : ""}
                ${t.tempoGasto ? `<span class="meta-tag"><i class="fas fa-clock"></i> ${Math.floor(t.tempoGasto / 60)}min</span>` : ""}
              </div>
            </div>
          </div>

          <div class="task-actions-2x2">
            <button class="task-action-btn" onclick="window.editarTarefaCompleta(${JSON.stringify(t.id)}); event.stopPropagation()" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="task-action-btn" onclick="window.abrirModalDescricao(${JSON.stringify(t.id)}); event.stopPropagation()" title="Descrição"><i class="fas fa-pen-alt"></i></button>
            <button class="task-action-btn" onclick="window.abrirModoFocoComTarefa(${JSON.stringify(t.id)}); event.stopPropagation()" title="Modo Foco"><i class="fas fa-clock"></i></button>
            <button class="task-action-btn danger" onclick="window.excluirTarefa(${JSON.stringify(t.id)}); event.stopPropagation()" title="Excluir"><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>`;
      })
      .join("");

    const div = document.createElement("div");
    div.className = "card-espaco";
    div.setAttribute("ondragover", "window.permitirDropCard(event)");
    div.setAttribute("ondragleave", "window.removerDragOver(event)");
    div.setAttribute("ondrop", `window.soltarTarefa(event, '${escapeHtml(card.nome).replace(/'/g, "\\'")}', null)`);

    div.innerHTML = `
      <div class="card-header">
        <span><i class="fas fa-list-ul"></i> ${escapeHtml(card.nome)}</span>
        <div>
          <span style="color:white;">${ativas} ativas</span>
          <button onclick="window.editarCardTarefa('${card.id}')"><i class="fas fa-edit"></i></button>
          <button onclick="window.excluirCardTarefa('${card.id}')"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
      <div class="card-content">
        ${
          lista.length === 0
            ? `<div class="estado-vazio" style="text-align:center;padding:40px;"><i class="fas fa-check-circle" style="font-size:32px;opacity:0.5;"></i><p style="color:white;">Tudo certo</p><small style="color:rgba(255,255,255,0.5);">Adicione uma tarefa</small></div>`
            : tarefasHtml
        }
      </div>
      <button class="btn-nova-tarefa" onclick="window.mostrarFormAdicionar('${cardId}')"><i class="fas fa-plus-circle"></i> Nova Tarefa</button>
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
          <option value="diaria">🔄 Diária</option>
          <option value="dias_uteis">📅 Dias úteis</option>
          <option value="semanal">📆 Semanal</option>
          <option value="mensal">📅 Mensal</option>
        </select>
        <div class="inline-form-buttons">
          <button class="btn-confirm" onclick="window.adicionarTarefaInline('${cardId}')">Adicionar</button>
          <button class="btn-cancel" onclick="document.getElementById('form-${cardId}').classList.remove('show')">Cancelar</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });

  const addCard = document.createElement("div");
  addCard.className = "card-novo-espaco";
  addCard.onclick = () => window.adicionarCardTarefa();
  addCard.innerHTML = `<div><i class="fas fa-plus-circle"></i></div><p>Novo Espaço</p>`;
  container.appendChild(addCard);
}

/* =========================================================
   CALENDÁRIO / VIEWS
========================================================= */
window.toggleView = function (view) {
  const cardsView = document.getElementById("cardsView");
  const calendarioView = document.getElementById("calendarioView");
  if (!cardsView || !calendarioView) return;

  cardsView.style.display = view === "cards" ? "block" : "none";
  calendarioView.style.display = view === "calendario" ? "block" : "none";

  document.querySelectorAll(".view-btn").forEach((btn, i) => {
    if ((view === "cards" && i === 0) || (view === "calendario" && i === 1)) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  if (view === "calendario") renderizarCalendario();
};

window.mudarMes = function (d) {
  dataCalendario.setMonth(dataCalendario.getMonth() + d);
  renderizarCalendario();
};

window.irParaHoje = function () {
  dataCalendario = new Date();
  renderizarCalendario();
  const tarefasContainer = document.getElementById("blocosTarefas");
  if (tarefasContainer) tarefasContainer.scrollIntoView({ behavior: "smooth", block: "start" });
};

function renderizarCalendario() {
  const ano = dataCalendario.getFullYear();
  const mes = dataCalendario.getMonth();
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const calendarioMes = document.getElementById("calendarioMes");
  if (calendarioMes) calendarioMes.textContent = `${meses[mes]} ${ano}`;

  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  let html = '<div class="calendario-grade">';
  for (let i = 0; i < 7; i++) {
    html += `<div style="text-align:center;padding:8px;color:white;font-weight:600;">${diasSemana[i]}</div>`;
  }

  let dia = 1;
  const hoje = getDataHoje();

  for (let i = 0; i < 42; i++) {
    if (i < primeiroDia || dia > diasNoMes) {
      html += `<div class="calendario-dia" style="opacity:0.3;"></div>`;
    } else {
      const dataStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      const tarefasDia = tarefas.filter((t) => t.data === dataStr && !t.concluida);
      const isHoje = dataStr === hoje;

      html += `
        <div class="calendario-dia" style="${isHoje ? "border:2px solid #667eea; background:rgba(102,126,234,0.15);" : ""}">
          <div class="calendario-dia-header"><span style="color:white;font-weight:600;">${dia}</span></div>
          <div class="calendario-tarefas">
            ${tarefasDia
              .slice(0, 3)
              .map(
                (t) =>
                  `<div style="background:rgba(102,126,234,0.2);border-radius:6px;padding:4px;margin-bottom:4px;cursor:pointer;font-size:11px;color:white;" onclick="window.abrirModalReagendar(${JSON.stringify(t.id)})">${escapeHtml(t.texto.substring(0, 20))}</div>`
              )
              .join("")}
          </div>
          <button class="calendario-add-btn" onclick="alert('Use o formulário no card')" style="width:100%;margin-top:4px;padding:2px;background:rgba(102,126,234,0.2);border:none;border-radius:4px;color:white;cursor:pointer;">+</button>
        </div>
      `;
      dia++;
    }
  }

  html += "</div>";
  const grade = document.getElementById("calendarioGrade");
  if (grade) grade.innerHTML = html;
}

/* =========================================================
   DASHBOARD / RODAPÉ
========================================================= */
function atualizarRodape() {
  const hoje = getDataHoje();
  const tarefasHoje = tarefas.filter((t) => t.data === hoje);
  const concluidasHoje = tarefasHoje.filter((t) => t.concluida).length;
  const totalHoje = tarefasHoje.length;
  const taxaHoje = totalHoje > 0 ? Math.round((concluidasHoje / totalHoje) * 100) : 0;
  const pendentes = tarefas.filter((t) => t.data && t.data <= hoje && !t.concluida).length;

  const horasFocoHoje = Math.floor(tempoFocadoHoje / 3600);
  const minutosFocoHoje = Math.floor((tempoFocadoHoje % 3600) / 60);

  const fc = document.getElementById("footerConcluidas");
  const ft = document.getElementById("footerTaxa");
  const fp = document.getElementById("footerPendentes");
  const ff = document.getElementById("footerTempo");
  const fr = document.getElementById("footerReagendadasCount");

  if (fc) fc.textContent = String(concluidasHoje);
  if (ft) ft.textContent = `${taxaHoje}%`;
  if (fp) fp.textContent = String(pendentes);
  if (ff) ff.textContent = `${horasFocoHoje}h ${minutosFocoHoje}m`;
  if (fr) fr.textContent = String(tarefasReagendadasHoje);
}

function atualizarDashboard() {
  const hoje = getDataHoje();
  const pendentes = tarefas.filter((t) => t.data && t.data <= hoje && !t.concluida).length;
  const alertaDiv = document.getElementById("dashboardAlerta");
  if (!alertaDiv) return;

  if (pendentes > 0) {
    alertaDiv.style.display = "flex";
    const texto = document.getElementById("alertaTexto");
    const subtexto = document.getElementById("alertaSubtexto");
    if (texto) texto.innerHTML = pendentes === 1 ? "Você tem 1 tarefa pendente" : `Você tem ${pendentes} tarefas pendentes`;
    if (subtexto) subtexto.innerHTML = pendentes === 1 ? "Não deixe para depois! 🎯" : "Organize seu dia e conclua suas metas! 💪";
  } else {
    alertaDiv.style.display = "none";
  }
}

/* =========================================================
   REAGENDAR PENDENTES / BOTÕES TOPO
========================================================= */
function reagendarTarefasPendentes() {
  const hoje = getDataHoje();
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const amanhaStr = amanha.toISOString().split("T")[0];

  const pendentes = tarefas.filter((t) => t.data === hoje && !t.concluida);
  if (pendentes.length === 0) {
    alert("🎉 Nenhuma tarefa pendente!");
    return;
  }

  if (confirm(`📅 Reagendar ${pendentes.length} tarefa(s) para amanhã?`)) {
    pendentes.forEach((t) => {
      t.data = amanhaStr;
      t.notificado = false;
    });
    tarefasReagendadasHoje += pendentes.length;
    localStorage.setItem("tarefasReagendadasHoje", String(tarefasReagendadasHoje));
    salvarDados();
    window.mostrarIndicadorSync(`📅 ${pendentes.length} tarefa(s) reagendada(s)`);
  }
}

/* =========================================================
   POMODORO / FOCO
========================================================= */
function atualizarTimerDisplay() {
  const min = Math.floor(tempoRestante / 60);
  const seg = tempoRestante % 60;
  const timer = document.getElementById("timerFocoGrande");
  if (timer) timer.textContent = `${min.toString().padStart(2, "0")}:${seg.toString().padStart(2, "0")}`;

  const bar = document.getElementById("progressoFocoBar");
  if (!bar) return;

  if (!emPausaEntrePomodoros) {
    const progresso = ((25 * 60 - tempoRestante) / (25 * 60)) * 100;
    bar.style.width = `${Math.min(100, Math.max(0, progresso))}%`;
  } else {
    const progresso = ((5 * 60 - tempoRestante) / (5 * 60)) * 100;
    bar.style.width = `${Math.min(100, Math.max(0, progresso))}%`;
  }
}

function tocarSino() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.25;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, now + 1.5);
    osc.stop(now + 1.5);
    setTimeout(() => ctx.close(), 2000);
  } catch (e) {
    console.log(e);
  }
}

function finalizarPomodoro() {
  if (pomodoroInterval) clearInterval(pomodoroInterval);

  const tempoGasto = Math.floor((Date.now() - tempoFocoInicio) / 1000);
  if (tempoGasto > 0) {
    tempoTotalFocado += tempoGasto;
    tempoFocadoHoje += tempoGasto;
    if (tarefaFocoAtual) tarefaFocoAtual.tempoGasto = (tarefaFocoAtual.tempoGasto || 0) + tempoGasto;
    salvarDados();
  }

  window.stopLofi();
  tocarSino();

  const opcao = confirm("🎉 Pomodoro concluído!\n\n• OK para PAUSA de 5 min\n• Cancelar para +10 min de foco");
  if (opcao) {
    iniciarDescanso();
  } else {
    tempoRestante = 10 * 60;
    emPausaEntrePomodoros = false;
    pomodoroAtivo = true;
    pomodoroPausado = false;
    tempoFocoInicio = Date.now();

    atualizarTimerDisplay();
    document.getElementById("cronometroInfo").innerHTML = "🍅 +10 minutos de foco!";
    document.getElementById("btnIniciarFoco").style.display = "none";
    document.getElementById("btnPausarFoco").style.display = "inline-block";
    document.getElementById("btnPausarFoco").innerHTML = '<i class="fas fa-pause"></i> Pausar';

    pomodoroInterval = setInterval(() => {
      if (!pomodoroPausado && pomodoroAtivo && tempoRestante > 0) {
        tempoRestante--;
        atualizarTimerDisplay();
        if (tempoRestante <= 0) {
          clearInterval(pomodoroInterval);
          finalizarPomodoro();
        }
      }
    }, 1000);

    setTimeout(() => window.playLofi(), 100);
  }
}

function iniciarDescanso() {
  if (pomodoroInterval) clearInterval(pomodoroInterval);

  tempoRestante = 5 * 60;
  emPausaEntrePomodoros = true;
  pomodoroAtivo = true;
  pomodoroPausado = false;
  tempoFocoInicio = Date.now();

  atualizarTimerDisplay();
  document.getElementById("cronometroInfo").innerHTML = "☕ Pausa de 5 minutos";
  document.getElementById("btnIniciarFoco").style.display = "none";
  document.getElementById("btnPausarFoco").style.display = "inline-block";

  pomodoroInterval = setInterval(() => {
    if (!pomodoroPausado && pomodoroAtivo && tempoRestante > 0) {
      tempoRestante--;
      atualizarTimerDisplay();
      if (tempoRestante <= 0) {
        clearInterval(pomodoroInterval);
        tocarSino();
        alert("⏰ Pausa concluída!");
        document.getElementById("cronometroInfo").innerHTML = "🍅 Pomodoro 25 minutos";
        tempoRestante = 25 * 60;
        emPausaEntrePomodoros = false;
        atualizarTimerDisplay();
        document.getElementById("btnIniciarFoco").style.display = "inline-block";
        document.getElementById("btnPausarFoco").style.display = "none";
        pomodoroAtivo = false;
      }
    }
  }, 1000);
}

window.prorrogarTempoFoco = function () {
  if (!pomodoroAtivo || emPausaEntrePomodoros) {
    alert("⏰ Só pode prorrogar durante o foco ativo!");
    return;
  }
  tempoRestante += 10 * 60;
  atualizarTimerDisplay();
  const info = document.getElementById("cronometroInfo");
  if (info) {
    info.innerHTML = "⏰ +10 minutos!";
    setTimeout(() => (info.innerHTML = "🍅 Focando..."), 2000);
  }
};

window.iniciarPomodoro = function () {
  if (pomodoroAtivo) return;

  if (emPausaEntrePomodoros) {
    if (confirm("Interromper pausa e voltar ao foco?")) {
      if (pomodoroInterval) clearInterval(pomodoroInterval);
      tempoRestante = 25 * 60;
      emPausaEntrePomodoros = false;
      pomodoroAtivo = true;
      pomodoroPausado = false;
      tempoFocoInicio = Date.now();

      atualizarTimerDisplay();
      document.getElementById("cronometroInfo").innerHTML = "🍅 Focando...";
      document.getElementById("btnIniciarFoco").style.display = "none";
      document.getElementById("btnPausarFoco").style.display = "inline-block";

      pomodoroInterval = setInterval(() => {
        if (!pomodoroPausado && pomodoroAtivo && tempoRestante > 0) {
          tempoRestante--;
          atualizarTimerDisplay();
          if (tempoRestante <= 0) {
            clearInterval(pomodoroInterval);
            finalizarPomodoro();
          }
        }
      }, 1000);

      setTimeout(() => window.playLofi(), 100);
    }
    return;
  }

  emPausaEntrePomodoros = false;
  pomodoroAtivo = true;
  pomodoroPausado = false;
  tempoFocoInicio = Date.now();
  if (pomodoroInterval) clearInterval(pomodoroInterval);

  pomodoroInterval = setInterval(() => {
    if (!pomodoroPausado && pomodoroAtivo && tempoRestante > 0) {
      tempoRestante--;
      atualizarTimerDisplay();
      if (tempoRestante <= 0) {
        clearInterval(pomodoroInterval);
        finalizarPomodoro();
      }
    }
  }, 1000);

  document.getElementById("btnIniciarFoco").style.display = "none";
  document.getElementById("btnPausarFoco").style.display = "inline-block";
  document.getElementById("cronometroInfo").innerHTML = "🍅 Focando...";
  setTimeout(() => window.playLofi(), 100);
};

window.pausarPomodoro = function () {
  if (!pomodoroAtivo) return;

  if (!pomodoroPausado && !emPausaEntrePomodoros) {
    const tempoDecorrido = Math.floor((Date.now() - tempoFocoInicio) / 1000);
    if (tempoDecorrido > 0) {
      tempoTotalFocado += tempoDecorrido;
      tempoFocadoHoje += tempoDecorrido;
      if (tarefaFocoAtual) tarefaFocoAtual.tempoGasto = (tarefaFocoAtual.tempoGasto || 0) + tempoDecorrido;
      salvarDados();
    }
  }

  tempoFocoInicio = Date.now();
  pomodoroPausado = !pomodoroPausado;

  const btn = document.getElementById("btnPausarFoco");
  if (btn) btn.innerHTML = pomodoroPausado ? '<i class="fas fa-play"></i> Retomar' : '<i class="fas fa-pause"></i> Pausar';

  const info = document.getElementById("cronometroInfo");
  if (info) info.innerHTML = pomodoroPausado ? "⏸ Pausado" : emPausaEntrePomodoros ? "☕ Pausa" : "🍅 Focando...";

  if (pomodoroPausado) window.stopLofi();
  else window.playLofi();
};

window.concluirTarefaFoco = function () {
  if (!tarefaFocoAtual) return;

  if (pomodoroAtivo && !pomodoroPausado && !emPausaEntrePomodoros) {
    const tempoDecorrido = Math.floor((Date.now() - tempoFocoInicio) / 1000);
    if (tempoDecorrido > 0) {
      tempoTotalFocado += tempoDecorrido;
      tempoFocadoHoje += tempoDecorrido;
      tarefaFocoAtual.tempoGasto = (tarefaFocoAtual.tempoGasto || 0) + tempoDecorrido;
      salvarDados();
    }
  }

  if (confirm(`Concluir "${tarefaFocoAtual.texto}"?`)) {
    concluirComDuplicatas(tarefaFocoAtual.id);
    salvarDados();
    window.fecharModoFoco();
    window.mostrarIndicadorSync("✅ Tarefa concluída via Foco!");
  }
};

window.fecharModoFoco = function () {
  if (pomodoroAtivo && !pomodoroPausado && !emPausaEntrePomodoros && tarefaFocoAtual) {
    const tempoDecorrido = Math.floor((Date.now() - tempoFocoInicio) / 1000);
    if (tempoDecorrido > 0) {
      tempoTotalFocado += tempoDecorrido;
      tempoFocadoHoje += tempoDecorrido;
      tarefaFocoAtual.tempoGasto = (tarefaFocoAtual.tempoGasto || 0) + tempoDecorrido;
      salvarDados();
    }
  }

  if (pomodoroInterval) clearInterval(pomodoroInterval);
  pomodoroAtivo = false;
  window.stopLofi();
  document.getElementById("modalFocoOverlay")?.classList.remove("show");
  tarefaFocoAtual = null;
  emPausaEntrePomodoros = false;
  tempoRestante = 25 * 60;
  atualizarTimerDisplay();
};

window.abrirModoFocoComTarefa = function (id) {
  const tarefa = tarefas.find((t) => t.id === id);
  if (!tarefa) return;

  tarefaFocoAtual = tarefa;
  document.getElementById("tarefaFocoTexto").textContent = tarefa.texto;
  tempoRestante = 25 * 60;
  emPausaEntrePomodoros = false;
  pomodoroAtivo = false;
  pomodoroPausado = false;
  if (pomodoroInterval) clearInterval(pomodoroInterval);

  atualizarTimerDisplay();
  document.getElementById("btnIniciarFoco").style.display = "inline-block";
  document.getElementById("btnPausarFoco").style.display = "none";
  document.getElementById("cronometroInfo").innerHTML = "🍅 Pomodoro 25 minutos";
  document.getElementById("modalFocoOverlay").classList.add("show");

  if (lofiAudioElement) window.stopLofi();
};

/* =========================================================
   MÚSICA LOFI
========================================================= */
function initLofiAudio() {
  if (!lofiAudioElement) {
    lofiAudioElement = document.getElementById("lofiAudio");
    if (lofiAudioElement) {
      lofiAudioElement.volume = 0.3;
      lofiAudioElement.loop = true;
    }
  }
}

window.playLofi = function () {
  initLofiAudio();
  if (lofiAudioElement) {
    lofiAudioElement
      .play()
      .then(() => {
        lofiActive = true;
      })
      .catch(() => {});
  }
};

window.stopLofi = function () {
  if (lofiAudioElement) {
    lofiAudioElement.pause();
    lofiAudioElement.currentTime = 0;
  }
  lofiActive = false;
};

window.toggleMusicaFoco = function () {
  initLofiAudio();
  if (lofiActive) window.stopLofi();
  else window.playLofi();
};

window.ajustarVolumeFoco = function (val) {
  if (lofiAudioElement) lofiAudioElement.volume = Number(val) / 100;
};

/* =========================================================
   EVENTOS / INICIALIZAÇÃO
========================================================= */
function updateConnectionStatus() {
  const statusDiv = document.getElementById("statusConnection");
  if (!statusDiv) return;
  if (navigator.onLine) {
    statusDiv.innerHTML = '<i class="fas fa-wifi"></i> Online';
    statusDiv.classList.remove("status-offline");
  } else {
    statusDiv.innerHTML = '<i class="fas fa-plug"></i> Offline';
    statusDiv.classList.add("status-offline");
  }
}

function bindUI() {
  const themeToggle = document.getElementById("themeToggle");
  const savedTheme = localStorage.getItem("themePreference");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-theme");
    if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
  }

  themeToggle?.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");
    const isDark = document.body.classList.contains("dark-theme");
    localStorage.setItem("themePreference", isDark ? "dark" : "light");
    themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => window.fazerLogout());
  document.getElementById("backupBtn")?.addEventListener("click", () => window.exportarBackupJSON());
  document.getElementById("importBackupBtn")?.addEventListener("click", () => window.importarBackupJSON());
  document.getElementById("indexedbBtn")?.addEventListener("click", () => window.abrirModalBackup());
  document.getElementById("rescheduleBtn")?.addEventListener("click", () => reagendarTarefasPendentes());
  document.getElementById("syncNowBtn")?.addEventListener("click", () => sincronizarTarefasRecorrentes());

  document.getElementById("notifyBtn")?.addEventListener("click", () => {
    if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
  });

  const avatar = document.getElementById("userAvatar");
  const tooltip = document.getElementById("userTooltip");
  if (avatar && tooltip) {
    avatar.addEventListener("mouseenter", () => (tooltip.style.display = "block"));
    avatar.addEventListener("mouseleave", () => (tooltip.style.display = "none"));
    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      tooltip.style.display = tooltip.style.display === "block" ? "none" : "block";
      setTimeout(() => (tooltip.style.display = "none"), 3000);
    });
    document.addEventListener("click", (e) => {
      if (!avatar.contains(e.target)) tooltip.style.display = "none";
    });
  }

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
  updateConnectionStatus();
}

async function initApp() {
  bindUI();
  atualizarDataHeader();
  initLofiAudio();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      window.currentUser = user;
      usuarioAtual = user.email || user.uid;

      const loginOverlay = document.getElementById("loginOverlay");
      const mainApp = document.getElementById("mainApp");
      const userEmailTooltip = document.getElementById("userEmailTooltip");

      if (loginOverlay) loginOverlay.style.display = "none";
      if (mainApp) mainApp.style.display = "block";
      if (userEmailTooltip) userEmailTooltip.textContent = user.email || "";

      await carregarDadosFirebase();
      await initIndexedDB();

      if (window.recarregarSistema) window.recarregarSistema();

      // sync periódico
      setInterval(() => salvarTudoFirebase(), 300000);   // 5 min
      setInterval(() => salvarBackupIndexedDB(), 600000); // 10 min
    } else {
      currentUser = null;
      window.currentUser = null;
      usuarioAtual = null;

      const loginOverlay = document.getElementById("loginOverlay");
      const mainApp = document.getElementById("mainApp");

      if (loginOverlay) loginOverlay.style.display = "flex";
      if (mainApp) mainApp.style.display = "none";
    }
  });

  // primeira render local (antes do auth resolver)
  if (window.recarregarSistema) window.recarregarSistema();

  setInterval(() => verificarResetDiario(), 60000);
}

initApp();
