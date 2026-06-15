(() => {
  const STORAGE_TASKS = 'fluxo_tarefas_v1';
  const STORAGE_VIEW = 'fluxo_view_mode';

  let tarefas = carregarTarefas();
  let dataCalendario = new Date();

  const el = {
    dataHoje: document.getElementById('dataHoje'),

    cardsView: document.getElementById('cardsView'),
    calendarioView: document.getElementById('calendarioView'),

    btnCards: document.getElementById('btnCards'),
    btnCalendario: document.getElementById('btnCalendario'),

    btnMesAnterior: document.getElementById('btnMesAnterior'),
    btnMesProximo: document.getElementById('btnMesProximo'),
    btnHoje: document.getElementById('btnHoje'),
    mesAnoLabel: document.getElementById('mesAnoLabel'),
    calendarioGrade: document.getElementById('calendarioGrade'),

    listaTrabalho: document.getElementById('lista-trabalho'),
    listaPessoal: document.getElementById('lista-pessoal'),

    btnNovaTarefaGlobal: document.getElementById('btnNovaTarefaGlobal')
  };

  function formatarDataHoje() {
    return new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function escapeHTML(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function carregarTarefas() {
    try {
      const raw = localStorage.getItem(STORAGE_TASKS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function salvarTarefas() {
    localStorage.setItem(STORAGE_TASKS, JSON.stringify(tarefas));
  }

  /* ============== VIEWS ============== */
  function setActiveView(view) {
    const isCards = view === 'cards';

    el.cardsView.classList.toggle('active', isCards);
    el.calendarioView.classList.toggle('active', !isCards);

    el.btnCards.classList.toggle('active', isCards);
    el.btnCalendario.classList.toggle('active', !isCards);

    localStorage.setItem(STORAGE_VIEW, view);

    if (!isCards) renderCalendario();
  }

  function restaurarView() {
    const saved = localStorage.getItem(STORAGE_VIEW);
    setActiveView(saved === 'calendario' ? 'calendario' : 'cards');
  }

  /* ============== TAREFAS ============== */
  function adicionarTarefa(espaco, titulo, data, prioridade) {
    if (!titulo.trim()) return;

    tarefas.push({
      id: uid(),
      espaco,
      titulo: titulo.trim(),
      data: data || '',
      prioridade: prioridade || 'p3',
      concluida: false,
      criadoEm: new Date().toISOString()
    });

    salvarTarefas();
    renderCards();
    renderCalendario();
  }

  function toggleConclusao(id) {
    const t = tarefas.find(x => x.id === id);
    if (!t) return;
    t.concluida = !t.concluida;
    salvarTarefas();
    renderCards();
    renderCalendario();
  }

  function excluirTarefa(id) {
    tarefas = tarefas.filter(t => t.id !== id);
    salvarTarefas();
    renderCards();
    renderCalendario();
  }

  function tarefaCardHTML(t) {
    const dataFormatada = t.data ? t.data.split('-').reverse().join('/') : '';
    return `
      <div class="tarefa-item ${escapeHTML(t.prioridade)}" data-id="${escapeHTML(t.id)}">
        <div class="task-left">
          <input class="task-checkbox" type="checkbox" data-action="toggle" ${t.concluida ? 'checked' : ''} />
          <div class="task-info">
            <div class="task-title">${escapeHTML(t.titulo)}</div>
            <div class="task-meta">
              ${dataFormatada ? `<span class="meta-date">${escapeHTML(dataFormatada)}</span>` : ''}
              <span class="meta-tag">${escapeHTML(t.espaco.toUpperCase())}</span>
            </div>
          </div>
        </div>
        <div class="task-actions-2x2">
          <button class="task-action-btn danger" data-action="delete" title="Excluir">🗑️</button>
        </div>
      </div>
    `;
  }

  function renderCards() {
    const trabalho = tarefas.filter(t => t.espaco === 'trabalho');
    const pessoal = tarefas.filter(t => t.espaco === 'pessoal');

    el.listaTrabalho.innerHTML = trabalho.map(tarefaCardHTML).join('');
    el.listaPessoal.innerHTML = pessoal.map(tarefaCardHTML).join('');
  }

  /* ============== CALENDÁRIO ============== */
  function getMesAnoLabel(date) {
    const txt = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function tarefasDoDia(isoDate) {
    return tarefas.filter(t => t.data === isoDate);
  }

  function renderCalendario() {
    const ano = dataCalendario.getFullYear();
    const mes = dataCalendario.getMonth();

    el.mesAnoLabel.textContent = getMesAnoLabel(dataCalendario);

    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);

    const inicioSemana = primeiroDia.getDay(); // 0..6
    const totalDias = ultimoDia.getDate();

    const cells = [];

    // placeholders antes do dia 1
    for (let i = 0; i < inicioSemana; i++) {
      cells.push(`<div class="calendario-dia calendario-dia--vazio"></div>`);
    }

    for (let d = 1; d <= totalDias; d++) {
      const iso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const lista = tarefasDoDia(iso);

      const tarefasHtml = lista.map(t => `
        <div class="tarefa-item ${escapeHTML(t.prioridade)}">
          <div class="task-title">${escapeHTML(t.titulo)}</div>
        </div>
      `).join('');

      cells.push(`
        <div class="calendario-dia">
          <strong>${d}</strong>
          <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            ${tarefasHtml || '<span style="opacity:.45;font-size:11px;">+</span>'}
          </div>
        </div>
      `);
    }

    el.calendarioGrade.innerHTML = cells.join('');
  }

  function mesAnterior() {
    dataCalendario = new Date(dataCalendario.getFullYear(), dataCalendario.getMonth() - 1, 1);
    renderCalendario();
  }

  function mesProximo() {
    dataCalendario = new Date(dataCalendario.getFullYear(), dataCalendario.getMonth() + 1, 1);
    renderCalendario();
  }

  function irHoje() {
    dataCalendario = new Date();
    renderCalendario();
  }

  /* ============== BINDS ============== */
  function bindViews() {
    el.btnCards.addEventListener('click', () => setActiveView('cards'));
    el.btnCalendario.addEventListener('click', () => setActiveView('calendario'));
  }

  function bindCalendarioNav() {
    el.btnMesAnterior.addEventListener('click', mesAnterior);
    el.btnMesProximo.addEventListener('click', mesProximo);
    el.btnHoje.addEventListener('click', irHoje);
  }

  function bindForms() {
    document.querySelectorAll('.btn-add-inline').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-target');
        const form = document.getElementById(id);
        if (form) form.classList.toggle('show');
      });
    });

    document.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-cancel');
        const form = document.getElementById(id);
        if (form) form.classList.remove('show');
      });
    });

    document.querySelectorAll('[data-save]').forEach(btn => {
      btn.addEventListener('click', () => {
        const espaco = btn.getAttribute('data-save');
        const titulo = document.getElementById(`titulo-${espaco}`);
        const data = document.getElementById(`data-${espaco}`);
        const prioridade = document.getElementById(`prioridade-${espaco}`);
        const form = document.getElementById(`form-${espaco}`);

        if (!titulo || !data || !prioridade) return;

        adicionarTarefa(espaco, titulo.value, data.value, prioridade.value);

        titulo.value = '';
        data.value = '';
        prioridade.value = 'p3';
        if (form) form.classList.remove('show');
      });
    });

    el.btnNovaTarefaGlobal.addEventListener('click', () => {
      setActiveView('cards');
      const form = document.getElementById('form-trabalho');
      if (form) form.classList.add('show');
    });
  }

  function bindListas() {
    [el.listaTrabalho, el.listaPessoal].forEach(lista => {
      lista.addEventListener('click', (ev) => {
        const item = ev.target.closest('.tarefa-item');
        if (!item) return;

        const id = item.getAttribute('data-id');
        const action = ev.target.closest('[data-action]')?.getAttribute('data-action');

        if (action === 'toggle') toggleConclusao(id);
        if (action === 'delete') excluirTarefa(id);
      });
    });
  }

  function init() {
    el.dataHoje.textContent = formatarDataHoje();

    bindViews();
    bindCalendarioNav();
    bindForms();
    bindListas();

    renderCards();
    renderCalendario();
    restaurarView();
  }

  init();
})();
