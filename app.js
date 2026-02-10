// ============================================================
// App.js — Core application logic
// ============================================================

const App = (() => {
  // ---- Helpers ----------------------------------------------
  function uuid() {
    return crypto.randomUUID?.() ||
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function toLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dayName(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  }

  function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function isToday(dateStr) { return dateStr === today(); }
  function isPast(dateStr) { return dateStr < today(); }

  // Week starts SUNDAY
  function getWeekDates(referenceDate) {
    const ref = new Date(referenceDate + 'T12:00:00');
    const sunday = new Date(ref);
    sunday.setDate(ref.getDate() - ref.getDay());
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      dates.push(toLocalDateStr(d));
    }
    return dates;
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return toLocalDateStr(d);
  }

  // ---- Late-ness (0=on-time, 1-4=progressively late) --------
  function latenessLevel(dateStr) {
    if (!dateStr) return 0;
    const diff = Math.floor(
      (new Date(today() + 'T00:00:00') - new Date(dateStr + 'T00:00:00')) / 86400000
    );
    if (diff <= 0) return 0;
    if (diff <= 1) return 1;
    if (diff <= 3) return 2;
    if (diff <= 7) return 3;
    return 4;
  }

  function latenessClass(task) {
    if (task.done) return '';
    const level = Math.max(latenessLevel(task.deadline), latenessLevel(task.assignedDate));
    return level > 0 ? `late-${level}` : '';
  }

  function isLate(task) {
    if (task.done) return false;
    return (task.assignedDate && isPast(task.assignedDate)) ||
           (task.deadline && isPast(task.deadline));
  }

  // ---- Category colours (hash → palette) --------------------
  const CATEGORY_COLORS = [
    '#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#74b9ff',
    '#a29bfe', '#55efc4', '#fab1a0', '#81ecec', '#ffeaa7',
    '#dfe6e9', '#fd79a8', '#636e72', '#00cec9', '#e84393',
  ];

  function categoryColor(cat) {
    if (!cat) return 'var(--text-dim)';
    let hash = 0;
    for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
    return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
  }

  // ---- Task factory -----------------------------------------
  function createTask({ title, assignedDate = null, deadline = null, estimateMinutes = 0, category = '' } = {}) {
    return {
      id: uuid(),
      title,
      assignedDate,
      deadline,
      estimateMinutes: parseInt(estimateMinutes) || 0,
      actualMinutes: 0,
      timerStartedAt: null,
      category,
      sortOrder: Date.now(),
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
  }

  // ---- Current week offset ----------------------------------
  let weekOffset = 0;
  let showingSummary = false;

  function getCurrentWeekDates() {
    return getWeekDates(addDays(today(), weekOffset * 7));
  }

  function shiftWeek(d) { weekOffset += d; render(); }
  function goToThisWeek() { weekOffset = 0; render(); }

  // ---- Query helpers ----------------------------------------
  function getTasksForDate(date) {
    return Storage.getAllTasks()
      .filter(t => t.assignedDate === date)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
  }

  function getBacklogTasks() {
    return Storage.getAllTasks()
      .filter(t => !t.assignedDate || (!t.done && t.assignedDate && isPast(t.assignedDate)))
      .sort((a, b) => {
        const aLate = isLate(a) ? 0 : 1;
        const bLate = isLate(b) ? 0 : 1;
        if (aLate !== bLate) return aLate - bLate;
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
  }

  function totalEstimate(tasks) {
    return tasks.reduce((s, t) => s + (t.done ? 0 : t.estimateMinutes || 0), 0);
  }

  function formatMinutes(m) {
    if (!m) return '0m';
    const h = Math.floor(m / 60);
    const mins = m % 60;
    return h ? `${h}h${mins ? ' ' + mins + 'm' : ''}` : `${mins}m`;
  }

  // ---- Timer helpers ----------------------------------------
  let timerInterval = null;

  function getActualMinutes(task) {
    let total = task.actualMinutes || 0;
    if (task.timerStartedAt) {
      total += (Date.now() - new Date(task.timerStartedAt).getTime()) / 60000;
    }
    return Math.round(total);
  }

  function isTimerRunning(task) {
    return !!task.timerStartedAt;
  }

  function toggleTimer(id) {
    const task = Storage.getAllTasks().find(t => t.id === id);
    if (!task) return;
    if (task.timerStartedAt) {
      // Stop: accumulate elapsed time
      const elapsed = (Date.now() - new Date(task.timerStartedAt).getTime()) / 60000;
      Storage.updateTask(id, {
        actualMinutes: (task.actualMinutes || 0) + elapsed,
        timerStartedAt: null,
      });
    } else {
      // Start: record start time. Stop any other running timer first.
      const all = Storage.getAllTasks();
      const running = all.find(t => t.timerStartedAt && t.id !== id);
      if (running) {
        const elapsed = (Date.now() - new Date(running.timerStartedAt).getTime()) / 60000;
        Storage.updateTask(running.id, {
          actualMinutes: (running.actualMinutes || 0) + elapsed,
          timerStartedAt: null,
        });
      }
      Storage.updateTask(id, { timerStartedAt: new Date().toISOString() });
    }
    render();
  }

  function resetTimer(id) {
    Storage.updateTask(id, { actualMinutes: 0, timerStartedAt: null });
    render();
  }

  function formatTimer(minutes) {
    const m = Math.round(minutes);
    if (m < 1) return '<1m';
    const h = Math.floor(m / 60);
    const mins = m % 60;
    return h ? `${h}h ${mins}m` : `${mins}m`;
  }

  function startTimerTick() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      // Update just the timer displays without full re-render
      const all = Storage.getAllTasks();
      const running = all.find(t => t.timerStartedAt);
      if (!running) return;
      document.querySelectorAll(`.task-card[data-task-id="${running.id}"] .task-timer-display`).forEach(el => {
        el.textContent = formatTimer(getActualMinutes(running));
      });
    }, 5000); // Update every 5 seconds
  }

  // ---- Category helpers (autocomplete) ----------------------
  function getAllCategories() {
    const cats = new Set();
    Storage.getAllTasks().forEach(t => { if (t.category) cats.add(t.category); });
    return [...cats].sort();
  }

  function updateCategoryDatalist() {
    const dl = document.getElementById('category-datalist');
    if (!dl) return;
    dl.innerHTML = getAllCategories().map(c => `<option value="${escapeHtml(c)}">`).join('');
  }

  // ---- Drag & Drop ------------------------------------------
  let draggedTaskId = null;

  function handleDragStart(e, taskId) {
    draggedTaskId = taskId;
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    const card = e.target.closest('.task-card');
    if (card) card.classList.add('dragging');
  }

  function handleDragEnd(e) {
    const card = e.target.closest('.task-card');
    if (card) card.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedTaskId = null;
  }

  function handleDrop(e, date) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!draggedTaskId) return;

    const tasks = Storage.getAllTasks();
    const dragged = tasks.find(t => t.id === draggedTaskId);
    if (!dragged) return;

    // Calculate insert position from mouse Y
    const dayTasksEl = e.currentTarget.querySelector('.day-tasks');
    const cards = dayTasksEl ? [...dayTasksEl.querySelectorAll('.task-card:not(.dragging)')] : [];
    const mouseY = e.clientY;
    let insertIdx = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (mouseY < rect.top + rect.height / 2) { insertIdx = i; break; }
    }

    const existing = getTasksForDate(date).filter(t => t.id !== draggedTaskId);
    if (existing.length === 0) {
      dragged.sortOrder = Date.now();
    } else if (insertIdx === 0) {
      dragged.sortOrder = (existing[0].sortOrder || 0) - 1000;
    } else if (insertIdx >= existing.length) {
      dragged.sortOrder = (existing[existing.length - 1].sortOrder || 0) + 1000;
    } else {
      dragged.sortOrder = ((existing[insertIdx - 1].sortOrder || 0) + (existing[insertIdx].sortOrder || 0)) / 2;
    }

    dragged.assignedDate = date;
    Storage.saveTasks(tasks);
    draggedTaskId = null;
    render();
  }

  function handleBacklogDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!draggedTaskId) return;
    Storage.updateTask(draggedTaskId, { assignedDate: null });
    draggedTaskId = null;
    render();
  }

  // ---- Rendering --------------------------------------------
  function render() {
    if (showingSummary) renderSummary(); else renderWeek();
    renderBacklog();
    renderDeadlines();
    renderStats();
  }

  function renderWeek() {
    const weekDates = getCurrentWeekDates();
    const container = document.getElementById('week-container');
    document.getElementById('week-label').textContent = `${formatDate(weekDates[0])} — ${formatDate(weekDates[6])}`;
    container.style.display = '';

    // Build deadline map: which deadlines fall on which day this week
    const allTasksForDeadlines = Storage.getAllTasks();
    const deadlineMap = {};
    weekDates.forEach(d => {
      const dls = allTasksForDeadlines.filter(t => t.deadline === d && !t.done);
      if (dls.length > 0) deadlineMap[d] = dls;
    });

    container.innerHTML = weekDates.map(date => {
      const tasks = getTasksForDate(date);
      const est = totalEstimate(tasks);
      const doneCount = tasks.filter(t => t.done).length;
      const deadlinesHere = deadlineMap[date] || [];
      const hasDeadline = deadlinesHere.length > 0;
      const deadlineTagsHtml = hasDeadline
        ? `<div class="day-deadline-tags">${deadlinesHere.map(t =>
            `<span class="day-deadline-tag ${isPast(date) ? 'overdue' : ''}" title="${escapeHtml(t.title)}">📅 ${escapeHtml(t.title.length > 18 ? t.title.slice(0,16) + '…' : t.title)}</span>`
          ).join('')}</div>` : '';
      return `
        <div class="day-column ${isToday(date) ? 'is-today' : ''} ${isPast(date) ? 'is-past' : ''} ${hasDeadline ? 'has-deadline' : ''}"
             data-date="${date}"
             ondragover="event.preventDefault(); event.dataTransfer.dropEffect='move'; this.classList.add('drag-over')"
             ondragleave="if(!this.contains(event.relatedTarget)) this.classList.remove('drag-over')"
             ondrop="App.handleDrop(event, '${date}')">
          <div class="day-header">
            <span class="day-name">${dayName(date)}</span>
            <span class="day-date">${formatDate(date)}</span>
            <div class="day-meta">
              <span class="day-estimate" title="Estimated work">${formatMinutes(est)}</span>
              <span class="day-count">${doneCount}/${tasks.length}</span>
            </div>
            ${deadlineTagsHtml}
          </div>
          <div class="day-tasks">${tasks.map(t => renderTaskCard(t)).join('')}</div>
          <div class="quick-add" data-date="${date}">
            <button class="add-task-btn" onclick="App.startQuickAdd(this,'${date}')" title="Add task">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');

    const s = document.getElementById('summary-container');
    if (s) s.style.display = 'none';
  }

  function renderBacklog() {
    const tasks = getBacklogTasks();
    const est = totalEstimate(tasks);
    const container = document.getElementById('backlog-tasks');
    document.getElementById('backlog-count').textContent = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
    document.getElementById('backlog-estimate').textContent = formatMinutes(est);
    container.innerHTML = tasks.length === 0
      ? '<div class="empty-state">No unassigned tasks 🎉</div>'
      : tasks.map(t => renderTaskCard(t, true)).join('');
  }

  function renderTaskCard(task, isBacklog = false) {
    const late = latenessClass(task);
    const doneClass = task.done ? 'task-done' : '';
    const catColor = categoryColor(task.category);
    const borderStyle = task.category && !late ? `border-left:3px solid ${catColor};` : '';

    const deadlineHtml = task.deadline
      ? `<span class="task-deadline ${isPast(task.deadline) && !task.done ? 'overdue' : ''}">📅 ${formatDate(task.deadline)}</span>` : '';
    const estHtml = task.estimateMinutes
      ? `<span class="task-estimate">${formatMinutes(task.estimateMinutes)}</span>` : '';
    const categoryHtml = task.category
      ? `<span class="task-category" style="background:${catColor}22;color:${catColor}">${escapeHtml(task.category)}</span>` : '';

    const lateTask = isBacklog && task.assignedDate && isPast(task.assignedDate) && !task.done;
    const lateBadge = lateTask
      ? `<span class="task-late-badge">⚠ LATE — was ${formatDate(task.assignedDate)}</span>` : '';

    return `
      <div class="task-card ${doneClass} ${late}" draggable="true" style="${borderStyle}"
           data-task-id="${task.id}"
           ondragstart="App.handleDragStart(event,'${task.id}')"
           ondragend="App.handleDragEnd(event)">
        <div class="task-top-row">
          <button class="task-check ${task.done ? 'checked' : ''}"
                  onclick="App.toggleDone('${task.id}')"
                  title="${task.done ? 'Mark undone' : 'Mark done'}">${task.done ? '✓' : ''}</button>
          <span class="task-title" onclick="App.openEditModal('${task.id}')">${escapeHtml(task.title)}</span>
          <button class="task-timer-btn ${isTimerRunning(task) ? 'running' : ''}" onclick="event.stopPropagation(); App.toggleTimer('${task.id}')" title="${isTimerRunning(task) ? 'Stop timer' : 'Start timer'}">${isTimerRunning(task) ? '⏸' : '▶'}</button>
          <button class="task-delete" onclick="App.confirmDelete('${task.id}')" title="Delete">×</button>
        </div>
        <div class="task-meta">${lateBadge}${deadlineHtml}${estHtml}${renderTimerBadge(task)}${categoryHtml}</div>
      </div>`;
  }

  function renderStats() {
    const all = Storage.getAllTasks();
    const done = all.filter(t => t.done).length;
    const lateCount = all.filter(t => isLate(t)).length;
    const todayTasks = getTasksForDate(today());

    document.getElementById('stats-total').textContent = all.length;
    document.getElementById('stats-done').textContent = done;
    document.getElementById('stats-overdue').textContent = lateCount;
    document.getElementById('stats-today').textContent = `${todayTasks.filter(t => t.done).length}/${todayTasks.length}`;
    document.getElementById('stats-today-est').textContent = formatMinutes(totalEstimate(todayTasks));

    const pct = all.length ? Math.round(done / all.length * 100) : 0;
    document.getElementById('stats-progress-text').textContent = `${pct}%`;
    const circle = document.getElementById('stats-progress-ring');
    if (circle) {
      const c = 2 * Math.PI * 36;
      circle.style.strokeDasharray = c;
      circle.style.strokeDashoffset = c - (pct / 100) * c;
    }
  }

  // ---- Deadlines Panel --------------------------------------
  function getDeadlineTasks() {
    return Storage.getAllTasks()
      .filter(t => !t.done && t.deadline)
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
  }

  function renderDeadlines() {
    const tasks = getDeadlineTasks();
    const container = document.getElementById('deadlines-tasks');
    const countEl = document.getElementById('deadlines-count');
    if (!container || !countEl) return;
    countEl.textContent = `${tasks.length} deadline${tasks.length !== 1 ? 's' : ''}`;

    if (tasks.length === 0) {
      container.innerHTML = '<div class="empty-state">No upcoming deadlines \uD83C\uDF89</div>';
      return;
    }

    // Group by deadline date
    const groups = {};
    tasks.forEach(t => {
      if (!groups[t.deadline]) groups[t.deadline] = [];
      groups[t.deadline].push(t);
    });

    container.innerHTML = Object.keys(groups).sort().map(date => {
      const late = isPast(date);
      const isT = isToday(date);
      return `
        <div class="deadline-group">
          <div class="deadline-group-header ${late ? 'overdue' : ''} ${isT ? 'is-today' : ''}">
            ${formatDate(date)} · ${dayName(date)}${isT ? ' (Today)' : ''}${late ? ' — OVERDUE' : ''}
          </div>
          ${groups[date].map(t => {
            const col = categoryColor(t.category);
            return `<div class="deadline-task-item" onclick="App.openEditModal('${t.id}')">
              <span class="cat-dot" style="background:${col}"></span>
              <span class="deadline-task-title">${escapeHtml(t.title)}</span>
              ${t.assignedDate ? `<span class="deadline-assigned">→ ${formatDate(t.assignedDate)}</span>` : '<span class="deadline-assigned unscheduled">unscheduled</span>'}
            </div>`;
          }).join('')}
        </div>`;
    }).join('');
  }

  // ---- Summary Page -----------------------------------------
  function toggleSummary() {
    showingSummary = !showingSummary;
    const btn = document.getElementById('summary-toggle');
    if (btn) btn.classList.toggle('active', showingSummary);
    render();
  }

  function renderSummary() {
    const container = document.getElementById('week-container');
    container.style.display = 'none';

    let el = document.getElementById('summary-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'summary-container';
      el.className = 'summary-container';
      container.parentElement.insertBefore(el, container);
    }
    el.style.display = '';

    const all = Storage.getAllTasks();
    const done = all.filter(t => t.done);
    const missed = all.filter(t => isLate(t));
    const pending = all.filter(t => !t.done && !isLate(t));

    // Category breakdown
    const catMap = {};
    all.forEach(t => {
      const cat = t.category || 'Uncategorized';
      if (!catMap[cat]) catMap[cat] = { total: 0, done: 0, missed: 0, pending: 0, est: 0, estDone: 0, actual: 0 };
      catMap[cat].total++;
      catMap[cat].est += t.estimateMinutes || 0;
      catMap[cat].actual += getActualMinutes(t);
      if (t.done) { catMap[cat].done++; catMap[cat].estDone += t.estimateMinutes || 0; }
      else if (isLate(t)) catMap[cat].missed++;
      else catMap[cat].pending++;
    });
    const cats = Object.keys(catMap).sort();
    const totalEst = all.reduce((s, t) => s + (t.estimateMinutes || 0), 0);
    const doneEst = done.reduce((s, t) => s + (t.estimateMinutes || 0), 0);
    const missedEst = missed.reduce((s, t) => s + (t.estimateMinutes || 0), 0);
    const totalActual = all.reduce((s, t) => s + getActualMinutes(t), 0);
    const doneActual = done.reduce((s, t) => s + getActualMinutes(t), 0);

    // Weekly breakdown
    const weekDates = getCurrentWeekDates();
    const weekData = weekDates.map(date => {
      const tasks = getTasksForDate(date);
      return { date, total: tasks.length, done: tasks.filter(t => t.done).length, est: totalEstimate(tasks) };
    });

    // Upcoming deadlines
    const upcoming = all.filter(t => !t.done && t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 15);

    el.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card summary-overview">
          <h3>📊 Overall</h3>
          <div class="summary-stat-row">
            <div class="summary-stat"><span class="summary-stat-value">${all.length}</span><span class="summary-stat-label">Total</span></div>
            <div class="summary-stat"><span class="summary-stat-value" style="color:var(--green)">${done.length}</span><span class="summary-stat-label">Done</span></div>
            <div class="summary-stat"><span class="summary-stat-value" style="color:var(--red)">${missed.length}</span><span class="summary-stat-label">Late</span></div>
            <div class="summary-stat"><span class="summary-stat-value" style="color:var(--accent)">${pending.length}</span><span class="summary-stat-label">Pending</span></div>
          </div>
          <div class="summary-stat-row" style="margin-top:12px">
            <div class="summary-stat"><span class="summary-stat-value">${formatMinutes(totalEst)}</span><span class="summary-stat-label">Total Est.</span></div>
            <div class="summary-stat"><span class="summary-stat-value" style="color:var(--green)">${formatMinutes(doneEst)}</span><span class="summary-stat-label">Done Est.</span></div>
            <div class="summary-stat"><span class="summary-stat-value" style="color:var(--red)">${formatMinutes(missedEst)}</span><span class="summary-stat-label">Late Est.</span></div>
            <div class="summary-stat"><span class="summary-stat-value" style="color:var(--accent)">${formatMinutes(totalEst - doneEst - missedEst)}</span><span class="summary-stat-label">Remaining</span></div>
          </div>
          <div class="summary-stat-row" style="margin-top:12px">
            <div class="summary-stat"><span class="summary-stat-value" style="color:var(--yellow)">${formatMinutes(totalActual)}</span><span class="summary-stat-label">Actual Time</span></div>
            <div class="summary-stat"><span class="summary-stat-value" style="color:var(--yellow)">${formatMinutes(doneActual)}</span><span class="summary-stat-label">Done Actual</span></div>
            <div class="summary-stat"><span class="summary-stat-value" style="color:${totalEst && totalActual > totalEst ? 'var(--red)' : 'var(--green)'}">${totalEst ? Math.round(totalActual / totalEst * 100) + '%' : '—'}</span><span class="summary-stat-label">Accuracy</span></div>
            <div class="summary-stat"><span class="summary-stat-value" style="color:var(--text-dim)">${totalEst ? (totalActual > totalEst ? '+' : '') + formatMinutes(Math.abs(totalActual - totalEst)) : '—'}</span><span class="summary-stat-label">${totalActual > totalEst ? 'Over Est.' : 'Under Est.'}</span></div>
          </div>
          ${all.length ? `
          <div class="summary-bar" style="margin-top:16px">
            <div class="bar-done" style="width:${(done.length/all.length*100).toFixed(1)}%"></div>
            <div class="bar-late" style="width:${(missed.length/all.length*100).toFixed(1)}%"></div>
          </div>
          <div class="summary-bar-legend">
            <span><span class="dot dot-done"></span> Done ${Math.round(done.length/all.length*100)}%</span>
            <span><span class="dot dot-late"></span> Late ${Math.round(missed.length/all.length*100)}%</span>
            <span><span class="dot dot-pending"></span> Pending ${Math.round(pending.length/all.length*100)}%</span>
          </div>` : ''}
        </div>

        <div class="summary-card">
          <h3>🏷 By Category</h3>
          <table class="summary-table">
            <thead><tr><th>Category</th><th>Tasks</th><th>Done</th><th>Late</th><th>Est.</th><th>Actual</th></tr></thead>
            <tbody>${cats.map(cat => {
              const c = catMap[cat]; const col = categoryColor(cat === 'Uncategorized' ? '' : cat);
              return `<tr><td><span class="cat-dot" style="background:${col}"></span>${escapeHtml(cat)}</td><td>${c.total}</td><td style="color:var(--green)">${c.done}</td><td style="color:var(--red)">${c.missed}</td><td>${formatMinutes(c.est)}</td><td style="color:var(--yellow)">${formatMinutes(c.actual)}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>

        <div class="summary-card">
          <h3>📅 This Week</h3>
          <table class="summary-table">
            <thead><tr><th>Day</th><th>Tasks</th><th>Done</th><th>Est. Left</th></tr></thead>
            <tbody>${weekData.map(d => {
              const style = isToday(d.date) ? ' style="color:var(--accent);font-weight:700"' : '';
              return `<tr${style}><td>${dayName(d.date).slice(0,3)} ${formatDate(d.date)}</td><td>${d.total}</td><td style="color:var(--green)">${d.done}</td><td>${formatMinutes(d.est)}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>

        <div class="summary-card">
          <h3>⏰ Upcoming Deadlines</h3>
          ${upcoming.length === 0 ? '<div class="empty-state" style="padding:16px">No upcoming deadlines 🎉</div>' :
          `<div class="deadline-list">${upcoming.map(t => {
            const late = isPast(t.deadline); const col = categoryColor(t.category);
            return `<div class="deadline-item ${late ? 'deadline-late' : ''}"><span class="cat-dot" style="background:${col}"></span><span class="deadline-title">${escapeHtml(t.title)}</span><span class="deadline-date ${late ? 'overdue' : ''}">${formatDate(t.deadline)}</span></div>`;
          }).join('')}</div>`}
        </div>
      </div>`;
  }

  // ---- Inline Quick-Add -------------------------------------
  function startQuickAdd(btn, assignedDate) {
    const container = btn.parentElement;
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quick-add-input';
    input.placeholder = assignedDate ? 'Add task… (Enter)' : 'Add to backlog… (Enter)';
    input.maxLength = 200;
    container.appendChild(input);
    input.focus();

    let committed = false;
    function commit() {
      if (committed) return; committed = true;
      const title = input.value.trim();
      cleanup();
      if (title) {
        const task = createTask({ title, assignedDate: assignedDate || null });
        Storage.addTask(task);
        render();
        openEditModal(task.id);
      } else { render(); }
    }
    function cancel() { if (committed) return; committed = true; cleanup(); }
    function cleanup() { if (document.body.contains(input)) input.remove(); btn.style.display = ''; }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (!committed) commit(); }, 150); });
  }

  function startBacklogQuickAdd(btn) { startQuickAdd(btn, null); }

  // ---- Modal (edit only) ------------------------------------
  let editingTaskId = null;

  function openEditModal(taskId) {
    const task = Storage.getAllTasks().find(t => t.id === taskId);
    if (!task) return;
    editingTaskId = taskId;
    updateCategoryDatalist();
    const modal = document.getElementById('task-modal');
    document.getElementById('modal-title').textContent = 'Edit Task';
    document.getElementById('task-title-input').value = task.title;
    document.getElementById('task-assigned-date').value = task.assignedDate || '';
    document.getElementById('task-deadline').value = task.deadline || '';
    document.getElementById('task-estimate').value = task.estimateMinutes || '';
    document.getElementById('task-category-input').value = task.category || '';
    modal.classList.add('open');
    document.getElementById('task-title-input').focus();
  }

  function closeModal() {
    document.getElementById('task-modal').classList.remove('open');
    editingTaskId = null;
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('task-title-input').value.trim();
    if (!title) return;
    if (editingTaskId) {
      Storage.updateTask(editingTaskId, {
        title,
        assignedDate: document.getElementById('task-assigned-date').value || null,
        deadline: document.getElementById('task-deadline').value || null,
        estimateMinutes: parseInt(document.getElementById('task-estimate').value) || 0,
        category: document.getElementById('task-category-input').value.trim(),
      });
    }
    closeModal();
    render();
  }

  function renderTimerBadge(task) {
    const actual = getActualMinutes(task);
    if (!actual && !task.timerStartedAt) return '';
    const running = isTimerRunning(task);
    const est = task.estimateMinutes || 0;
    let cls = 'task-timer-badge';
    if (running) cls += ' timer-running';
    if (est && actual > est) cls += ' timer-over';
    const display = formatTimer(actual);
    const vs = est ? ` / ${formatMinutes(est)}` : '';
    return `<span class="${cls}"><span class="task-timer-display">${display}</span>${vs}</span>`;
  }

  // ---- Actions ----------------------------------------------
  function toggleDone(id) {
    const task = Storage.getAllTasks().find(t => t.id === id);
    if (!task) return;
    const updates = { done: !task.done, completedAt: !task.done ? new Date().toISOString() : null };
    // Stop timer when marking done
    if (!task.done && task.timerStartedAt) {
      const elapsed = (Date.now() - new Date(task.timerStartedAt).getTime()) / 60000;
      updates.actualMinutes = (task.actualMinutes || 0) + elapsed;
      updates.timerStartedAt = null;
    }
    Storage.updateTask(id, updates);
    render();
  }

  function confirmDelete(id) {
    const task = Storage.getAllTasks().find(t => t.id === id);
    if (!task) return;
    if (confirm(`Delete "${task.title}"?`)) { Storage.deleteTask(id); render(); }
  }

  // ---- Search -----------------------------------------------
  function handleSearch(query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll('.task-card').forEach(card => {
      const title = card.querySelector('.task-title')?.textContent.toLowerCase() || '';
      const cat = card.querySelector('.task-category')?.textContent.toLowerCase() || '';
      card.style.display = (!q || title.includes(q) || cat.includes(q)) ? '' : 'none';
    });
  }

  // ---- Export / Import --------------------------------------
  function exportTasks() {
    const blob = new Blob([Storage.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `todo-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importTasks() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try { Storage.importData(ev.target.result); render(); showToast('Data imported!'); }
        catch { showToast('Invalid file', 'error'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ---- Toast ------------------------------------------------
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }

  // ---- Keyboard shortcuts -----------------------------------
  function initKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'n' && !e.ctrlKey && !isInputFocused()) {
        e.preventDefault();
        const btn = document.querySelector('.day-column.is-today .quick-add .add-task-btn');
        if (btn) btn.click();
      }
      if (e.key === 'ArrowLeft' && !isInputFocused()) shiftWeek(-1);
      if (e.key === 'ArrowRight' && !isInputFocused()) shiftWeek(1);
    });
  }

  function isInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  // ---- Init -------------------------------------------------
  function init() {
    render();
    initKeyboard();
    document.getElementById('task-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('task-modal').addEventListener('click', e => { if (e.target.id === 'task-modal') closeModal(); });
    document.getElementById('search-input').addEventListener('input', e => handleSearch(e.target.value));

    const backlog = document.getElementById('backlog-panel');
    backlog.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; backlog.classList.add('drag-over'); });
    backlog.addEventListener('dragleave', e => { if (!backlog.contains(e.relatedTarget)) backlog.classList.remove('drag-over'); });
    backlog.addEventListener('drop', handleBacklogDrop);

    startTimerTick();
    setInterval(() => { const n = new Date(); if (n.getHours() === 0 && n.getMinutes() === 0) render(); }, 60000);
    console.log('✅ TODO App initialized');
  }

  return {
    init, render, shiftWeek, goToThisWeek,
    startQuickAdd, startBacklogQuickAdd,
    openEditModal, closeModal,
    toggleDone, confirmDelete, toggleTimer, resetTimer,
    handleDragStart, handleDragEnd, handleDrop, handleBacklogDrop,
    toggleSummary,
    exportTasks, importTasks, showToast,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
