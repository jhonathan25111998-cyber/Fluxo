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

    // RENDERIZAÇÃO COM TAG DISCRETA DE RECORRÊNCIA
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
    div.innerHTML = `<div class="card-header"><span><i class="fas fa-list-ul"></i> ${escapeHtml(card.nome)}</span><div><span style="color:white;">${ativas} ativas</span><button onclick="editarCardTarefa('${card.id}')"><i class="fas fa-edit"></i></button><button onclick="excluirCardTarefa('${card.id}')"><i class="fas fa-trash-alt"></i></button></div></div><div class="card-content">${lista.length === 0? `<div class="estado-vazio" style="text-align:center;padding:40px;"><i class="fas fa-check-circle" style="font-size:32px;opacity:0.5;"></i><p style="color:white;">Tudo certo</p><small style="color:rgba(255,255,255,0.5);">Adicione uma tarefa</small></div>` : tarefasHtml}</div><button class="btn-nova-tarefa" onclick="mostrarFormAdicionar('${cardId}')"><i class="fas fa-plus-circle"></i> Nova Tarefa</button><div class="inline-form" id="form-${cardId}"><input type="text" id="texto-${cardId}" placeholder="Título..."><textarea id="descricao-${cardId}" placeholder="Descrição..." rows="2"></textarea><input type="date" id="data-${cardId}" value="${getDataHoje()}"><select id="prioridade-${cardId}"><option value="p3">🟢 Baixa</option><option value="p2">🟡 Média</option><option value="p1">🔴 Alta</option></select><select id="recorrencia-${cardId}"><option value="">Sem recorrência</option><option value="diaria">🔄 Diária</option><option value="dias_uteis">📅 Dias úteis</option><option value="semanal">📆 Semanal</option><option value="mensal">📅 Mensal</option></select><div class="inline-form-buttons"><button class="btn-confirm" onclick="adicionarTarefaInline('${cardId}')">Adicionar</button><button class="btn-cancel" onclick="document.getElementById('form-${cardId}').classList.remove('show')">Cancelar</button></div></div></div>`;
    container.appendChild(div);
  });
  const addCard = document.createElement('div');
  addCard.className = 'card-novo-espaco';
  addCard.onclick = () => adicionarCardTarefa();
  addCard.innerHTML = `<div><i class="fas fa-plus-circle"></i></