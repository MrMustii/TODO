// ============================================================
// App.js — Infinite-scroll timeline TODO app
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
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  }

  function dayNameLong(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  }

  function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatMonthYear(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function isToday(dateStr) { return dateStr === today(); }
  function isPast(dateStr) { return dateStr < today(); }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return toLocalDateStr(d);
  }

  function isMonday(dateStr) {
    return new Date(dateStr + 'T12:00:00').getDay() === 1;
  }

  // Returns the Monday of the week containing dateStr
  function getMonday(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay(); // 0=Sun, 1=Mon, ...
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return toLocalDateStr(d);
  }

  // ---- Week name storage (localStorage) --------------------
  function getWeekName(mondayDate) {
    try {
      const stored = JSON.parse(localStorage.getItem('weekNames') || '{}');
      return stored[mondayDate] || null;
    } catch { return null; }
  }

  function setWeekName(mondayDate, name) {
    try {
      const stored = JSON.parse(localStorage.getItem('weekNames') || '{}');
      if (name) stored[mondayDate] = name;
      else delete stored[mondayDate];
      localStorage.setItem('weekNames', JSON.stringify(stored));
    } catch {}
  }

  // ---- Day colour storage ----------------------------------
  function getDayColor(date) {
    try {
      const stored = JSON.parse(localStorage.getItem('dayColors') || '{}');
      return stored[date] || null;
    } catch { return null; }
  }

  function setDayColor(date, color) {
    try {
      const stored = JSON.parse(localStorage.getItem('dayColors') || '{}');
      if (color) stored[date] = color;
      else delete stored[date];
      localStorage.setItem('dayColors', JSON.stringify(stored));
    } catch {}
  }

  function isoWeekNumber(mondayDate) {
    // ISO 8601: week containing the Thursday; weeks start Monday
    const d = new Date(mondayDate + 'T12:00:00');
    d.setDate(d.getDate() + 3); // Thursday of this week
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function defaultWeekLabel(mondayDate) {
    return `Week ${isoWeekNumber(mondayDate)}`;
  }

  function getMonthOf(dateStr) {
    return dateStr.substring(0, 7); // "YYYY-MM"
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
  function createTask({ title, assignedDate = null, deadline = null, category = '', recurrence = '' } = {}) {
    return {
      id: uuid(),
      title,
      assignedDate,
      deadline,
      category,
      recurrence: recurrence || '',
      sortOrder: Date.now(),
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
  }

  // ---- State ------------------------------------------------
  let activeSidebarTab = 'deadlines';

  // Timeline state: which date range is currently rendered
  let timelineStartDate = null; // earliest date rendered
  let timelineEndDate = null;   // latest date rendered
  const INITIAL_DAYS_BEFORE = 14; // render 2 weeks before today
  const INITIAL_DAYS_AFTER = 28;  // render 4 weeks after today
  const LOAD_MORE_DAYS = 14;      // add 2 weeks on scroll edge
  const SCROLL_THRESHOLD = 300;   // px from edge to trigger load

  // Click-drag scrolling
  let isDraggingScroll = false;
  let dragScrollStartX = 0;
  let dragScrollLeft = 0;

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
      .filter(t => {
        // Tasks with deadlines belong in Deadlines tab, NOT backlog
        if (t.deadline) return false;
        // Unassigned tasks, or past-due assigned tasks without a deadline
        return !t.assignedDate || (!t.done && t.assignedDate && isPast(t.assignedDate));
      })
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
  }

  function getDeadlineTasks() {
    return Storage.getAllTasks()
      .filter(t => !t.done && t.deadline)
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
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

  // ---- Quick-add input parser (#category support) -----------
  function parseQuickAdd(text) {
    const catMatch = text.match(/#(\S+)\s*$/);
    let category = '';
    let title = text;
    if (catMatch) {
      category = catMatch[1];
      title = text.replace(/#\S+\s*$/, '').trim();
    }
    return { title, category };
  }

  // ---- Recurrence -------------------------------------------
  function getNextRecurrenceDate(task) {
    const base = task.assignedDate || today();
    switch (task.recurrence) {
      case 'daily':
        return addDays(base, 1);
      case 'weekdays': {
        let next = addDays(base, 1);
        while (true) {
          const day = new Date(next + 'T12:00:00').getDay();
          if (day !== 0 && day !== 6) return next;
          next = addDays(next, 1);
        }
      }
      case 'weekly':
        return addDays(base, 7);
      case 'monthly': {
        const d = new Date(base + 'T12:00:00');
        d.setMonth(d.getMonth() + 1);
        return toLocalDateStr(d);
      }
      default:
        return null;
    }
  }

  function handleRecurrence(task) {
    if (!task.recurrence) return;
    const nextDate = getNextRecurrenceDate(task);
    if (!nextDate) return;
    let newDeadline = null;
    if (task.deadline && task.assignedDate) {
      const gapMs = new Date(task.deadline + 'T00:00:00') - new Date(task.assignedDate + 'T00:00:00');
      const gapDays = Math.round(gapMs / 86400000);
      newDeadline = addDays(nextDate, gapDays);
    } else if (task.deadline) {
      newDeadline = task.deadline;
    }
    const newTask = createTask({
      title: task.title,
      assignedDate: nextDate,
      deadline: newDeadline,
      category: task.category,
      recurrence: task.recurrence,
    });
    Storage.addTask(newTask).then(() => {
      showToast(`🔄 Next: ${formatDate(nextDate)}`);
    });
  }

  function recurrenceLabel(type) {
    switch (type) {
      case 'daily': return 'Daily';
      case 'weekdays': return 'Weekdays';
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      default: return '';
    }
  }

  // ---- Drag & Drop ------------------------------------------
  let draggedTaskId = null;

  function handleDragStart(e, taskId) {
    draggedTaskId = taskId;
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    const card = e.target.closest('.task-card, .deadline-task-item');
    if (card) card.classList.add('dragging');
    // Disable click-drag-scroll while dragging a task
    isDraggingScroll = false;
  }

  function handleDragEnd(e) {
    const card = e.target.closest('.task-card, .deadline-task-item');
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
    Storage.saveTasks(tasks).then(() => {
      draggedTaskId = null;
      refreshTimeline();
    });
  }

  function handleBacklogDrop(e) {
    e.preventDefault();
    document.getElementById('backlog-panel')?.classList.remove('drag-over');
    if (!draggedTaskId) return;

    const tasks = Storage.getAllTasks();
    const dragged = tasks.find(t => t.id === draggedTaskId);
    if (!dragged) return;

    // Figure out drop position within backlog list
    const backlogContainer = document.getElementById('backlog-tasks');
    const cards = backlogContainer ? [...backlogContainer.querySelectorAll('.task-card:not(.dragging)')] : [];
    const mouseY = e.clientY;
    let insertIdx = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (mouseY < rect.top + rect.height / 2) { insertIdx = i; break; }
    }

    // Get current backlog tasks for sort order calculation
    const backlog = getBacklogTasks().filter(t => t.id !== draggedTaskId);
    if (backlog.length === 0) {
      dragged.sortOrder = Date.now();
    } else if (insertIdx === 0) {
      dragged.sortOrder = (backlog[0].sortOrder || 0) - 1000;
    } else if (insertIdx >= backlog.length) {
      dragged.sortOrder = (backlog[backlog.length - 1].sortOrder || 0) + 1000;
    } else {
      dragged.sortOrder = ((backlog[insertIdx - 1].sortOrder || 0) + (backlog[insertIdx].sortOrder || 0)) / 2;
    }

    dragged.assignedDate = null;
    Storage.saveTasks(tasks).then(() => {
      draggedTaskId = null;
      refreshTimeline();
    });
  }

  // ---- Day colour picker -----------------------------------
  function getDayColorPalette() {
    // Always include red, then one entry per category
    const red = '#e74c3c';
    const entries = [{ color: red, label: 'Red' }];
    const seenColors = new Set([red]);
    getAllCategories().forEach(cat => {
      const c = categoryColor(cat);
      if (!seenColors.has(c)) { seenColors.add(c); entries.push({ color: c, label: cat }); }
      else {
        // Same color already in list — just attach label to existing entry if it's 'Red'
        const existing = entries.find(e => e.color === c);
        if (existing && existing.label === 'Red') existing.label = cat;
      }
    });
    return entries;
  }

  function openDayColorPicker(e, date) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();

    // Remove any existing picker
    document.getElementById('day-color-picker')?.remove();

    const current = getDayColor(date);
    const picker = document.createElement('div');
    picker.id = 'day-color-picker';
    picker.className = 'day-color-picker';

    const palette = getDayColorPalette();
    const swatches = palette.map(({ color, label }) => {
      const active = color === current ? ' active' : '';
      return `<button class="dcp-swatch${active}" data-color="${color}">
        <span class="dcp-dot" style="background:${color}"></span>
        <span class="dcp-label">${escapeHtml(label)}</span>
      </button>`;
    }).join('');

    picker.innerHTML = `
      <div class="dcp-swatches">${swatches}</div>
      <button class="dcp-clear" ${!current ? 'disabled' : ''}>✕ Clear</button>
    `;

    // Position near clicked day header
    document.body.appendChild(picker);
    const rect = e.currentTarget.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left;
    // Keep on screen
    if (left + 160 > window.innerWidth) left = window.innerWidth - 168;
    if (top + 200 > window.innerHeight) top = rect.top - picker.offsetHeight - 6;
    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;

    function applyColor(color) {
      setDayColor(date, color);
      const col = document.querySelector(`.day-column[data-date="${date}"]`);
      if (col) {
        if (color) {
          col.style.setProperty('--day-color', color);
          col.classList.add('has-day-color');
        } else {
          col.style.removeProperty('--day-color');
          col.classList.remove('has-day-color');
        }
      }
      picker.remove();
    }

    picker.querySelectorAll('.dcp-swatch').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); applyColor(btn.dataset.color); });
    });
    picker.querySelector('.dcp-clear').addEventListener('click', e => { e.stopPropagation(); applyColor(null); });

    function outside(ev) {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', outside, true); }
    }
    setTimeout(() => document.addEventListener('click', outside, true), 0);
  }

  // ---- Timeline: Infinite Scroll ----------------------------

  function buildDayColumnHTML(date) {
    const tasks = getTasksForDate(date);
    const doneCount = tasks.filter(t => t.done).length;

    // Deadline tags in header
    const allTasks = Storage.getAllTasks();
    const deadlinesHere = allTasks.filter(t => t.deadline === date && !t.done);
    const hasDeadline = deadlinesHere.length > 0;
    const deadlineTagsHtml = hasDeadline
      ? `<div class="day-deadline-tags">${deadlinesHere.map(t =>
          `<span class="day-deadline-tag ${isPast(date) ? 'overdue' : ''}" title="${escapeHtml(t.title)}">📅 ${escapeHtml(t.title.length > 18 ? t.title.slice(0, 16) + '…' : t.title)}</span>`
        ).join('')}</div>` : '';

    const dayColor = getDayColor(date);
    const dayColorStyle = dayColor ? ` style="--day-color:${dayColor}"` : '';
    const dayColorClass = dayColor ? ' has-day-color' : '';

    return `<div class="day-column ${isToday(date) ? 'is-today' : ''} ${isPast(date) ? 'is-past' : ''} ${hasDeadline ? 'has-deadline' : ''}${dayColorClass}"
         data-date="${date}"${dayColorStyle}
         ondragover="event.preventDefault(); event.dataTransfer.dropEffect='move'; this.classList.add('drag-over')"
         ondragleave="if(!this.contains(event.relatedTarget)) this.classList.remove('drag-over')"
         ondrop="App.handleDrop(event, '${date}')">
      <div class="day-header" onclick="App.openDayColorPicker(event,'${date}')">
        <div class="day-header-top">
          <span class="day-name">${dayName(date)}</span>
          <span class="day-count">${doneCount}/${tasks.length}</span>
        </div>
        <div class="day-date-row">
          <span class="day-date">${formatDate(date)}</span>
          ${deadlineTagsHtml}
        </div>
      </div>
      <div class="day-tasks">${tasks.map(t => renderTaskCard(t)).join('')}</div>
      <div class="quick-add" data-date="${date}">
        <button class="add-task-btn" onclick="App.startQuickAdd(this,'${date}')" title="Add task">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>`;
  }

  // ---- Week block builder ---------------------------------
  function buildWeekBlockHTML(mondayDate) {
    const weekName = getWeekName(mondayDate);
    const label = weekName || defaultWeekLabel(mondayDate);

    let daysHtml = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(mondayDate, i);
      // Month separator before the 1st of each month
      if (new Date(d + 'T12:00:00').getDate() === 1) {
        daysHtml += `<div class="month-separator"><span>${formatMonthYear(d)}</span></div>`;
      }
      daysHtml += buildDayColumnHTML(d);
    }

    return `<div class="week-block" data-week="${mondayDate}">
      <div class="week-header">
        <span class="week-title" onclick="App.editWeekTitle('${mondayDate}')">${escapeHtml(label)}</span>
      </div>
      <div class="week-days">${daysHtml}</div>
    </div>`;
  }

  // ---- Week title inline editor ----------------------------
  function editWeekTitle(mondayDate) {
    const weekBlock = document.querySelector(`.week-block[data-week="${mondayDate}"]`);
    if (!weekBlock) return;
    const titleEl = weekBlock.querySelector('.week-title');
    if (!titleEl || titleEl.querySelector('input')) return;

    const currentName = getWeekName(mondayDate);
    const defaultLabel = defaultWeekLabel(mondayDate);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'week-title-input';
    input.value = currentName || '';
    input.placeholder = defaultLabel;
    input.maxLength = 60;

    titleEl.innerHTML = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();

    let committed = false;

    function commit() {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      setWeekName(mondayDate, newName);
      titleEl.textContent = newName || defaultLabel;
    }

    function cancel() {
      if (committed) return;
      committed = true;
      titleEl.textContent = currentName || defaultLabel;
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
  }

  function initTimeline() {
    const timeline = document.getElementById('timeline');
    const todayStr = today();
    // Align start to the Monday of the week that is INITIAL_DAYS_BEFORE days before today
    timelineStartDate = getMonday(addDays(todayStr, -INITIAL_DAYS_BEFORE));
    // Align end to the Sunday of the week that is INITIAL_DAYS_AFTER days after today
    timelineEndDate = addDays(getMonday(addDays(todayStr, INITIAL_DAYS_AFTER)), 6);

    let html = '';
    let d = timelineStartDate;
    while (d <= timelineEndDate) {
      html += buildWeekBlockHTML(d);
      d = addDays(d, 7);
    }
    timeline.innerHTML = html;

    // Scroll to today
    requestAnimationFrame(() => scrollToToday(false));

    // Set up infinite scroll listeners
    timeline.addEventListener('scroll', handleTimelineScroll);

    // Set up click-drag scrolling
    timeline.addEventListener('mousedown', onDragScrollStart);
    window.addEventListener('mousemove', onDragScrollMove);
    window.addEventListener('mouseup', onDragScrollEnd);
  }

  function scrollToToday(smooth = true) {
    const timeline = document.getElementById('timeline');
    const todayCol = timeline.querySelector('.day-column.is-today');
    if (todayCol) {
      const containerRect = timeline.getBoundingClientRect();
      const colRect = todayCol.getBoundingClientRect();
      const scrollTarget = timeline.scrollLeft + (colRect.left - containerRect.left) - (containerRect.width / 2) + (colRect.width / 2);
      if (smooth) {
        timeline.scrollTo({ left: scrollTarget, behavior: 'smooth' });
      } else {
        timeline.scrollLeft = scrollTarget;
      }
    }
  }

  let scrollTicking = false;
  function handleTimelineScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      const timeline = document.getElementById('timeline');
      const sl = timeline.scrollLeft;
      const sw = timeline.scrollWidth;
      const cw = timeline.clientWidth;

      // Near left edge → prepend days
      if (sl < SCROLL_THRESHOLD) {
        prependDays(LOAD_MORE_DAYS);
      }

      // Near right edge → append days
      if (sw - sl - cw < SCROLL_THRESHOLD) {
        appendDays(LOAD_MORE_DAYS);
      }

      scrollTicking = false;
    });
  }

  function prependDays(count) {
    const timeline = document.getElementById('timeline');
    const oldScrollWidth = timeline.scrollWidth;
    const oldScrollLeft = timeline.scrollLeft;

    const weeks = Math.max(1, Math.ceil(count / 7));
    // timelineStartDate is always a Monday; prepend weeks BEFORE it
    const firstNewMonday = addDays(timelineStartDate, -weeks * 7);
    let html = '';
    for (let i = 0; i < weeks; i++) {
      html += buildWeekBlockHTML(addDays(firstNewMonday, i * 7));
    }
    timelineStartDate = firstNewMonday;
    timeline.insertAdjacentHTML('afterbegin', html);

    // Maintain scroll position
    const newScrollWidth = timeline.scrollWidth;
    timeline.scrollLeft = oldScrollLeft + (newScrollWidth - oldScrollWidth);
  }

  function appendDays(count) {
    const timeline = document.getElementById('timeline');
    const weeks = Math.max(1, Math.ceil(count / 7));
    // timelineEndDate is always a Sunday; next Monday starts new week
    const firstNewMonday = addDays(timelineEndDate, 1);
    let html = '';
    for (let i = 0; i < weeks; i++) {
      html += buildWeekBlockHTML(addDays(firstNewMonday, i * 7));
    }
    timelineEndDate = addDays(timelineEndDate, weeks * 7);
    timeline.insertAdjacentHTML('beforeend', html);
  }

  // Refresh all currently visible day columns without resetting scroll
  function refreshTimeline() {
    const timeline = document.getElementById('timeline');
    // Re-render each existing day column in place
    timeline.querySelectorAll('.day-column').forEach(col => {
      const date = col.dataset.date;
      if (!date) return;

      const tasks = getTasksForDate(date);
      const doneCount = tasks.filter(t => t.done).length;

      // Update tasks
      const dayTasksEl = col.querySelector('.day-tasks');
      if (dayTasksEl) {
        dayTasksEl.innerHTML = tasks.map(t => renderTaskCard(t)).join('');
      }

      // Update count
      const countEl = col.querySelector('.day-count');
      if (countEl) countEl.textContent = `${doneCount}/${tasks.length}`;

      // Update deadline tags
      const allTasks = Storage.getAllTasks();
      const deadlinesHere = allTasks.filter(t => t.deadline === date && !t.done);
      const hasDeadline = deadlinesHere.length > 0;
      col.classList.toggle('has-deadline', hasDeadline);

      let tagsContainer = col.querySelector('.day-deadline-tags');
      if (hasDeadline) {
        const tagsHtml = deadlinesHere.map(t =>
          `<span class="day-deadline-tag ${isPast(date) ? 'overdue' : ''}" title="${escapeHtml(t.title)}">📅 ${escapeHtml(t.title.length > 18 ? t.title.slice(0, 16) + '…' : t.title)}</span>`
        ).join('');
        if (tagsContainer) {
          tagsContainer.innerHTML = tagsHtml;
        } else {
          const dateRow = col.querySelector('.day-date-row');
          if (dateRow) dateRow.insertAdjacentHTML('beforeend', `<div class="day-deadline-tags">${tagsHtml}</div>`);
        }
      } else if (tagsContainer) {
        tagsContainer.remove();
      }

      // Update today / past classes
      col.classList.toggle('is-today', isToday(date));
      col.classList.toggle('is-past', isPast(date));

      // Apply / remove day color
      const dayColor = getDayColor(date);
      if (dayColor) {
        col.style.setProperty('--day-color', dayColor);
        col.classList.add('has-day-color');
      } else {
        col.style.removeProperty('--day-color');
        col.classList.remove('has-day-color');
      }
    });

    renderBacklog();
    renderDeadlines();
    updateSidebarBadges();
  }

  // ---- Click-drag scrolling ---------------------------------
  function onDragScrollStart(e) {
    // Only activate on the timeline background / day-header, not on buttons/inputs/cards
    if (e.target.closest('.task-card, .add-task-btn, .quick-add-input, button, input, a')) return;
    const timeline = document.getElementById('timeline');
    isDraggingScroll = true;
    dragScrollStartX = e.pageX;
    dragScrollLeft = timeline.scrollLeft;
    timeline.classList.add('grabbing');
    e.preventDefault();
  }

  function onDragScrollMove(e) {
    if (!isDraggingScroll) return;
    const timeline = document.getElementById('timeline');
    const dx = e.pageX - dragScrollStartX;
    timeline.scrollLeft = dragScrollLeft - dx;
  }

  function onDragScrollEnd() {
    if (!isDraggingScroll) return;
    isDraggingScroll = false;
    const timeline = document.getElementById('timeline');
    timeline.classList.remove('grabbing');
  }

  // ---- Sidebar rendering ------------------------------------
  function switchSidebarTab(tab) {
    activeSidebarTab = tab;
    document.querySelectorAll('.sidebar-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.sidebar-tab-content').forEach(panel => {
      panel.classList.remove('active');
    });
    const target = document.getElementById(tab === 'deadlines' ? 'deadlines-panel' : 'backlog-panel');
    if (target) target.classList.add('active');
  }

  function updateSidebarBadges() {
    const backlogCount = getBacklogTasks().length;
    const deadlineCount = getDeadlineTasks().length;
    const bc = document.getElementById('tab-backlog-count');
    const dc = document.getElementById('tab-deadlines-count');
    if (bc) bc.textContent = backlogCount;
    if (dc) dc.textContent = deadlineCount;
  }

  function renderBacklog() {
    const tasks = getBacklogTasks();
    const container = document.getElementById('backlog-tasks');
    container.innerHTML = tasks.length === 0
      ? '<div class="empty-state">No unassigned tasks 🎉</div>'
      : tasks.map(t => renderTaskCard(t, { isBacklog: true })).join('');
  }

  function renderDeadlines() {
    const tasks = getDeadlineTasks();
    const container = document.getElementById('deadlines-tasks');
    if (!container) return;

    if (tasks.length === 0) {
      container.innerHTML = '<div class="empty-state">No upcoming deadlines 🎉</div>';
      return;
    }

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
            ${formatDate(date)} · ${dayNameLong(date)}${isT ? ' (Today)' : ''}${late ? ' — OVERDUE' : ''}
          </div>
          ${groups[date].map(t => {
            const col = categoryColor(t.category);
            return `<div class="deadline-task-item" draggable="true"
                        ondragstart="App.handleDragStart(event,'${t.id}')"
                        ondragend="App.handleDragEnd(event)"
                        onclick="App.openEditModal('${t.id}')">
              <span class="cat-dot" style="background:${col}"></span>
              <span class="deadline-task-title">${escapeHtml(t.title)}</span>
              ${t.assignedDate ? `<span class="deadline-assigned">→ ${formatDate(t.assignedDate)}</span>` : '<span class="deadline-assigned unscheduled">unscheduled</span>'}
              <span class="deadline-drag-hint" title="Drag to a day">⠿</span>
            </div>`;
          }).join('')}
        </div>`;
    }).join('');
  }

  // ---- Task card rendering ----------------------------------
  function renderTaskCard(task, { isBacklog = false } = {}) {
    // In backlog, suppress ALL deadline-related visuals
    const late = isBacklog ? '' : latenessClass(task);
    const doneClass = task.done ? 'task-done' : '';
    const catColor = categoryColor(task.category);
    const borderStyle = task.category && !late ? `border-left:3px solid ${catColor};` : '';

    // NEVER show deadline in backlog
    const deadlineHtml = (!isBacklog && task.deadline)
      ? `<span class="task-deadline ${isPast(task.deadline) && !task.done ? 'overdue' : ''}">📅 ${formatDate(task.deadline)}</span>` : '';
    const categoryHtml = task.category
      ? `<span class="task-category" style="background:${catColor}22;color:${catColor}">${escapeHtml(task.category)}</span>` : '';
    const recurrenceHtml = task.recurrence
      ? `<span class="task-recurrence">🔄 ${recurrenceLabel(task.recurrence)}</span>` : '';

    const lateTask = isBacklog && task.assignedDate && isPast(task.assignedDate) && !task.done;
    const lateBadge = lateTask
      ? `<span class="task-late-badge">⚠ LATE — was ${formatDate(task.assignedDate)}</span>` : '';

    const metaItems = [lateBadge, deadlineHtml, recurrenceHtml, categoryHtml].filter(Boolean).join('');

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
          <button class="task-delete" onclick="App.confirmDelete('${task.id}')" title="Delete">×</button>
        </div>
        ${metaItems ? `<div class="task-meta">${metaItems}</div>` : ''}
      </div>`;
  }

  // ---- Inline Quick-Add → opens modal after creation --------
  function startQuickAdd(btn, assignedDate) {
    const container = btn.parentElement;
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quick-add-input';
    input.placeholder = 'Task name… #category (Enter)';
    input.maxLength = 200;
    container.appendChild(input);
    input.focus();

    let closed = false;

    function commit() {
      if (closed) return;
      closed = true;
      const raw = input.value.trim();
      cleanup();
      if (raw) {
        const { title, category } = parseQuickAdd(raw);
        if (title) {
          const task = createTask({ title, assignedDate, category });
          Storage.addTask(task).then(() => {
            refreshTimeline();
            // Open modal so user can set deadline / recurrence / category
            openEditModal(task.id);
          });
        }
      }
    }

    function cancel() {
      if (closed) return;
      closed = true;
      cleanup();
    }

    function cleanup() {
      if (document.body.contains(input)) input.remove();
      btn.style.display = '';
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { if (!closed) commit(); }, 150);
    });
  }

  function startBacklogQuickAdd(btn) { startQuickAdd(btn, null); }

  // ---- Modal (edit) -----------------------------------------
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
    document.getElementById('task-category-input').value = task.category || '';
    document.getElementById('task-recurrence').value = task.recurrence || '';
    modal.classList.add('open');
    document.getElementById('task-title-input').focus();
  }

  function closeModal() {
    document.getElementById('task-modal').classList.remove('open');
    editingTaskId = null;
    refreshTimeline(); // sync any changes
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
        category: document.getElementById('task-category-input').value.trim(),
        recurrence: document.getElementById('task-recurrence').value || '',
      }).then(() => closeModal());
    } else {
      closeModal();
    }
  }

  // ---- Actions ----------------------------------------------
  function toggleDone(id) {
    const task = Storage.getAllTasks().find(t => t.id === id);
    if (!task) return;
    const nowDone = !task.done;
    Storage.updateTask(id, {
      done: nowDone,
      completedAt: nowDone ? new Date().toISOString() : null,
    }).then(() => {
      if (nowDone) {
        handleRecurrence(task);
        showToast('✅ Done!');
      }
      refreshTimeline();
    });
  }

  function confirmDelete(id) {
    const task = Storage.getAllTasks().find(t => t.id === id);
    if (!task) return;
    if (confirm(`Delete "${task.title}"?`)) {
      Storage.deleteTask(id).then(() => refreshTimeline());
    }
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
      reader.onload = async (ev) => {
        try {
          await Storage.importData(ev.target.result);
          // Full re-init of timeline
          initTimeline();
          renderBacklog();
          renderDeadlines();
          updateSidebarBadges();
          showToast('Data imported!');
        } catch { showToast('Invalid file', 'error'); }
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
        const btn = document.querySelector('.day-column.is-today .quick-add .add-task-btn')
                 || document.querySelector('.day-column .quick-add .add-task-btn');
        if (btn) btn.click();
      }
    });
  }

  function isInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  // ---- Init -------------------------------------------------
  function init() {
    initTimeline();
    renderBacklog();
    renderDeadlines();
    updateSidebarBadges();
    initKeyboard();
    document.getElementById('task-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('task-modal').addEventListener('click', e => { if (e.target.id === 'task-modal') closeModal(); });
    document.getElementById('search-input').addEventListener('input', e => handleSearch(e.target.value));

    // Real-time sync: refresh UI when data changes from another device
    Storage.onChange(() => {
      refreshTimeline();
      renderBacklog();
      renderDeadlines();
      updateSidebarBadges();
    });

    // Sidebar drag-drop for backlog
    const sidebar = document.getElementById('sidebar');
    const backlog = document.getElementById('backlog-panel');
    sidebar.addEventListener('dragover', e => {
      if (activeSidebarTab !== 'backlog') switchSidebarTab('backlog');
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'; backlog.classList.add('drag-over');
    });
    sidebar.addEventListener('dragleave', e => { if (!sidebar.contains(e.relatedTarget)) backlog.classList.remove('drag-over'); });
    sidebar.addEventListener('drop', handleBacklogDrop);

    // Midnight auto-refresh
    setInterval(() => { const n = new Date(); if (n.getHours() === 0 && n.getMinutes() === 0) { initTimeline(); refreshTimeline(); } }, 60000);
    console.log('✅ TODO App initialized');
  }

  return {
    init, scrollToToday,
    startQuickAdd, startBacklogQuickAdd,
    openEditModal, closeModal,
    toggleDone, confirmDelete,
    handleDragStart, handleDragEnd, handleDrop, handleBacklogDrop,
    switchSidebarTab,
    exportTasks, importTasks, showToast,
    editWeekTitle, openDayColorPicker,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
