import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

// ========== FIREBASE ==========
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

// ========== VARIÁVEIS GLOBAIS ==========
let currentUser = null;
window.currentUser = null;
let dbBackup = null;
let usuarioAtual = null;

let tarefas = JSON.parse(localStorage.getItem('tarefas') || '[]');
let metas = JSON.parse(localStorage.getItem('metas') || '[]');
let cardsTarefas = JSON.parse(localStorage.getItem('cardsTarefas') || '[]');
if(cardsTarefas.length === 0) cardsTarefas = [{ id: "default_" + Date.now(), nome: "Minhas Tarefas" }];

let tempoTotalFocado = parseInt(localStorage.getItem('tempoTotalFocado') || '0');
let tempoFocadoHoje = parseInt(localStorage.getItem('tempoFocadoHoje') || '0');
let ultimaDataFoco = localStorage.getItem('ultimaDataFoco') || '';
let ultimaDataReset = localStorage.getItem('ultimaDataReset') || '';
let tarefasReagendadasHoje = parseInt(localStorage.getItem('tarefasReagendadasHoje') || '0');
let ultimaDataReagendamento = localStorage.getItem('ultimaDataReagendamento') || '';
let tarefaReagendando = null;
let tarefaArrastandoId = null;
let tarefaArrastandoOrigem = null;
let dataCalendario = new Date();
let tarefaDescricaoAtual = null;
let tarefaEditandoAtual = null;
let pomodoroInterval = null, tempoRestante = 25*60, pomodoroAtivo = false, pomodoroPausado = false, tarefaFocoAtual = null, emPausaEntrePomodoros = false, tempoFocoInicio = 0;
let lofiAudioElement = null, lofiActive = false;

// ========== UTILS ==========
function escapeHtml(t) {
  if(!t) return '';
  return t.replace(/[&<>]/g, function(m){
    if(m==='&') return '&amp;';
    if(m==='<') return '&lt;';
    if(m==='>') return '&gt;';
    return m;
  });
}

function getDataHoje() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-${String(agora.getDate()).padStart(2,'0')}`;
}

function getProximoDiaUtil(dataStr) {
  const data = new Date(dataStr);
  data.setDate(data.getDate() + 1);
  while (data.getDay() === 0 || data.getDay() === 6) {
    data.setDate(data.getDate() + 1);
  }
  return data.toISOString().split('T')[0];
}

function getProximaData(recorrencia, dataAtualStr) {
  const data = new Date(dataAtualStr);
  switch(recorrencia) {
    case 'diaria':
      data.setDate(data.getDate() + 1);
      break;
    case 'dias_uteis':
      return getProximoDiaUtil(dataAtualStr);
    case 'semanal':
      data.setDate(data.getDate() + 7);
      break;
    case 'mensal':
      data.setMonth(data.getMonth() + 1);
      break;
    default:
      return null;
  }
  return data.toISOString().split('T')[0];
}

// ========== LOGIN ==========
window.togglePasswordVisibility = (id, btn) => {
  const inp = document.getElementById(id);
  if(inp.type === 'password'){ inp.type='text'; btn.innerHTML='<i class="far fa-eye-slash"></i>'; }
  else { inp.type='password'; btn.innerHTML='<i class="far fa-eye"></i>'; }
};

window.mostrarCadastro = () => {
  document.getElementById('loginForm').style.display='none';
  document.getElementById('registerForm').style.display='block';
};

window.mostrarLogin = () => {
  document.getElementById('loginForm').style.display='block';
  document.getElementById('registerForm').style.display='none';
};

window.fazerLogin = async () => {
  try {
    await signInWithEmailAndPassword(auth, document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
  } catch(e) {
    document.getElementById('loginErrorMessage').textContent = 'Email ou senha inválidos!';
  }
};

window.fazerCadastro = async () => {
  const pwd = document.getElementById('registerPassword').value;
  if(pwd!== document.getElementById('registerConfirm').value) {
    document.getElementById('registerErrorMessage').textContent = 'Senhas não coincidem';
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, document.getElementById('registerEmail').value, pwd);
    mostrarIndicadorSync('✅ Conta criada!');
  } catch(e) {
    document.getElementById('registerErrorMessage').textContent = e.message;
  }
};

window.loginComGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    mostrarIndicadorSync(`✅ Bem-vindo, ${result.user.displayName || result.user.email}!`);
  } catch(error) {
    mostrarIndicadorSync('❌ Erro no login com Google', 'error');
  }
};

window.fazerLogout = () => signOut(auth);

// ========== SINCRONIZAÇÃO ==========
window.mostrarIndicadorSync = function(mensagem, tipo = 'success') {
  let indicator = document.getElementById('syncIndicator');
  if(!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'syncIndicator';
    indicator.className = 'sync-indicator';
    document.body.appendChild(indicator);
  }
  const icon = tipo === 'success'? '✅' : (tipo === 'error'? '❌' : '🔄');
  indicator.innerHTML = `${icon} ${mensagem}`;
  indicator.classList.add('show');
  setTimeout(() => indicator.classList.remove('show'), 2000);
};

async function salvarTudoFirebase() {
  if(!currentUser) return;
  try {
    const dados = {
      tarefas: JSON.parse(localStorage.getItem('tarefas') || '[]'),
      metas: JSON.parse(localStorage.getItem('metas') || '[]'),
      cardsTarefas: JSON.parse(localStorage.getItem('cardsTarefas') || '[]'),
      tempoTotalFocado: parseInt(localStorage.getItem('tempoTotalFocado') || '0'),
      tempoFocadoHoje: parseInt(localStorage.getItem('tempoFocadoHoje') || '0'),
      tarefasReagendadasHoje: parseInt(localStorage.getItem('tarefasReagendadasHoje') || '0'),
      ultimaAtualizacao: new Date().toISOString()
    };
    await setDoc(doc(db, "usuarios", currentUser.uid), dados);
  } catch(err) { console.error(err); }
}

async function carregarDadosFirebase() {
  if(!currentUser) return;
  try {
    const docRef = doc(db, "usuarios", currentUser.uid);
    const docSnap = await getDoc(docRef);
    if(docSnap.exists()){
      const d = docSnap.data();
      if(d.tarefas) localStorage.setItem('tarefas', JSON.stringify(d.tarefas));
      if(d.metas) localStorage.setItem('metas', JSON.stringify(d.metas));
      if(d.cardsTarefas && d.cardsTarefas.length > 0) localStorage.setItem('cardsTarefas', JSON.stringify(d.cardsTarefas));
      if(d.tempoTotalFocado) localStorage.setItem('tempoTotalFocado', d.tempoTotalFocado);
    }
  } catch(err) { console.error(err); }
}

// ========== INDEXEDDB BACKUP ==========
function initIndexedDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('FLUXO_Backup_V3', 2);
    request.onerror = () => console.log('Erro IndexedDB');
    request.onsuccess = (event) => {
      dbBackup = event.target.result;
      resolve();
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('backups')) {
        const store = db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
        store.createIndex('usuario', 'usuario');
        store.createIndex('timestamp', 'timestamp');
      }
    };
  });
}

async function salvarBackupIndexedDB() {
  if (!usuarioAtual ||!dbBackup) return;
  const backup = {
    usuario: usuarioAtual,
    timestamp: Date.now(),
    data: new Date().toISOString(),
    tarefas: localStorage.getItem('tarefas'),
    metas: localStorage.getItem('metas'),
    cardsTarefas: localStorage.getItem('cardsTarefas'),
    tempoTotalFocado: localStorage.getItem('tempoTotalFocado'),
    tempoFocadoHoje: localStorage.getItem('tempoFocadoHoje'),
    tarefasReagendadasHoje: localStorage.getItem('tarefasReagendadasHoje')
  };
  const tx = dbBackup.transaction(['backups'], 'readwrite');
  tx.objectStore('backups').add(backup);
}

async function listarBackups() {
  if (!usuarioAtual ||!dbBackup) return [];
  return new Promise((resolve) => {
    const tx = dbBackup.transaction(['backups'], 'readonly');
    const index = tx.objectStore('backups').index('usuario');
    const range = IDBKeyRange.only(usuarioAtual);
    const request = index.getAll(range);
    request.onsuccess = () => resolve(request.result.reverse());
  });
}

async function restaurarBackupIndexedDB(backupId) {
  if (!dbBackup) return;
  const tx = dbBackup.transaction(['backups'], 'readonly');
  const request = tx.objectStore('backups').get(backupId);
  request.onsuccess = async () => {
    const backup = request.result;
    if (backup && backup.usuario === usuarioAtual) {
      if (backup.tarefas) localStorage.setItem('tarefas', backup.tarefas);
      if (backup.metas) localStorage.setItem('metas', backup.metas);
      if (backup.cardsTarefas) localStorage.setItem('cardsTarefas', backup.cardsTarefas);
      if (backup.tempoTotalFocado) localStorage.setItem('tempoTotalFocado', backup.tempoTotalFocado);
      mostrarIndicadorSync('✅ Backup restaurado!');
      setTimeout(() => location.reload(), 1000);
    }
  };
}

async function excluirBackupIndexedDB(backupId) {
  if (!dbBackup) return;
  const tx = dbBackup.transaction(['backups'], 'readwrite');
  tx.objectStore('backups').delete(backupId);
  mostrarIndicadorSync('🗑 Backup removido');
  abrirModalBackup();
}

window.fazerBackupManual = async () => {
  await salvarBackupIndexedDB();
  abrirModalBackup();
};

window.abrirModalBackup = async () => {
  const backups = await listarBackups();
  const container = document.getElementById('backupList');
  if (backups.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.5);padding:20px;">Nenhum backup encontrado</div>';
  } else {
    container.innerHTML = backups.map(b => `
      <div class="backup-item">
        <div class="backup-info">
          <div class="backup-data"><i class="far fa-calendar-alt"></i> ${new Date(b.timestamp).toLocaleString('pt-BR')}</div>
          <div class="backup-tarefas">📋 ${b.tarefas? JSON.parse(b.tarefas || '[]').length : 0} tarefas</div>
        </div>
        <div class="backup-actions">
          <button onclick="restaurarBackupIndexedDB(${b.id})" title="Restaurar"><i class="fas fa-undo-alt"></i></button>
          <button onclick="excluirBackupIndexedDB(${b.id})" title="Excluir"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
    `).join('');
  }
  document.getElementById('modalBackupOverlay').classList.add('show');
};

window.fecharModalBackup = () => document.getElementById('modalBackupOverlay').classList.remove('show');
window.restaurarBackupIndexedDB = restaurarBackupIndexedDB;
window.excluirBackupIndexedDB = excluirBackupIndexedDB;

window.importarBackupJSON = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const backup = JSON.parse(e.target.result);
        if (backup.tarefas) localStorage.setItem('tarefas', backup.tarefas);
        if (backup.metas) localStorage.setItem('metas', backup.metas);
        if (backup.cardsTarefas) localStorage.setItem('cardsTarefas', backup.cardsTarefas);
        if (backup.tempoTotalFocado) localStorage.setItem('tempoTotalFocado', backup.tempoTotalFocado);
        mostrarIndicadorSync('✅ Backup importado com sucesso!');
        setTimeout(() => { if(window.recarregarSistema) window.recarregarSistema(); else location.reload(); }, 1000);
      } catch (error) {
        mostrarIndicadorSync('❌ Erro ao importar backup', 'error');
        alert('Arquivo de backup inválido.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

// ========== LÓGICA PRINCIPAL ==========
function salvarDados() {
  localStorage.setItem('tarefas', JSON.stringify(tarefas));
  localStorage.setItem('metas', JSON.stringify(metas));
  localStorage.setItem('cardsTarefas', JSON.stringify(cardsTarefas));
  localStorage.setItem('tempoTotalFocado', tempoTotalFocado);
  localStorage.setItem('tempoFocadoHoje', tempoFocadoHoje);
  localStorage.setItem('tarefasReagendadasHoje', tarefasReagendadasHoje);
  renderizarTarefas();
  renderizarMetas();
  renderizarCalendario();
  atualizarDashboard();
  renderizarMetasCarrossel();
  atualizarRodape();
  if(window.currentUser) setTimeout(() => salvarTudoFirebase(), 500);
}

function sincronizarTarefasRecorrentes() {
  const hoje = getDataHoje();
  let tarefasGeradas = 0;
  const novasTarefas = [];

  const tarefasMae = tarefas.filter(t => t.recorrencia && t.recorrencia!== '' && t.concluida === true);

  for(let tarefaMae of tarefasMae) {
    let proximaData = getProximaData(tarefaMae.recorrencia, tarefaMae.data);
    if(!proximaData) continue;

    while(proximaData < hoje) {
      proximaData = getProximaData(tarefaMae.recorrencia, proximaData);
      if(!proximaData) break;
    }

    if(proximaData && proximaData >= hoje) {
      const jaExiste = tarefas.some(t =>
        t.texto === tarefaMae.texto &&
        t.data === proximaData &&
        t.recorrencia === tarefaMae.recorrencia
      );

      if(!jaExiste) {
        novasTarefas.push({
          id: Date.now() + Math.random(),
          texto: tarefaMae.texto,
          descricao: tarefaMae.descricao || "",
          bloco: tarefaMae.bloco,
          data: proximaData,
          prioridade: tarefaMae.prioridade || "p2",
          recorrencia: tarefaMae.recorrencia,
          concluida: false,
          tempoGasto: 0,
          notificado: false,
          ordem: tarefas.filter(t => t.bloco === tarefaMae.bloco &&!t.concluida).length
        });
        tarefasGeradas++;
        console.log(`🔄 Gerando: ${tarefaMae.texto} para ${proximaData}`);
      }
    }
  }

  if(tarefasGeradas > 0) {
    tarefas.push(...novasTarefas);
    localStorage.setItem('tarefas', JSON.stringify(tarefas));
    mostrarIndicadorSync(`✅ ${tarefasGeradas} nova(s) tarefa(s) gerada(s)`);
    return true;
  }
  return false;
}

function verificarResetDiario() {
  const hoje = getDataHoje();
  if (ultimaDataReset!== hoje) {
    ultimaDataReset = hoje;
    localStorage.setItem('ultimaDataReset', hoje);
    if (ultimaDataReagendamento!== hoje) {
      tarefasReagendadasHoje = 0;
      localStorage.setItem('tarefasReagendadasHoje', '0');
      localStorage.setItem('ultimaDataReagendamento', hoje);
    }
  }
  if (ultimaDataFoco!== hoje) {
    tempoFocadoHoje = 0;
    localStorage.setItem('tempoFocadoHoje', '0');
    localStorage.setItem('ultimaDataFoco', hoje);
    ultimaDataFoco = hoje;
    salvarDados();
  }
}

function concluirComDuplicatas(id) {
  const tarefa = tarefas.find(t => t.id === id);
  if(!tarefa) return;
  tarefa.concluida = true;

  if (tarefa.recorrencia && tarefa.recorrencia!== '') {
    let proximaData = getProximaData(tarefa.recorrencia, tarefa.data);
    if(proximaData) {
      if (!tarefas.some(t => t.texto === tarefa.texto && t.data === proximaData && t.recorrencia === tarefa.recorrencia)) {
        tarefas.push({
          id: Date.now() + Math.random(),
          texto: tarefa.texto,
          descricao: tarefa.descricao || "",
          bloco: tarefa.bloco,
          data: proximaData,
          prioridade: tarefa.prioridade,
          recorrencia: tarefa.recorrencia,
          concluida: false,
          tempoGasto: 0,
          notificado: false,
          ordem: tarefas.filter(t => t.bloco === tarefa.bloco &&!t.concluida).length
        });
        mostrarIndicadorSync(`🔄 Nova tarefa gerada: ${tarefa.texto}`);
      }
    }
  }
  salvarDados();
  mostrarIndicadorSync('✅ Tarefa concluída!');
}

window.toggleTarefa = function(id) {
  const t = tarefas.find(t=>t.id===id);
  if(t) {
    if(!t.concluida) concluirComDuplicatas(id);
    else { t.concluida = false; salvarDados(); mostrarIndicadorSync('🔄 Tarefa reativada!'); }
  }
};

window.excluirTarefa = function(id) {
  if(confirm('Excluir tarefa?')) {
    tarefas = tarefas.filter(t=>t.id!==id);
    salvarDados();
    mostrarIndicadorSync('🗑 Tarefa excluída!');
  }
};

window.abrirModalEdicao = function(id) {
  const tarefa = tarefas.find(t => t.id === id);
  if(tarefa) {
    tarefaEditandoAtual = tarefa;
    document.getElementById('edicaoTitulo').value = tarefa.texto;
    document.getElementById('edicaoDescricao').value = tarefa.descricao || '';
    document.getElementById('edicaoData').value = tarefa.data || getDataHoje();
    document.getElementById('edicaoPrioridade').value = tarefa.prioridade || 'p3';
    document.getElementById('edicaoRecorrencia').value = tarefa.recorrencia || '';
    document.getElementById('modalEdicaoOverlay').classList.add('show');
  }
};

window.fecharModalEdicao = function() {
  document.getElementById('modalEdicaoOverlay').classList.remove('show');
  tarefaEditandoAtual = null;
};

window.salvarEdicaoTarefa = function() {
  if(tarefaEditandoAtual) {
    tarefaEditandoAtual.texto = document.getElementById('edicaoTitulo').value.trim();
    tarefaEditandoAtual.descricao = document.getElementById('edicaoDescricao').value;
    tarefaEditandoAtual.data = document.getElementById('edicaoData').value;
    tarefaEditandoAtual.prioridade = document.getElementById('edicaoPrioridade').value;
    tarefaEditandoAtual.recorrencia = document.getElementById('edicaoRecorrencia').value;
    salvarDados();
    fecharModalEdicao();
    mostrarIndicadorSync('✏ Tarefa editada!');
  }
};

window.abrirModalDescricao = function(id) {
  const tarefa = tarefas.find(t => t.id === id);
  if(tarefa) {
    tarefaDescricaoAtual = tarefa;
    document.getElementById('modalDescricaoTitulo').textContent = tarefa.texto || "Sem título";
    document.getElementById('modalDescricaoTexto').textContent = tarefa.descricao || "Nenhuma descrição adicionada";
    document.getElementById('modalDescricaoOverlay').classList.add('show');
  }
};

window.fecharModalDescricao = function() {
  document.getElementById('modalDescricaoOverlay').classList.remove('show');
  tarefaDescricaoAtual = null;
};

window.editarDescricaoModal = function() {
  if(!tarefaDescricaoAtual) return;
  const novaDescricao = prompt("Editar descrição:", tarefaDescricaoAtual.descricao || "");
  if(novaDescricao!== null) {
    tarefaDescricaoAtual.descricao = novaDescricao;
    salvarDados();
    fecharModalDescricao();
    mostrarIndicadorSync('📝 Descrição atualizada!');
  }
};

window.abrirModalReagendar = function(id) {
  tarefaReagendando = tarefas.find(t => t.id === id);
  if(tarefaReagendando) {
    document.getElementById('novaDataReagendar').value = tarefaReagendando.data || getDataHoje();
    document.getElementById('modalReagendarOverlay').classList.add('show');
  }
};

window.fecharModalReagendar = function() {
  document.getElementById('modalReagendarOverlay').classList.remove('show');
  tarefaReagendando = null;
};

window.confirmarReagendamento = function() {
  const novaData = document.getElementById('novaDataReagendar').value;
  if(tarefaReagendando && novaData) {
    tarefaReagendando.data = novaData;
    tarefaReagendando.notificado = false;
    salvarDados();
    fecharModalReagendar();
    mostrarIndicadorSync('📅 Tarefa reagendada!');
  }
};

window.adicionarCardTarefa = function() {
  const nome = prompt('Nome do novo espaço:');
  if(nome && nome.trim()) {
    cardsTarefas.push({ id:'card_'+Date.now(), nome:nome.trim() });
    salvarDados();
    mostrarIndicadorSync(`📁 Espaço "${nome}" criado!`);
  }
};

window.editarCardTarefa = function(id) {
  const card = cardsTarefas.find(c => c.id === id);
  if(card){
    const novoNome = prompt('Editar nome:', card.nome);
    if(novoNome && novoNome.trim()){
      card.nome = novoNome.trim();
      salvarDados();
      mostrarIndicadorSync('✏ Espaço renomeado!');
    }
  }
};

window.excluirCardTarefa = function(id) {
  if(confirm('Excluir este espaço?')) {
    cardsTarefas = cardsTarefas.filter(c => c.id!== id);
    salvarDados();
    mostrarIndicadorSync('🗑 Espaço excluído!');
  }
};

window.mostrarFormAdicionar = function(cardId) {
  document.getElementById(`form-${cardId}`)?.classList.toggle('show');
};

window.adicionarTarefaInline = function(cardId) {
  const card = cardsTarefas.find(c => c.id === cardId);
  if(!card) return;
  const texto = document.getElementById(`texto-${cardId}`)?.value.trim();
  if(!texto) return;
  const descricao = document.getElementById(`descricao-${cardId}`)?.value.trim() || "";
  const data = document.getElementById(`data-${cardId}`)?.value || getDataHoje();
  const prioridade = document.getElementById(`prioridade-${cardId}`)?.value || 'p3';
  const recorrencia = document.getElementById(`recorrencia-${cardId}`)?.value || '';
  tarefas.push({
    id: Date.now(),
    texto,
    descricao,
    bloco: card.nome,
    data,
    prioridade,
    recorrencia,
    concluida: false,
    tempoGasto: 0,
    notificado: false,
    ordem: tarefas.filter(t=>t.bloco===card.nome &&!t.concluida).length
  });
  document.getElementById(`texto-${cardId}`).value = '';
  document.getElementById(`descricao-${cardId}`).value = '';
  document.getElementById(`form-${cardId}`)?.classList.remove('show');
  salvarDados();
  mostrarIndicadorSync('✅ Tarefa adicionada!');
};

window.marcarTodasHoje = function() {
  const hoje = getDataHoje();
  const alvos = tarefas.filter(t=>t.data===hoje &&!t.concluida);
  if(alvos.length===0) return alert('🎉 Nenhuma tarefa pendente para hoje!');
  if(confirm(`Concluir ${alvos.length} tarefa(s) de hoje?`)){
    alvos.forEach(t=>t.concluida=true);
    salvarDados();
    alert(`✅ ${alvos.length} tarefa(s) concluída(s)!`);
    mostrarIndicadorSync(`🎉 ${alvos.length} tarefas concluídas!`);
  }
};

// DRAG AND DROP
window.iniciarDragTarefa = function(id, cardNome, event) {
  tarefaArrastandoId = id;
  tarefaArrastandoOrigem = cardNome;
  event.dataTransfer.setData('text/plain', id);
  const el = event.target.closest('.tarefa-item');
  if(el) el.classList.add('dragging');
};

window.permitirDropTarefa = function(event) { event.preventDefault(); };
window.permitirDropCard = function(event) { event.preventDefault(); event.currentTarget.classList.add('drag-over'); };
window.removerDragOver = function(event) { event.currentTarget.classList.remove('drag-over'); };

window.soltarTarefa = function(event, cardNomeDestino, tarefaIdDestino) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if(!tarefaArrastandoId) return;
  if(tarefaArrastandoOrigem === cardNomeDestino && tarefaIdDestino) {
    const tarefasDoCard = tarefas.filter(t => t.bloco === cardNomeDestino &&!t.concluida).sort((a,b)=>(a.ordem||0)-(b.ordem||0));
    const indexOrigem = tarefasDoCard.findIndex(t => t.id === tarefaArrastandoId);
    const indexDestino = tarefasDoCard.findIndex(t => t.id === tarefaIdDestino);
    if(indexOrigem!== -1 && indexDestino!== -1) {
      const [item] = tarefasDoCard.splice(indexOrigem, 1);
      tarefasDoCard.splice(indexDestino, 0, item);
      tarefasDoCard.forEach((t, idx) => { const tarefaGlobal = tarefas.find(gt => gt.id === t.id); if(tarefaGlobal) tarefaGlobal.ordem = idx; });
      salvarDados();
    }
  } else if(tarefaArrastandoOrigem!== cardNomeDestino) {
    const tarefa = tarefas.find(t => t.id === tarefaArrastandoId);
    if(tarefa) { tarefa.bloco = cardNomeDestino; salvarDados(); mostrarIndicadorSync(`📦 Tarefa movida`); }
  }
  tarefaArrastandoId = null;
  tarefaArrastandoOrigem = null;
  document.querySelectorAll('.tarefa-item').forEach(el => el.classList.remove('dragging'));
};
// RENDERIZAÇÃO
function renderizarTarefas() {
  const container = document.getElementById('blocosTarefas');
  if(!container) return;
  const hoje = getDataHoje();
  container.innerHTML = '';
  cardsTarefas.forEach(card => {
    let lista = tarefas.filter(t=>t.bloco===card.nome);
    lista = lista.filter(t => { if(!t.data || t.concluida) return false; return t.data === hoje || t.data < hoje; });
    const ativas = lista.filter(t=>!t.concluida).length;
    const cardId = card.id;

    const tarefasHtml = lista.sort((a,b)=>(a.ordem||0)-(b.ordem||0)).map(t => {
      const atrasada = t.data && t.data < hoje;
      const recorrenciaIcon = {
        'diaria': '🔄 Diária',
        'dias_uteis': '📅 Dias úteis',
        'semanal': '📆 Semanal',
        'mensal': '📅 Mensal'
      }[t.recorrencia] || '';

      return `<div class="tarefa-item ${t.prioridade === 'p1'? 'p1' : (t.prioridade === 'p2'? 'p2' : '')}" draggable="true" ondragstart="iniciarDragTarefa(${t.id}, '${escapeHtml(card.nome).replace(/'/g, "\\'")}', event)" ondragend="document.querySelectorAll('.tarefa-item').forEach(el=>el.classList.remove('dragging'))" ondragover="permitirDropTarefa(event)" ondrop="soltarTarefa(event, '${escapeHtml(card.nome).replace(/'/g, "\\'")}', ${t.id})">
        <div class="task-left">
          <div class="drag-handle"><i class="fas fa-grip-vertical"></i></div>
          <input type="checkbox" class="task-checkbox" ${t.concluida?'checked':''} onchange="toggleTarefa(${t.id})">
          <div class="task-info">
            <div class="task-title">${escapeHtml(t.texto)}</div>
            <div class="task-meta">
              <span class="meta-date ${atrasada? 'badge atrasada' : ''}" onclick="abrirModalReagendar(${t.id}); event.stopPropagation()"><i class="fas fa-calendar"></i> ${t.data} ${atrasada? '⚠' : ''}</span>
              ${t.recorrencia? `<span class="meta-tag"><i class="fas fa-redo-alt"></i> ${recorrenciaIcon}</span>` : ''}
              ${t.tempoGasto? `<span class="meta-tag"><i class="fas fa-clock"></i> ${Math.floor(t.tempoGasto/60)}min</span>` : ''}
            </div>
          </div>
        </div>
        <div class="task-actions-2x2">
          <button class="task-action-btn" onclick="abrirModalEdicao(${t.id}); event.stopPropagation()" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="task-action-btn" onclick="abrirModalDescricao(${t.id}); event.stopPropagation()" title="Descrição"><i class="fas fa-pen-alt"></i></button>
          <button class="task-action-btn" onclick="abrirModoFocoComTarefa(${t.id}); event.stopPropagation()" title="Modo Foco"><i class="fas fa-clock"></i></button>
          <button class="task-action-btn danger" onclick="excluirTarefa(${t.id}); event.stopPropagation()" title="Excluir"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;
    }).join('');

    let div = document.createElement('div');
    div.className = 'card-espaco';
    div.setAttribute('ondragover', 'permitirDropCard(event)');
    div.setAttribute('ondragleave', 'removerDragOver(event)');
    div.setAttribute('ondrop', `soltarTarefa(event, '${escapeHtml(card.nome).replace(/'/g, "\\'")}', null)`);
    div.innerHTML = `<div class="card-header"><span><i class="fas fa-list-ul"></i> ${escapeHtml(card.nome)}</span><div><span style="color:white;">${ativas} ativas</span><button onclick="editarCardTarefa('${card.id}')"><i class="fas fa-edit"></i></button><button onclick="excluirCardTarefa('${card.id}')"><i class="fas fa-trash-alt"></i></button></div></div><div class="card-content">${lista.length === 0? `<div class="estado-vazio" style="text-align:center;padding:40px;"><i class="fas fa-check-circle" style="font-size:32px;opacity:0.5;"></i><p style="color:white;">Tudo certo</p><small style="color:rgba(255,255,255,0.5);">Adicione uma tarefa</small></div>` : tarefasHtml}</div><button class="btn-nova-tarefa" onclick="mostrarFormAdicionar('${cardId}')"><i class="fas fa-plus-circle"></i> Nova Tarefa</button><div class="inline-form" id="form-${cardId}"><input type="text" id="texto-${cardId}" placeholder="Título..."><textarea id="descricao-${cardId}" placeholder="Descrição..." rows="2"></textarea><input type="date" id="data-${cardId}" value="${getDataHoje()}"><select id="prioridade-${cardId}"><option value="p3">🟢 Baixa</option><option value="p2">🟡 Média</option><option value="p1">🔴 Alta</option></select><select id="recorrencia-${cardId}"><option value="">Sem recorrência</option><option value="diaria">🔄 Diária</option><option value="dias_uteis">📅 Dias úteis</option><option value="semanal">📆 Semanal</option><option value="mensal">📅 Mensal</option></select><div class="inline-form-buttons"><button class="btn-confirm" onclick="adicionarTarefaInline('${cardId}')">Adicionar</button><button class="btn-cancel" onclick="document.getElementById('form-${cardId}').classList.remove('show')">Cancelar</button></div></div>`;
    container.appendChild(div);
  });
  const addCard = document.createElement('div');
  addCard.className = 'card-novo-espaco';
  addCard.onclick = () => adicionarCardTarefa();
  addCard.innerHTML = `<div><i class="fas fa-plus-circle"></i><p>Novo Espaço</p></div>`;
  container.appendChild(addCard);
}

// ========== METAS ==========
function renderizarMetas() {
  const container = document.getElementById('metasGrid');
  if(!container) return;
  container.innerHTML = metas.map(m => `
    <div class="meta-card-mini" style="background:rgba(255,255,255,0.08); padding:12px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:10px; flex:1;">
        <div class="${m.concluida? 'circulo-concluido' : 'circulo-pendente'}" onclick="toggleMeta(${m.id})">${m.concluida? '<i class="fas fa-check" style="color:white;font-size:12px;"></i>' : ''}</div>
        <div>
          <div class="titulo-meta">${escapeHtml(m.texto)}</div>
          <small style="color:rgba(255,255,255,0.5); font-size:11px;">${m.categoria}</small>
        </div>
      </div>
      <button onclick="excluirMeta(${m.id})" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
    </div>
  `).join('');
  document.getElementById('totalMetas').textContent = metas.length;
  document.getElementById('concluidasMetas').textContent = metas.filter(m=>m.concluida).length;
  document.getElementById('progressoMetas').textContent = metas.length? Math.round(metas.filter(m=>m.concluida).length / metas.length * 100) : 0;
}

function renderizarMetasCarrossel() {
  const container = document.getElementById('metasCarousel');
  if(!container) return;
  const metasAtivas = metas.filter(m => !m.concluida).slice(0, 5);
  if(metasAtivas.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = metasAtivas.map(m => `
    <div class="meta-card-mini" onclick="toggleMeta(${m.id})">
      <div class="circulo-pendente"></div>
      <span class="titulo-meta">${escapeHtml(m.texto)}</span>
    </div>
  `).join('') + `<div class="meta-card-mini" onclick="document.getElementById('metasCompletas').style.display='block'" style="cursor:pointer; background:rgba(168,85,247,0.2);"><i class="fas fa-eye" style="color:#a855f7;"></i><span class="titulo-meta">Ver todas</span></div>`;
}

window.adicionarMeta = function() {
  const texto = document.getElementById('novaMetaTexto').value.trim();
  const categoria = document.getElementById('novaMetaCategoria').value;
  if(!texto) return;
  metas.push({ id: Date.now(), texto, categoria, concluida: false });
  document.getElementById('novaMetaTexto').value = '';
  salvarDados();
  mostrarIndicadorSync('🎯 Meta adicionada!');
};

window.toggleMeta = function(id) {
  const meta = metas.find(m => m.id === id);
  if(meta) {
    meta.concluida = !meta.concluida;
    salvarDados();
    mostrarIndicadorSync(meta.concluida? '✅ Meta concluída!' : '🔄 Meta reativada!');
  }
};

window.excluirMeta = function(id) {
  if(confirm('Excluir meta?')) {
    metas = metas.filter(m => m.id !== id);
    salvarDados();
    mostrarIndicadorSync('🗑 Meta excluída!');
  }
};

// ========== DASHBOARD ==========
function atualizarDashboard() {
  const hoje = getDataHoje();
  const tarefasHoje = tarefas.filter(t => t.data === hoje && !t.concluida);
  const tarefasAtrasadas = tarefas.filter(t => t.data && t.data < hoje && !t.concluida);
  
  const alerta = document.getElementById('dashboardAlerta');
  if(tarefasAtrasadas.length > 0) {
    alerta.style.display = 'inline-flex';
    document.getElementById('alertaTexto').textContent = `Você tem ${tarefasAtrasadas.length} tarefa(s) atrasada(s)!`;
    document.getElementById('alertaSubtexto').textContent = 'Reagende ou conclua agora';
    document.getElementById('alertaBtn').onclick = () => window.scrollTo({top: 0, behavior: 'smooth'});
  } else if(tarefasHoje.length > 0) {
    alerta.style.display = 'inline-flex';
    document.getElementById('alertaTexto').textContent = `Você tem ${tarefasHoje.length} tarefa(s) para hoje!`;
    document.getElementById('alertaSubtexto').textContent = 'Organize seu dia 🎯';
    document.getElementById('alertaBtn').onclick = () => irParaHoje();
  } else {
    alerta.style.display = 'none';
  }
}

function atualizarRodape() {
  const hoje = getDataHoje();
  const concluidas = tarefas.filter(t => t.concluida && t.data === hoje).length;
  const pendentes = tarefas.filter(t => !t.concluida && t.data === hoje).length;
  const total = concluidas + pendentes;
  const taxa = total > 0 ? Math.round((concluidas / total) * 100) : 0;
  
  document.getElementById('footerConcluidas').textContent = concluidas;
  document.getElementById('footerTaxa').textContent = taxa + '%';
  document.getElementById('footerPendentes').textContent = pendentes;
  document.getElementById('footerTempo').textContent = `${Math.floor(tempoFocadoHoje/60)}h ${tempoFocadoHoje%60}m`;
  document.getElementById('footerReagendadasCount').textContent = tarefasReagendadasHoje;
}

// ========== CALENDÁRIO ==========
window.toggleView = function(view) {
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  event.target.closest('.view-btn').classList.add('active');
  document.getElementById('cardsView').style.display = view === 'cards' ? 'block' : 'none';
  document.getElementById('calendarioView').style.display = view === 'calendario' ? 'block' : 'none';
  if(view === 'calendario') renderizarCalendario();
};

function renderizarCalendario() {
  const grade = document.getElementById('calendarioGrade');
  if(!grade) return;
  const ano = dataCalendario.getFullYear();
  const mes = dataCalendario.getMonth();
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  
  grade.innerHTML = '';
  
  for(let i = 0; i < primeiroDia; i++) {
    grade.innerHTML += '<div class="calendario-dia" style="opacity:0.3;"></div>';
  }
  
  for(let dia = 1; dia <= diasNoMes; dia++) {
    const dataStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    const tarefasDoDia = tarefas.filter(t => t.data === dataStr && !t.concluida);
    const hoje = getDataHoje();
    const isHoje = dataStr === hoje;
    
    grade.innerHTML += `
      <div class="calendario-dia ${isHoje? 'hoje' : ''}" style="${isHoje? 'border:2px solid #667eea;' : ''}">
        <div style="font-weight:600; margin-bottom:4px; color:${isHoje? '#667eea' : 'white'};">${dia}</div>
        ${tarefasDoDia.slice(0,3).map(t => `<div style="font-size:10px; padding:2px 4px; margin:2px 0; background:rgba(168,85,247,0.3); border-radius:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.texto)}</div>`).join('')}
        ${tarefasDoDia.length > 3? `<div style="font-size:9px; color:rgba(255,255,255,0.5);">+${tarefasDoDia.length-3} mais</div>` : ''}
      </div>
    `;
  }
}

window.mudarMes = function(delta) {
  dataCalendario.setMonth(dataCalendario.getMonth() + delta);
  renderizarCalendario();
};

window.irParaHoje = function() {
  dataCalendario = new Date();
  renderizarCalendario();
  window.scrollTo({top: 0, behavior: 'smooth'});
};

// ========== MODO FOCO ==========
window.abrirModoFocoComTarefa = function(id) {
  const tarefa = tarefas.find(t => t.id === id);
  if(tarefa) {
    tarefaFocoAtual = tarefa;
    document.getElementById('tarefaFocoTexto').textContent = tarefa.texto;
    document.getElementById('modalFocoOverlay').classList.add('show');
    resetarPomodoro();
  }
};

window.fecharModoFoco = function() {
  pausarPomodoro();
  document.getElementById('modalFocoOverlay').classList.remove('show');
  if(lofiActive) toggleMusicaFoco();
  tarefaFocoAtual = null;
};

function resetarPomodoro() {
  tempoRestante = 25 * 60;
  pomodoroAtivo = false;
  pomodoroPausado = false;
  atualizarTimerDisplay();
  document.getElementById('btnIniciarFoco').style.display = 'inline-block';
  document.getElementById('btnPausarFoco').style.display = 'none';
}

function atualizarTimerDisplay() {
  const min = Math.floor(tempoRestante / 60);
  const seg = tempoRestante % 60;
  document.getElementById('timerFocoGrande').textContent = `${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')}`;
  const progresso = ((25*60 - tempoRestante) / (25*60)) * 100;
  document.getElementById('progressoFocoBar').style.width = progresso + '%';
}

window.iniciarPomodoro = function() {
  if(pomodoroAtivo && !pomodoroPausado) return;
  pomodoroAtivo = true;
  pomodoroPausado = false;
  tempoFocoInicio = Date.now();
  document.getElementById('btnIniciarFoco').style.display = 'none';
  document.getElementById('btnPausarFoco').style.display = 'inline-block';
  
  pomodoroInterval = setInterval(() => {
    tempoRestante--;
    atualizarTimerDisplay();
    
    if(tempoRestante <= 0) {
      clearInterval(pomodoroInterval);
      pomodoroAtivo = false;
      const tempoDecorrido = Math.floor((Date.now() - tempoFocoInicio) / 1000);
      tempoTotalFocado += tempoDecorrido;
      tempoFocadoHoje += tempoDecorrido;
      if(tarefaFocoAtual) tarefaFocoAtual.tempoGasto = (tarefaFocoAtual.tempoGasto || 0) + tempoDecorrido;
      salvarDados();
      mostrarIndicadorSync('🎉 Pomodoro concluído! Hora da pausa');
      new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE').play();
      document.getElementById('btnIniciarFoco').style.display = 'inline-block';
      document.getElementById('btnPausarFoco').style.display = 'none';
    }
  }, 1000);
};

window.pausarPomodoro = function() {
  if(pomodoroInterval) {
    clearInterval(pomodoroInterval);
    pomodoroPausado = true;
    const tempoDecorrido = Math.floor((Date.now() - tempoFocoInicio) / 1000);
    tempoTotalFocado += tempoDecorrido;
    tempoFocadoHoje += tempoDecorrido;
    if(tarefaFocoAtual) tarefaFocoAtual.tempoGasto = (tarefaFocoAtual.tempoGasto || 0) + tempoDecorrido;
    salvarDados();
    document.getElementById('btnIniciarFoco').style.display = 'inline-block';
    document.getElementById('btnPausarFoco').style.display = 'none';
  }
};

window.prorrogarTempoFoco = function() {
  tempoRestante += 10 * 60;
  atualizarTimerDisplay();
  mostrarIndicadorSync('⏰ +10 minutos adicionados');
};

window.concluirTarefaFoco = function() {
  if(tarefaFocoAtual) {
    if(pomodoroInterval) pausarPomodoro();
    concluirComDuplicatas(tarefaFocoAtual.id);
    fecharModoFoco();
  }
};

window.toggleMusicaFoco = function() {
  if(!lofiAudioElement) lofiAudioElement = document.getElementById('lofiAudio');
  if(lofiActive) {
    lofiAudioElement.pause();
    lofiActive = false;
    document.getElementById('btnMusicaFoco').innerHTML = '<i class="fas fa-music"></i> LoFi Focus';
  } else {
    lofiAudioElement.play().catch(() => mostrarIndicadorSync('⚠️ Adicione lofi.mp3 na pasta', 'error'));
    lofiActive = true;
    document.getElementById('btnMusicaFoco').innerHTML = '<i class="fas fa-pause"></i> Pausar LoFi';
  }
};

window.ajustarVolumeFoco = function(val) {
  if(lofiAudioElement) lofiAudioElement.volume = val / 100;
};

// ========== EVENTOS ==========
document.addEventListener('DOMContentLoaded', () => {
  atualizarDataHoje();
  document.getElementById('syncNowBtn').onclick = () => {
    const gerou = sincronizarTarefasRecorrentes();
    if(gerou) renderizarTarefas();
    else mostrarIndicadorSync('✅ Tudo sincronizado!');
  };
  document.getElementById('rescheduleBtn').onclick = () => {
    const hoje = getDataHoje();
    const atrasadas = tarefas.filter(t => t.data && t.data < hoje && !t.concluida);
    if(atrasadas.length === 0) return mostrarIndicadorSync('✅ Nenhuma tarefa atrasada!');
    if(confirm(`Reagendar ${atrasadas.length} tarefa(s) para hoje?`)) {
      atrasadas.forEach(t => { t.data = hoje; t.notificado = false; });
      salvarDados();
      mostrarIndicadorSync(`📅 ${atrasadas.length} tarefa(s) reagendada(s)!`);
    }
  };
  document.getElementById('indexedbBtn').onclick = () => abrirModalBackup();
  document.getElementById('backupBtn').onclick = () => {
    const backup = {
      tarefas: localStorage.getItem('tarefas'),
      metas: localStorage.getItem('metas'),
      cardsTarefas: localStorage.getItem('cardsTarefas'),
      tempoTotalFocado: localStorage.getItem('tempoTotalFocado')
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fluxo_backup_${getDataHoje()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarIndicadorSync('💾 Backup exportado!');
  };
  document.getElementById('importBackupBtn').onclick = () => importarBackupJSON();
  document.getElementById('themeToggle').onclick = () => {
    document.body.classList.toggle('dark-theme');
    const icon = document.body.classList.contains('dark-theme')? 'fa-sun' : 'fa-moon';
    document.getElementById('themeToggle').innerHTML = `<i class="fas ${icon}"></i>`;
    localStorage.setItem('theme', document.body.classList.contains('dark-theme')? 'dark' : 'light');
  };
  if(localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun"></i>';
  }
  document.getElementById('logoutBtn').onclick = () => fazerLogout();
  document.getElementById('notifyBtn').onclick = () => {
    if(Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        if(p === 'granted') mostrarIndicadorSync('🔔 Notificações ativadas!');
      });
    } else if(Notification.permission === 'granted') {
      mostrarIndicadorSync('🔔 Notificações já ativas!');
    }
  };
  document.getElementById('userAvatar').onclick = () => {
    const tooltip = document.getElementById('userTooltip');
    tooltip.style.display = tooltip.style.display === 'block' ? 'none' : 'block';
  };
});

onAuthStateChanged(auth, async (user) => {
  if(user) {
    currentUser = user;
    window.currentUser = user;
    usuarioAtual = user.email;
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userEmailTooltip').textContent = user.email;
    document.getElementById('googleBackupBtn').style.display = 'flex';
    await initIndexedDB();
    await carregarDadosFirebase();
    verificarResetDiario();
    sincronizarTarefasRecorrentes();
    atualizarDataHoje();
    renderizarTarefas();
    renderizarMetas();
    renderizarCalendario();
    atualizarDashboard();
    renderizarMetasCarrossel();
    atualizarRodape();
    mostrarIndicadorSync(`✅ Logado como ${user.email}`);
  } else {
    currentUser = null;
    window.currentUser = null;
    usuarioAtual = null;
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
  }
});

function atualizarDataHoje() {
  const hoje = new Date();
  const opcoes = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dataFormatada = hoje.toLocaleDateString('pt-BR', opcoes);
  document.getElementById('dataHojeHeader').textContent = dataFormatada;
  document.getElementById('dataHojeMobile').textContent = dataFormatada;
}

window.recarregarSistema = function() {
  tarefas = JSON.parse(localStorage.getItem('tarefas') || '[]');
  metas = JSON.parse(localStorage.getItem('metas') || '[]');
  cardsTarefas = JSON.parse(localStorage.getItem('cardsTarefas') || '[]');
  tempoTotalFocado = parseInt(localStorage.getItem('tempoTotalFocado') || '0');
  tempoFocadoHoje = parseInt(localStorage.getItem('tempoFocadoHoje') || '0');
  renderizarTarefas();
  renderizarMetas();
  renderizarCalendario();
  atualizarDashboard();
  renderizarMetasCarrossel();
  atualizarRodape();
};
