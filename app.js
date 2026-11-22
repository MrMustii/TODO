// ============================================================
// App.js — Infinite-scroll timeline TODO app
// ============================================================

// Android WebView shell: the native wrapper exposes window.AndroidBridge from
// page start. Flag the document (is-android) and load the phone stylesheet.
(function detectAndroidShell() {
  try {
    if (!window.AndroidBridge) return;
    document.documentElement.classList.add('is-android');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'phone.css';
    document.head.appendChild(link);
  } catch (err) {
    console.warn('Android shell detection failed:', err);
  }
})();

function isAndroidShell() {
  return document.documentElement.classList.contains('is-android');
}

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

  // "Tue, Nov 24"
  function formatDateWithDay(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

  // ---- Week name storage (delegates to Storage / Firestore) --
  function getWeekName(mondayDate) {
    return Storage.getWeekName(mondayDate);
  }

  function setWeekName(mondayDate, name) {
    Storage.setWeekName(mondayDate, name);
  }

  // ---- Day colour storage (delegates to Storage / Firestore) --
  function getDayColor(date) {
    return Storage.getDayColor(date);
  }

  function setDayColor(date, color) {
    Storage.setDayColor(date, color);
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

  // A colour picked in the edit modal (synced via Storage colour data) wins;
  // otherwise the automatic hash colour.
  function categoryColor(cat) {
    if (!cat) return 'var(--text-dim)';
    return Storage.getCategoryColor(cat) || autoCategoryColor(cat);
  }

  function autoCategoryColor(cat) {
    let hash = 0;
    for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
    return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
  }

  // ---- Task factory -----------------------------------------
  function createTask({ title, assignedDate = null, deadline = null, category = '', recurrence = '', parentId = null, importance = '', urgency = '', goalId = null, subgoalId = null, isHabit = false, habitTarget = null } = {}) {
    return {
      id: uuid(),
      title,
      assignedDate,
      deadline,
      category,
      recurrence: recurrence || '',
      parentId: parentId || null,
      importance: importance || '',
      urgency: urgency || '',
      goalId: goalId || null,
      subgoalId: subgoalId || null,
      isHabit: !!isHabit,
      habitLog: [],
      habitTarget: habitTarget || null, // { count, period: 'day'|'week' }
      archived: false,
      sortOrder: Date.now(),
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
  }

  // ---- State ------------------------------------------------
  let activeSidebarTab = 'deadlines';

  // Subtask collapse state (UI-only, not persisted)
  const collapsedTaskIds = new Set();

  function toggleTaskCollapse(id) {
    if (collapsedTaskIds.has(id)) collapsedTaskIds.delete(id);
    else collapsedTaskIds.add(id);
    // A task card (and its collapse toggle) can render in any of these —
    // the collapsed state is shared, so all of them need to reflect it.
    refreshTimeline();
    renderBacklog();
    renderArchivePanel();
    renderSidebarHabits();
    if (isGoalsPageOpen() && currentGoalId) renderGoalDetail(currentGoalId);
  }

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
  // Habits never render as normal day cards (their logs show as read-only
  // echo cards via getHabitCompletionsForDate instead).
  function getTasksForDate(date) {
    return Storage.getAllTasks()
      .filter(t => !t.archived && !t.parentId && !t.isHabit && t.assignedDate === date)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
  }

  function getBacklogTasks() {
    return Storage.getAllTasks()
      .filter(t => {
        if (t.archived || t.parentId) return false;
        // Habits have their own dedicated home (the drawer's Habits list) —
        // they'd otherwise also land here since most have no assignedDate.
        if (t.isHabit) return false;
        // Goal tasks live on their goal page — never in the Backlog.
        if (t.goalId) return false;
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
      .filter(t => !t.archived && !t.parentId && !t.done && !t.isHabit && t.deadline && !t.goalId)
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
  }

  // Undone, non-goal, non-archived, non-habit tasks due on `date` — the day
  // header's 📅 tags. Goal tasks never show as deadlines (their stored
  // deadline is kept), and neither do subtasks nested under a goal task or
  // under an archived task (walks parentId up to the top-level ancestor).
  function getDeadlinesOnDate(date) {
    const all = Storage.getAllTasks();
    const byId = new Map(all.map(t => [t.id, t]));
    const ancestorExcluded = t => {
      const seen = new Set();
      let cur = t;
      while (cur && cur.parentId && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = byId.get(cur.parentId);
        if (cur && (cur.goalId || cur.archived)) return true;
      }
      return false;
    };
    return all.filter(t => t.deadline === date && !t.done && !t.archived && !t.isHabit && !t.goalId
      && !ancestorExcluded(t));
  }

  // Importance and urgency are two independent axes — each gets its own
  // one-shot reorder, instead of being merged into one combined ranking.
  // Only touches sortOrder on the current Backlog tasks via a targeted batch
  // update (not a delete-everything-and-recreate), so it can't clobber a task
  // someone just created on another device. After this runs, the result is
  // just a normal manual order — dragging still works exactly as before.
  function sortBacklogByAxis(axis) {
    const weight = v => v === 'high' ? 2 : v === 'low' ? 1 : 0;
    const backlog = getBacklogTasks();
    const ranked = backlog
      .map((t, i) => ({ t, i, w: weight(t[axis]) }))
      .sort((a, b) => b.w - a.w || a.i - b.i);
    const entries = ranked.map((entry, idx) => {
      entry.t.sortOrder = idx * 1000;
      return { id: entry.t.id, updates: { sortOrder: entry.t.sortOrder } };
    });
    Storage.updateTaskFields(entries).then(() => {
      refreshTimeline();
      showToast(axis === 'importance' ? '⭐ Sorted by Importance' : '⚡ Sorted by Urgency');
    });
  }

  function sortBacklogByImportance() { sortBacklogByAxis('importance'); }
  function sortBacklogByUrgency() { sortBacklogByAxis('urgency'); }

  // ---- Nested tasks: children + descendant traversal --------
  function getChildTasks(parentId) {
    return Storage.getAllTasks()
      .filter(t => !t.archived && t.parentId === parentId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  // Flat list of all descendant ids (not including taskId itself).
  // Walks the in-memory cache since Firestore has no recursive query.
  // `seen` guards against a parentId cycle (e.g. two devices nesting A under
  // B and B under A at the same moment) — without it this loops forever and
  // freezes the tab.
  function getDescendantIds(taskId) {
    const all = Storage.getAllTasks();
    const result = [];
    const seen = new Set([taskId]);
    const queue = [taskId];
    while (queue.length) {
      const current = queue.shift();
      const children = all.filter(t => t.parentId === current);
      for (const child of children) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        result.push(child.id);
        queue.push(child.id);
      }
    }
    return result;
  }

  // ---- Category helpers (autocomplete) ----------------------
  // Archived categories (every task carrying the tag is archived, e.g. via
  // Archive-by-tag) are left out: getActiveCategories only lists tags that
  // still have at least one non-archived task. Unarchiving brings them back.
  function updateCategoryDatalist() {
    const dl = document.getElementById('category-datalist');
    if (!dl) return;
    dl.innerHTML = getActiveCategories().map(c => `<option value="${escapeHtml(c)}">`).join('');
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

  // Creates the next occurrence of a recurring task and returns it (or null).
  // `parentId` (default: the task's own) keeps a recurring subtask nested;
  // toggleDone passes the parent's NEW occurrence id when the parent recurs
  // too. `silent` suppresses the toast (used for cascaded subtasks).
  function handleRecurrence(task, { parentId = task.parentId, silent = false } = {}) {
    if (!task.recurrence) return null;
    const nextDate = getNextRecurrenceDate(task);
    if (!nextDate) return null;
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
      parentId,
      importance: task.importance,
      urgency: task.urgency,
      goalId: task.goalId,
      subgoalId: task.subgoalId,
    });
    Storage.addTask(newTask).then(() => {
      if (!silent) showToast(`🔄 Next: ${formatDate(nextDate)}`);
    });
    return newTask;
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

  // ---- Drag & Drop (SortableJS — works with mouse AND touch) ----
  // Shared touch tuning for every Sortable instance: a ~300ms long-press
  // starts a drag on touch (mouse is instant), and a finger that moves more
  // than 8px during that press is treated as a scroll instead.
  // fallbackOnBody keeps the touch drag-ghost out of the (transformed,
  // slide-away) drawer so it stays visible after the drawer closes mid-drag.
  // onChoose fires once the long-press completes (card gets .sortable-chosen):
  // a short buzz confirms "picked up", and the start point is recorded for
  // the drawer's sideways-pull-to-close rule (see handleTaskDragStart).
  const SORTABLE_TOUCH_OPTIONS = {
    animation: 150,
    delay: 300,
    delayOnTouchOnly: true,
    touchStartThreshold: 8,
    fallbackOnBody: true,
    ghostClass: 'dragging',
    // Auto-scroll kicks in well before the bottom edge, so it triggers
    // before the finger reaches the backlog drop strip.
    scrollSensitivity: 80,
    scrollSpeed: 12,
    onChoose: handleSortableChoose,
  };

  // clientX/Y from a mouse, pointer, drag or touch event (touches for
  // touchmove/touchstart, changedTouches for touchend). null if none.
  function eventPoint(e) {
    if (!e) return null;
    const p = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    return (typeof p.clientX === 'number' && typeof p.clientY === 'number') ? { x: p.clientX, y: p.clientY } : null;
  }

  let dragStartPoint = null;
  // When Sortable last "chose" a card (long-press completed) — a habit
  // card tap whose press was a long-press must not log (see
  // tapLogHabit). The current press start/type is tracked document-wide.
  let lastSortableChooseAt = 0;
  let pressStartAt = 0;
  let pressIsTouch = false;
  document.addEventListener('pointerdown', e => {
    pressStartAt = Date.now();
    pressIsTouch = e.pointerType === 'touch';
  }, { capture: true, passive: true });
  document.addEventListener('touchstart', () => {
    if (!pressIsTouch || Date.now() - pressStartAt > 50) pressStartAt = Date.now();
    pressIsTouch = true;
  }, { capture: true, passive: true });

  function handleSortableChoose(evt) {
    lastSortableChooseAt = Date.now();
    dragStartPoint = eventPoint(evt && evt.originalEvent);
    try { if (navigator.vibrate) navigator.vibrate(10); } catch { /* not allowed — ignore */ }
  }

  function isDragInProgress() {
    return document.body.classList.contains('task-dragging')
      || !!document.querySelector('.sortable-chosen, .sortable-fallback');
  }

  // Calendar day-columns, backlog, the habits-list drawer slot, every task's
  // own (always-rendered) children list, the goal page's task lists AND the
  // Deadlines tab all share the 'calendar-tasks' group. SortableJS fires
  // onEnd on the SOURCE list's instance, so every one of them uses the same
  // onStart/onEnd (handleTaskDragStart / handleTaskDrop), which decides
  // purely from where the card landed (evt.to) and where it came from.
  const CALENDAR_TASK_SORTABLE_OPTIONS = {
    ...SORTABLE_TOUCH_OPTIONS,
    group: 'calendar-tasks',
    filter: '.habit-completion-marker',
    preventOnFilter: false,
    onStart: handleTaskDragStart,
    onEnd: handleTaskDrop,
    // Sortable calls the SOURCE list's onMove — every source shares this.
    onMove: handleTaskDragMove,
  };

  // ---- Backlog drop strip (visible only while dragging — CSS) ----
  const BACKLOG_DROP_STRIP_ID = 'backlog-drop-strip';

  function setBacklogStripHover(on) {
    document.getElementById(BACKLOG_DROP_STRIP_ID)?.classList.toggle('drop-hover', !!on);
  }

  function handleTaskDragMove(evt) {
    setBacklogStripHover(!!evt && !!evt.to && evt.to.id === BACKLOG_DROP_STRIP_ID);
    // No return value → the move is allowed.
  }

  // A drop target only (never a source, never reordered). Its label span is
  // not a draggable item, so the dragged card is simply appended.
  function bindBacklogDropStrip() {
    const el = document.getElementById(BACKLOG_DROP_STRIP_ID);
    if (!el || el.dataset.sortableBound || typeof Sortable === 'undefined') return;
    el.dataset.sortableBound = 'true';
    // Fallback: clear the highlight when the pointer leaves the strip for a
    // non-list area (onMove only fires over another Sortable list).
    const leave = e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) setBacklogStripHover(false); };
    el.addEventListener('pointerleave', leave);
    el.addEventListener('dragleave', leave);
    Sortable.create(el, {
      ...CALENDAR_TASK_SORTABLE_OPTIONS,
      group: { name: 'calendar-tasks', pull: false, put: true },
      sort: false,
      draggable: '.task-card, .deadline-task-item',
    });
  }

  // Each container is bound once (guarded by a data attribute) since
  // infinite-scroll / re-renders keep creating new elements.
  function bindCalendarSortable(el) {
    if (!el || el.dataset.sortableBound || typeof Sortable === 'undefined') return;
    el.dataset.sortableBound = 'true';
    Sortable.create(el, CALENDAR_TASK_SORTABLE_OPTIONS);
  }

  function initCalendarSortables() {
    // Archived cards also render a .task-children (without a parent id) —
    // those are read-only, so only bind real, droppable children lists.
    document.querySelectorAll('.day-tasks, .task-children[data-parent-task-id]').forEach(bindCalendarSortable);
    bindCalendarSortable(document.getElementById('backlog-tasks'));
    bindCalendarSortable(document.getElementById('sidebar-habits-list'));
    bindBacklogDropStrip();
  }

  // Deadline items are drag sources only: dragging one onto a day column
  // schedules it (sets assignedDate). pull:'clone' leaves the list intact
  // while dragging; handleTaskDrop removes the dropped copy and re-renders.
  function bindDeadlineSortable(el) {
    if (!el || el.dataset.sortableBound || typeof Sortable === 'undefined') return;
    el.dataset.sortableBound = 'true';
    Sortable.create(el, {
      ...CALENDAR_TASK_SORTABLE_OPTIONS,
      group: { name: 'calendar-tasks', pull: 'clone', put: false },
      sort: false,
      draggable: '.deadline-task-item',
    });
  }

  // ---- Drawer behaviour while dragging --------------------------
  // The drawer + its backdrop cover the calendar. While any task drag is in
  // progress the backdrop ignores pointer events (CSS: body.task-dragging).
  // A drag that starts in the drawer closes it so the day columns are
  // reachable (on a phone the drawer is full-screen, so this is the only way
  // the calendar is visible at all): Deadlines items close it immediately
  // (scheduling is their only drag purpose); backlog/habits drags close it
  // once the finger/pointer has been pulled sideways more than
  // DRAWER_PULL_CLOSE_PX from where the drag started. Purely vertical
  // movement is a normal reorder/nest inside the list; the drawer stays open.
  // Movement is read from document-level listeners (capture, passive):
  // touchmove (Sortable's touch fallback), pointermove/mousemove, and
  // dragover (desktop native HTML5 drag, where mouse/pointer moves don't fire).
  const DRAWER_PULL_CLOSE_PX = 60;
  const DRAWER_PULL_EVENTS = ['pointermove', 'touchmove', 'mousemove', 'dragover'];
  let drawerPullWatcher = null;

  function collapseSidebar() {
    document.getElementById('app-container')?.classList.add('sidebar-collapsed');
  }

  function stopDrawerPullWatch() {
    if (!drawerPullWatcher) return;
    DRAWER_PULL_EVENTS.forEach(type => document.removeEventListener(type, drawerPullWatcher, true));
    drawerPullWatcher = null;
  }

  function startDrawerPullWatch(startPoint) {
    stopDrawerPullWatch();
    let startX = startPoint ? startPoint.x : null;
    drawerPullWatcher = e => {
      const point = eventPoint(e);
      if (!point) return;
      // dragover can report 0,0 on some browsers at drag end — ignore it.
      if (e.type === 'dragover' && point.x === 0 && point.y === 0) return;
      if (startX === null) { startX = point.x; return; }
      // Absolute distance: works whichever side the drawer is docked on
      // (left on desktop, right on Android via phone.css).
      if (Math.abs(point.x - startX) >= DRAWER_PULL_CLOSE_PX) {
        collapseSidebar();
        stopDrawerPullWatch();
      }
    };
    DRAWER_PULL_EVENTS.forEach(type =>
      document.addEventListener(type, drawerPullWatcher, { capture: true, passive: true }));
  }

  function handleTaskDragStart(evt) {
    document.body.classList.add('task-dragging');
    const startPoint = dragStartPoint || eventPoint(evt && evt.originalEvent);
    dragStartPoint = null;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !evt.from || !sidebar.contains(evt.from)) return;
    if (evt.from.classList.contains('deadline-group')) collapseSidebar();
    else startDrawerPullWatch(startPoint);
  }

  // When the last drag (task or subgoal) ended — the click that some
  // browsers fire right after a drop must not count as "tap outside".
  let lastDragEndAt = 0;

  function endTaskDrag() {
    document.body.classList.remove('task-dragging');
    setBacklogStripHover(false);
    stopDrawerPullWatch();
    lastDragEndAt = Date.now();
  }

  function siblingSortOrder(container, item) {
    // Habit echo cards carry a data-task-id but no sort order and always sit
    // after the real tasks — they are not siblings for ordering purposes.
    // Lists render undone-first, then by sortOrder within each group, so a
    // card across the undone/done boundary is not a sortOrder neighbour —
    // only same-done-state siblings count. With no same-state neighbour on
    // one side, the card lands at that end of its own group.
    const isDone = el => el.classList.contains('task-done');
    const itemDone = isDone(item);
    const siblings = [...container.children].filter(el =>
      el.dataset && el.dataset.taskId && !el.classList.contains('habit-completion-marker')
      && (el === item || isDone(el) === itemDone));
    return midpointSortOrder(siblings, item);
  }

  // New sortOrder for `item` from its DOM neighbours' data-sort-order
  // within `siblings` (an ordered list of elements that includes `item`).
  function midpointSortOrder(siblings, item) {
    const idx = siblings.indexOf(item);
    const prev = siblings[idx - 1];
    const next = siblings[idx + 1];
    if (!prev && !next) return Date.now();
    if (!prev) return (parseFloat(next.dataset.sortOrder) || 0) - 1000;
    if (!next) return (parseFloat(prev.dataset.sortOrder) || 0) + 1000;
    return ((parseFloat(prev.dataset.sortOrder) || 0) + (parseFloat(next.dataset.sortOrder) || 0)) / 2;
  }

  // Re-render every surface a task card can live on, so the DOM can never
  // stay out of sync with the data after a drop (handled or not).
  function rerenderTaskSurfaces() {
    refreshTimeline(); // also backlog, deadlines, badges, sortable binding
    renderSidebarHabits();
    if (isGoalsPageOpen() && currentGoalId) renderGoalDetail(currentGoalId);
  }

  // Toast for a task dropped into the Backlog (list or drop strip).
  function unscheduleToastMessage(task) {
    if (task.goalId) {
      const goal = Storage.getAllGoals().find(g => g.id === task.goalId);
      return goal ? `Unscheduled — still in goal “${goal.title}”` : 'Unscheduled — still in its goal';
    }
    if (task.deadline) return 'Unscheduled — still in Deadlines';
    return 'Moved to Backlog';
  }

  // The ONE onEnd handler for everything in the 'calendar-tasks' group.
  function handleTaskDrop(evt) {
    endTaskDrag();
    const item = evt.item;
    const from = evt.from;
    const to = evt.to;
    const isClone = evt.pullMode === 'clone';

    // Dropped back where it started — the DOM didn't change.
    if (to === from && evt.oldIndex === evt.newIndex) return;

    const taskId = item?.dataset?.taskId;
    const task = taskId ? Storage.getAllTasks().find(t => t.id === taskId) : null;

    const fromDeadlines = from.classList.contains('deadline-group');
    const fromHabitsList = from.id === 'sidebar-habits-list';
    const toHabitsList = to.id === 'sidebar-habits-list';
    const toChildrenList = to.classList.contains('task-children') ? to : null;
    const toDayColumn = to.classList.contains('day-tasks') ? to.closest('.day-column') : null;
    const toBacklog = to.id === 'backlog-tasks';
    const toBacklogStrip = to.id === BACKLOG_DROP_STRIP_ID;
    const toSubgoalList = to.classList.contains('subgoal-tasks') ? to : null;
    const toGoalDirectZone = to.classList.contains('goal-direct-tasks-zone') ? to : null;

    const sortOrder = siblingSortOrder(to, item);
    // A clone-pull (Deadlines) leaves a copy behind in the source list; the
    // dragged element itself must not linger in the target list. The drop
    // strip never keeps a card either (the re-render puts it where it belongs).
    if ((isClone || toBacklogStrip) && item.parentNode) item.remove();

    if (!task) { rerenderTaskSurfaces(); return; }

    let updates = null;
    let afterWrite = null;

    if (toBacklog || toBacklogStrip) {
      // Same rules for the strip and the real Backlog list: unschedule +
      // un-nest; goal tasks stay in their goal (never shown in Backlog),
      // deadline tasks stay in Deadlines. Habits snap back.
      if (!task.isHabit) {
        updates = { assignedDate: null, parentId: null };
        if (toBacklog) updates.sortOrder = sortOrder;
        // A plain reorder inside the Backlog list isn't worth a toast.
        if (from !== to) {
          const message = unscheduleToastMessage(task);
          afterWrite = () => showToast(message);
        }
      }
    } else if (fromDeadlines) {
      // Deadline items can only be scheduled onto a day.
      if (toDayColumn) updates = { assignedDate: toDayColumn.dataset.date, sortOrder };
    } else if (toHabitsList) {
      // The habits list only ever holds habit tasks — anything else snaps back.
      if (task.isHabit) updates = { sortOrder };
    } else if (toDayColumn) {
      if (fromHabitsList && task.isHabit) {
        // Dragging a habit out of its habits-list slot onto a day logs that
        // day; the card itself stays in the habits list.
        logHabitOnDate(taskId, toDayColumn.dataset.date);
        rerenderTaskSurfaces();
        return;
      }
      // Keeps any goal/subgoal link.
      updates = { assignedDate: toDayColumn.dataset.date, parentId: null, sortOrder };
    } else if (toChildrenList) {
      const newParentId = toChildrenList.dataset.parentTaskId;
      if (newParentId && newParentId !== taskId && !getDescendantIds(taskId).includes(newParentId)) {
        updates = { parentId: newParentId, sortOrder };
      }
    } else if (toSubgoalList || toGoalDirectZone) {
      const goalId = toSubgoalList ? toSubgoalList.dataset.goalId : toGoalDirectZone.dataset.goalId;
      const subgoalId = toSubgoalList ? toSubgoalList.dataset.subgoalId : null;
      if (goalId) {
        // Goal lists only show top-level tasks, so a nested task dropped
        // here is promoted out of its parent (or it would vanish).
        updates = { goalId, subgoalId, parentId: null, sortOrder };
        afterWrite = () => touchForNewGoalTask(goalId, subgoalId);
      }
    }

    if (!updates) { rerenderTaskSurfaces(); return; }

    Storage.updateTask(taskId, updates).then(() => {
      if (afterWrite) afterWrite();
      rerenderTaskSurfaces();
    });
  }

  // ---- Day colour picker -----------------------------------
  function getDayColorPalette() {
    // Always include red, then one entry per non-archived category
    const red = '#e74c3c';
    const entries = [{ color: red, label: 'Red' }];
    const seenColors = new Set([red]);
    getActiveCategories().forEach(cat => {
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

  // Desktop: Ctrl/Cmd+click on a day header (inline onclick). Touch: a
  // long-press on the header (see initDayHeaderLongPress).
  function openDayColorPicker(e, date) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    showDayColorPicker(e.currentTarget, date);
  }

  function isDayColorPickerOpen() {
    return !!document.getElementById('day-color-picker');
  }

  // Removes the picker AND its outside-click listener.
  function closeDayColorPicker() {
    const picker = document.getElementById('day-color-picker');
    if (!picker) return;
    if (typeof picker._close === 'function') picker._close();
    else picker.remove();
  }

  function showDayColorPicker(anchorEl, date) {
    // Remove any existing picker
    closeDayColorPicker();

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
    const rect = anchorEl.getBoundingClientRect();
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
      close();
    }

    picker.querySelectorAll('.dcp-swatch').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); applyColor(btn.dataset.color); });
    });
    picker.querySelector('.dcp-clear').addEventListener('click', e => { e.stopPropagation(); applyColor(null); });

    function close() {
      picker.remove();
      document.removeEventListener('click', outside, true);
    }
    function outside(ev) {
      if (!picker.contains(ev.target)) close();
    }
    picker._close = close;
    setTimeout(() => { if (picker.isConnected) document.addEventListener('click', outside, true); }, 0);
  }

  // ---- Day colour on touch: long-press a day header ----------
  // ~500ms hold opens the picker; moving > 8px (a scroll) or lifting the
  // finger first cancels. The day header is not a Sortable item and the
  // timeline's drag-scroll is mouse-only, so neither interferes. The click
  // (if any) that follows the long-press, and the long-press context menu,
  // are swallowed so they don't close the picker or open a menu.
  const DAY_LONG_PRESS_MS = 500;
  const DAY_LONG_PRESS_MOVE_PX = 8;
  const DAY_LONG_PRESS_SUPPRESS_MS = 800;
  let dayLongPress = null;           // { timer, x, y, fired }
  let dayLongPressSuppressUntil = 0; // swallow click/contextmenu until then

  function cancelDayLongPress() {
    if (!dayLongPress) return;
    clearTimeout(dayLongPress.timer);
    if (dayLongPress.fired) dayLongPressSuppressUntil = Date.now() + DAY_LONG_PRESS_SUPPRESS_MS;
    dayLongPress = null;
  }

  function initDayHeaderLongPress() {
    const timeline = document.getElementById('timeline');
    if (!timeline || timeline.dataset.longPressBound) return;
    timeline.dataset.longPressBound = 'true';

    // A new touch anywhere ends the previous long-press's suppression window
    // (that only exists to swallow the long-press's own release click), so a
    // fresh tap right after the picker opens isn't swallowed.
    window.addEventListener('touchstart', () => { dayLongPressSuppressUntil = 0; }, { capture: true, passive: true });

    timeline.addEventListener('touchstart', e => {
      cancelDayLongPress();
      dayLongPressSuppressUntil = 0;
      if (!e.touches || e.touches.length !== 1) return;
      const header = e.target.closest && e.target.closest('.day-header');
      const date = header && header.closest('.day-column')?.dataset.date;
      if (!header || !date) return;
      const t = e.touches[0];
      const state = { x: t.clientX, y: t.clientY, fired: false, timer: null };
      state.timer = setTimeout(() => {
        if (dayLongPress !== state || !header.isConnected) return;
        state.fired = true;
        dayLongPressSuppressUntil = Date.now() + DAY_LONG_PRESS_SUPPRESS_MS;
        showDayColorPicker(header, date);
      }, DAY_LONG_PRESS_MS);
      dayLongPress = state;
    }, { passive: true });

    timeline.addEventListener('touchmove', e => {
      if (!dayLongPress || dayLongPress.fired) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - dayLongPress.x) > DAY_LONG_PRESS_MOVE_PX
          || Math.abs(t.clientY - dayLongPress.y) > DAY_LONG_PRESS_MOVE_PX) {
        cancelDayLongPress();
      }
    }, { passive: true });

    timeline.addEventListener('touchend', cancelDayLongPress, { passive: true });
    timeline.addEventListener('touchcancel', cancelDayLongPress, { passive: true });

    timeline.addEventListener('contextmenu', e => {
      if (!e.target.closest || !e.target.closest('.day-header')) return;
      if (dayLongPress || Date.now() < dayLongPressSuppressUntil) e.preventDefault();
    });

    // Window capture runs before the picker's document-capture outside-click
    // listener, so stopping here keeps the just-opened picker open.
    window.addEventListener('click', e => {
      if (Date.now() >= dayLongPressSuppressUntil) return;
      if (!e.target.closest || !e.target.closest('.day-header')) return;
      dayLongPressSuppressUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  // ---- Timeline: Infinite Scroll ----------------------------

  function buildDayColumnHTML(date) {
    const tasks = getTasksForDate(date);
    const doneCount = tasks.filter(t => t.done).length;
    const habitCompletions = getHabitCompletionsForDate(date, new Set(tasks.map(t => t.id)));

    // Deadline tags in header
    const deadlinesHere = getDeadlinesOnDate(date);
    const hasDeadline = deadlinesHere.length > 0;
    const deadlineTagsHtml = hasDeadline
      ? `<div class="day-deadline-tags">${deadlinesHere.map(t =>
          `<span class="day-deadline-tag ${isPast(date) ? 'overdue' : ''}" title="${escapeHtml(t.title)}">📅 ${escapeHtml(t.title.length > 18 ? t.title.slice(0, 16) + '…' : t.title)}</span>`
        ).join('')}</div>` : '';

    const dayColor = getDayColor(date);
    const dayColorStyle = dayColor ? ` style="--day-color:${escapeHtml(dayColor)}"` : '';
    const dayColorClass = dayColor ? ' has-day-color' : '';

    return `<div class="day-column ${isToday(date) ? 'is-today' : ''} ${isPast(date) ? 'is-past' : ''} ${hasDeadline ? 'has-deadline' : ''}${dayColorClass}"
         data-date="${date}"${dayColorStyle}>
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
      <div class="day-tasks">${tasks.map(t => renderTaskCard(t)).join('')}${habitCompletions.map(({ task, count }) => renderHabitCompletionCard(task, count)).join('')}</div>
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
    initCalendarSortables();
    reapplySearch();

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
    initCalendarSortables();
    reapplySearch();

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
    initCalendarSortables();
    reapplySearch();
  }

  // ---- Don't rebuild a container while the user is typing in it ----
  // Task lists / the goal page are rebuilt via innerHTML on every Storage
  // snapshot, which would destroy a focused inline input (quick-add,
  // subtask/subgoal add, subgoal title edit) and its typed text. Such a
  // render is skipped and queued under `key`; it runs once focus leaves the
  // input (focusout, or the input's own cleanup). Each queued render re-checks
  // on flush, so it re-defers if focus just moved to another inline input.
  const INLINE_INPUT_SELECTOR = '.quick-add-input, .week-title-input';
  const deferredRenders = new Map();
  let deferredFlushScheduled = false;

  function isEditingInside(container) {
    const el = document.activeElement;
    return !!(container && el && el !== container && el.matches
      && el.matches(INLINE_INPUT_SELECTOR) && container.contains(el));
  }

  // True (and the render is queued) if `container` must not be rebuilt now.
  function deferIfEditing(key, container, render) {
    if (!isEditingInside(container)) return false;
    deferredRenders.set(key, render);
    return true;
  }

  // Runs after the current event so activeElement has settled.
  function flushDeferredRenders() {
    if (deferredFlushScheduled || deferredRenders.size === 0) return;
    deferredFlushScheduled = true;
    setTimeout(() => {
      deferredFlushScheduled = false;
      const pending = [...deferredRenders.values()];
      deferredRenders.clear();
      pending.forEach(render => render());
    }, 0);
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
      const habitCompletions = getHabitCompletionsForDate(date, new Set(tasks.map(t => t.id)));

      // Update tasks
      const dayTasksEl = col.querySelector('.day-tasks');
      if (dayTasksEl && !deferIfEditing('timeline', dayTasksEl, refreshTimeline)) {
        dayTasksEl.innerHTML = tasks.map(t => renderTaskCard(t)).join('') +
          habitCompletions.map(({ task, count }) => renderHabitCompletionCard(task, count)).join('');
      }

      // Update count
      const countEl = col.querySelector('.day-count');
      if (countEl) countEl.textContent = `${doneCount}/${tasks.length}`;

      // Update deadline tags
      const deadlinesHere = getDeadlinesOnDate(date);
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
    initCalendarSortables();
    reapplySearch();
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
    const targetId = tab === 'deadlines' ? 'deadlines-panel' : tab === 'backlog' ? 'backlog-panel' : 'sidebar-goals-panel';
    const target = document.getElementById(targetId);
    if (target) target.classList.add('active');
    // Storage.onGoalsChange skips re-rendering while this tab is hidden (see
    // isGoalsDrawerTabOpen), so the grid can go stale while on another tab —
    // force a fresh render whenever the goals tab becomes the active one,
    // regardless of which control switched into it.
    if (tab === 'goals') renderGoalsDashboard();
  }

  // ---- Sidebar drawer open/close (closed by default) ---------
  function toggleSidebar() {
    const app = document.getElementById('app-container');
    const opening = app.classList.contains('sidebar-collapsed');
    app.classList.toggle('sidebar-collapsed');
    // Storage snapshots skip the goals grid + habits list while the drawer is
    // collapsed (isGoalsDrawerTabOpen), so refresh them when it reopens.
    if (opening && activeSidebarTab === 'goals') renderGoalsDashboard();
  }

  function openSidebarToTab(tab) {
    document.getElementById('app-container').classList.remove('sidebar-collapsed');
    switchSidebarTab(tab);
  }

  // ---- Android: swipe the (right-docked) drawer right to close it ----
  // Once the finger has moved > DRAWER_SWIPE_DECIDE_PX, a mostly-horizontal
  // rightward move becomes a swipe (the drawer follows the finger, the
  // backdrop fades); anything else is abandoned so vertical scrolling works.
  // Never during/just after a Sortable drag or once the 300ms hold chose a
  // card, nor from inputs or a horizontal scroller that can still scroll
  // that way. Listeners are passive except a touchmove added only while a
  // swipe is active (to preventDefault). No swipe-to-open; desktop untouched.
  const DRAWER_SWIPE_DECIDE_PX = 10;
  const DRAWER_SWIPE_CLOSE_FRACTION = 0.3;
  const DRAWER_SWIPE_CLOSE_VELOCITY = 0.4; // px/ms
  const DRAWER_SWIPE_ANIM_MS = 200;        // matches .sidebar transition

  function isSidebarOpen() {
    const app = document.getElementById('app-container');
    return !!app && !app.classList.contains('sidebar-collapsed');
  }

  // An ancestor of el (up to the drawer) that scrolls horizontally and can
  // still scroll toward its start (what a rightward swipe would do).
  function inScrollerThatCanScrollRight(el, stopAt) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 1 && n.scrollLeft > 0) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      if (n === stopAt) break;
    }
    return false;
  }

  function initDrawerSwipeToClose() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (!sidebar || sidebar.dataset.swipeBound) return;
    sidebar.dataset.swipeBound = 'true';

    let swipe = null; // { x, y, t, dx, width, active, samples: [{x, t}] }
    let backdropResetTimer = null;

    const choseCardSince = t => lastSortableChooseAt >= t;
    const blocked = s => isDragInProgress() || choseCardSince(s.t);

    function clearInline() {
      sidebar.style.transform = '';
      sidebar.style.transition = '';
      if (backdrop) { backdrop.style.opacity = ''; backdrop.style.transition = ''; }
    }

    function render(s) {
      sidebar.style.transform = `translateX(${s.dx}px)`;
      if (backdrop) backdrop.style.opacity = String(Math.max(0, 1 - s.dx / s.width));
    }

    function track(s, x) {
      const now = Date.now();
      s.dx = Math.max(0, x - s.x);
      s.samples.push({ x, t: now });
      while (s.samples.length > 2 && now - s.samples[0].t > 100) s.samples.shift();
    }

    function velocity(s) {
      const a = s.samples[0], b = s.samples[s.samples.length - 1];
      return (a && b && b.t > a.t) ? (b.x - a.x) / (b.t - a.t) : 0;
    }

    function onActiveMove(e) {
      const s = swipe;
      if (!s || !s.active) return;
      if (blocked(s)) { finish(true); return; }
      const p = e.touches && e.touches[0];
      if (!p) return;
      if (e.cancelable) e.preventDefault();
      track(s, p.clientX);
      render(s);
    }

    function finish(cancelled) {
      const s = swipe;
      swipe = null;
      sidebar.removeEventListener('touchmove', onActiveMove, { passive: false });
      if (!s || !s.active) return;
      const close = !cancelled && !blocked(s)
        && (s.dx > s.width * DRAWER_SWIPE_CLOSE_FRACTION || velocity(s) > DRAWER_SWIPE_CLOSE_VELOCITY);
      // Dropping the inline transform/transition lets the stylesheet's
      // transition animate from the finger position to open or closed.
      clearInline();
      if (close) {
        collapseSidebar();
      } else if (backdrop) {
        backdrop.style.transition = `opacity ${DRAWER_SWIPE_ANIM_MS}ms ease`;
        clearTimeout(backdropResetTimer);
        backdropResetTimer = setTimeout(() => { backdrop.style.transition = ''; }, DRAWER_SWIPE_ANIM_MS + 20);
      }
    }

    sidebar.addEventListener('touchstart', e => {
      if (swipe) finish(true);
      if (!isAndroidShell() || !isSidebarOpen()) return;
      if (!e.touches || e.touches.length !== 1) return;
      if (isDragInProgress() || Date.now() - lastDragEndAt < POST_DRAG_CLICK_IGNORE_MS) return;
      const target = e.target;
      if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (inScrollerThatCanScrollRight(target, sidebar)) return;
      const p = e.touches[0];
      swipe = { x: p.clientX, y: p.clientY, t: Date.now(), dx: 0, width: 0, active: false, samples: [] };
    }, { passive: true });

    sidebar.addEventListener('touchmove', e => {
      const s = swipe;
      if (!s || s.active) return; // active moves go through onActiveMove
      const p = e.touches && e.touches[0];
      if (!p) return;
      if (blocked(s)) { swipe = null; return; }
      const dx = p.clientX - s.x;
      const dy = p.clientY - s.y;
      if (Math.abs(dx) <= DRAWER_SWIPE_DECIDE_PX && Math.abs(dy) <= DRAWER_SWIPE_DECIDE_PX) return;
      if (!(dx > 0 && Math.abs(dx) > 1.5 * Math.abs(dy))) { swipe = null; return; }
      s.active = true;
      s.width = sidebar.getBoundingClientRect().width || 1;
      clearTimeout(backdropResetTimer);
      sidebar.style.transition = 'none';
      if (backdrop) backdrop.style.transition = 'none';
      sidebar.addEventListener('touchmove', onActiveMove, { passive: false });
      track(s, p.clientX);
      render(s);
    }, { passive: true });

    sidebar.addEventListener('touchend', () => finish(false), { passive: true });
    sidebar.addEventListener('touchcancel', () => finish(true), { passive: true });
  }

  // The drawer's Goals tab (summary) and the separate Goals page (single-goal
  // detail) are two distinct surfaces now — each has its own visibility check.
  function isGoalsDrawerTabOpen() {
    return !document.getElementById('app-container')?.classList.contains('sidebar-collapsed') && activeSidebarTab === 'goals';
  }

  function isGoalsPageOpen() {
    return !!document.getElementById('goals-page')?.classList.contains('open');
  }

  function updateGoalsPill() {
    const pill = document.getElementById('goals-pill-text');
    if (!pill) return;
    const goals = Storage.getAllGoals();
    if (goals.length === 0) { pill.textContent = '0 goals'; return; }
    let totalDone = 0, totalCount = 0;
    goals.forEach(g => {
      const { done, total } = getGoalProgress(g.id);
      totalDone += done;
      totalCount += total;
    });
    pill.textContent = totalCount > 0
      ? `${goals.length} goal${goals.length === 1 ? '' : 's'} · ${Math.round((totalDone / totalCount) * 100)}%`
      : `${goals.length} goal${goals.length === 1 ? '' : 's'}`;
  }

  function updateSidebarBadges() {
    const backlogCount = getBacklogTasks().length;
    const deadlineCount = getDeadlineTasks().length;
    const goalsCount = Storage.getAllGoals().length;
    const bc = document.getElementById('tab-backlog-count');
    const dc = document.getElementById('tab-deadlines-count');
    const gc = document.getElementById('tab-goals-count');
    if (bc) bc.textContent = backlogCount;
    if (dc) dc.textContent = deadlineCount;
    if (gc) gc.textContent = goalsCount;
    updateGoalsPill();
  }

  function renderBacklog() {
    const container = document.getElementById('backlog-tasks');
    if (deferIfEditing('backlog', container, renderBacklog)) return;
    const tasks = getBacklogTasks();
    container.innerHTML = tasks.length === 0
      ? '<div class="empty-state">No unassigned tasks 🎉</div>'
      : tasks.map(t => renderTaskCard(t, { isBacklog: true })).join('');
    initCalendarSortables();
    reapplySearch();
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
            return `<div class="deadline-task-item" data-task-id="${t.id}"
                        onclick="App.openEditModal('${t.id}')">
              <span class="cat-dot" style="background:${col}"></span>
              <span class="deadline-task-title">${escapeHtml(t.title)}</span>
              ${t.assignedDate ? `<span class="deadline-assigned">→ ${formatDate(t.assignedDate)}</span>` : '<span class="deadline-assigned unscheduled">unscheduled</span>'}
              <span class="deadline-drag-hint" title="Drag to a day">⠿</span>
            </div>`;
          }).join('')}
        </div>`;
    }).join('');
    // Each group's items are its direct children, so bind per group.
    container.querySelectorAll('.deadline-group').forEach(bindDeadlineSortable);
  }

  // ---- Task card rendering ----------------------------------
  function renderTaskCard(task, { isBacklog = false, isNested = false, isHabitsList = false, isGoalPage = false } = {}) {
    // In backlog, suppress ALL deadline-related visuals
    const late = isBacklog ? '' : latenessClass(task);
    const doneClass = task.done ? 'task-done' : '';
    const catColor = categoryColor(task.category);
    const borderStyle = task.category && !late ? `border-left:3px solid ${catColor};` : '';

    // NEVER show deadline in backlog, nor on goal tasks (no Deadlines for them)
    const deadlineHtml = (!isBacklog && task.deadline && !task.goalId)
      ? `<span class="task-deadline ${isPast(task.deadline) && !task.done ? 'overdue' : ''}">📅 ${formatDate(task.deadline)}</span>` : '';
    const categoryHtml = task.category
      ? `<span class="task-category" style="background:${catColor}22;color:${catColor}">${escapeHtml(task.category)}</span>` : '';
    const recurrenceHtml = task.recurrence
      ? `<span class="task-recurrence">🔄 ${recurrenceLabel(task.recurrence)}</span>` : '';

    const lateTask = isBacklog && task.assignedDate && isPast(task.assignedDate) && !task.done;
    const lateBadge = lateTask
      ? `<span class="task-late-badge">⚠ LATE — was ${formatDate(task.assignedDate)}</span>` : '';

    // Priority badges only make sense in the Backlog (not day columns/deadlines)
    const importanceHtml = (isBacklog && task.importance === 'high')
      ? `<span class="task-priority-badge" title="High importance">⭐ Important</span>` : '';
    const urgencyHtml = (isBacklog && task.urgency === 'high')
      ? `<span class="task-priority-badge" title="High urgency">⚡ Urgent</span>` : '';

    const habitGrace = task.isHabit ? habitGraceStatus(task) : 'on-track';
    // Tapping anywhere on a habit card logs it (see tapHabitCard).
    const habitBadgeHtml = task.isHabit
      ? `<span class="task-habit-badge ${habitGrace === 'check-in' ? 'habit-check-in' : ''}" title="Tap to log">🔁 ${habitStatusLabel(task)}${habitGrace === 'check-in' ? ' · check in?' : ''}</span>`
      : '';

    const metaItems = [lateBadge, deadlineHtml, recurrenceHtml, categoryHtml, importanceHtml, urgencyHtml, habitBadgeHtml, (isGoalPage ? '' : goalTagHtml(task))].filter(Boolean).join('');

    const children = getChildTasks(task.id);
    const hasChildren = children.length > 0;
    const collapsed = collapsedTaskIds.has(task.id);
    const doneChildren = children.filter(c => c.done).length;

    const collapseToggleHtml = hasChildren
      ? `<button class="task-collapse-toggle" onclick="event.stopPropagation(); App.toggleTaskCollapse('${task.id}')" title="${collapsed ? 'Expand' : 'Collapse'} subtasks">${collapsed ? '▸' : '▾'}</button>`
      : '';
    const childrenBadgeHtml = hasChildren
      ? `<span class="task-children-count">${doneChildren}/${children.length}</span>` : '';

    // Always rendered (even with zero children) so it's a valid drop target
    // for dragging any other task onto this one to make it a subtask.
    const childrenHtml = `<div class="task-children" data-parent-task-id="${task.id}" style="${collapsed ? 'display:none' : ''}">${children.map(c => renderTaskCard(c, { isBacklog, isNested: true })).join('')}</div>`;

    const addSubtaskHtml = `<div class="task-add-subtask" data-parent-id="${task.id}">
      <button class="add-subtask-btn" onclick="App.startSubtaskQuickAdd(this,'${task.id}')" title="Add subtask">+ Add subtask</button>
    </div>`;

    // Habits aren't done/not-done — there's no checkbox: tapping anywhere on
    // the habit card logs it (tapHabitCard), ✎ opens the edit modal, and ↩
    // (only shown once there's something to undo) removes the latest log entry.
    const checkButtonHtml = task.isHabit
      ? ''
      : `<button class="task-check ${task.done ? 'checked' : ''}"
                  onclick="App.toggleDone('${task.id}')"
                  title="${task.done ? 'Mark undone' : 'Mark done'}">${task.done ? '✓' : ''}</button>`;
    const titleHtml = task.isHabit
      ? `<span class="task-title" title="Tap to log">${escapeHtml(task.title)}</span>`
      : `<span class="task-title" onclick="App.openEditModal('${task.id}')">${escapeHtml(task.title)}</span>`;
    const habitEditHtml = task.isHabit
      ? `<button class="habit-edit-btn" title="Edit habit" aria-label="Edit habit" onclick="event.stopPropagation(); App.openEditModal('${task.id}')">✎</button>` : '';
    const undoHabitHtml = (task.isHabit && (task.habitLog || []).length > 0)
      ? `<button class="task-delete habit-undo-btn" onclick="App.undoLastHabitLog('${task.id}')" title="Undo last log">↩</button>` : '';
    // Only true from the habits-list drawer slot, where dragging this card
    // onto a day column logs that day instead of the usual date-reassign —
    // hinted the same way the Deadlines tab hints its own drag-to-a-day.
    const habitDragHintHtml = isHabitsList
      ? `<span class="deadline-drag-hint" title="Drag onto a day to log it">⠿</span>` : '';
    // Goal page only: 📅 opens the native date picker to schedule the task
    // (the calendar is hidden behind the full-screen goal page on a phone,
    // so drag-to-a-day isn't an option there). The date input is invisible
    // but covers the whole button, so a tap lands on it directly — the most
    // reliable way to get the Android picker; showPicker() is used too
    // where supported (desktop Chrome only opens it from the icon otherwise).
    const scheduleBtnHtml = (isGoalPage && !task.isHabit)
      ? `<span class="goal-schedule-btn ${task.assignedDate ? 'scheduled' : ''}" title="${task.assignedDate ? `Scheduled ${formatDateWithDay(task.assignedDate)} — tap to change` : 'Schedule on a day'}">
           <span class="goal-schedule-icon" aria-hidden="true">📅</span>${task.assignedDate ? `<span class="goal-schedule-date">${formatDate(task.assignedDate)}</span>` : ''}
           <input type="date" class="goal-schedule-input" aria-label="Schedule date" value="${escapeHtml(task.assignedDate || '')}"
                  onclick="App.openSchedulePicker(this, event)" onchange="App.scheduleGoalTask('${task.id}', this.value)">
         </span>` : '';

    return `
      <div class="task-card ${doneClass} ${late} ${isNested ? 'task-card-nested' : ''} ${task.isHabit ? 'habit-card' : ''}" style="${borderStyle}"
           data-task-id="${task.id}" data-sort-order="${Number(task.sortOrder) || 0}"${task.isHabit ? ` onclick="App.tapHabitCard(event,'${task.id}')"` : ''}>
        <div class="task-top-row">
          ${collapseToggleHtml}
          ${checkButtonHtml}
          ${titleHtml}
          ${childrenBadgeHtml}
          ${habitEditHtml}
          ${undoHabitHtml}
          ${habitDragHintHtml}
          ${scheduleBtnHtml}
          <button class="task-delete" onclick="App.confirmDelete('${task.id}')" title="Delete">×</button>
        </div>
        ${metaItems ? `<div class="task-meta">${metaItems}</div>` : ''}
        ${childrenHtml}
        ${addSubtaskHtml}
      </div>`;
  }

  // A habit's real card lives wherever it's canonically listed (backlog,
  // goal page, or the drawer's Habits section) — this is just evidence that
  // it was logged on this particular day, so it's read-only (no checkbox/
  // delete/drag) and shows a ×N badge when logged more than once that day.
  function renderHabitCompletionCard(task, count) {
    const countBadge = count > 1 ? `<span class="task-children-count" title="${count} logs this day">×${count}</span>` : '';
    return `
      <div class="task-card task-done habit-completion-marker" data-task-id="${task.id}" title="Habit logged ${count} time${count > 1 ? 's' : ''} on this day">
        <div class="task-top-row">
          <span class="task-check checked">🔁</span>
          <span class="task-title" onclick="App.openEditModal('${task.id}')">${escapeHtml(task.title)}</span>
          ${countBadge}
        </div>
      </div>`;
  }

  // ---- Inline subtask quick-add ------------------------------
  function startSubtaskQuickAdd(btn, parentId) {
    const container = btn.parentElement;
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quick-add-input';
    input.placeholder = 'Subtask name… (Enter)';
    input.maxLength = 200;
    container.appendChild(input);
    input.focus();

    let closed = false;

    function commit() {
      if (closed) return;
      closed = true;
      const title = input.value.trim();
      cleanup();
      if (title) {
        const task = createTask({ title, parentId });
        Storage.addTask(task).then(() => refreshTimeline());
      }
    }

    function cancel() {
      if (closed) return;
      closed = true;
      cleanup();
    }

    function cleanup() {
      if (document.body.contains(input)) input.remove();
      flushDeferredRenders(); // removal may not fire focusout
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

  // ---- Inline Quick-Add (day "+", backlog add, 'n' shortcut) --
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
          // Just creates the task — details are edited later by tapping it.
          Storage.addTask(task).then(() => refreshTimeline());
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
      flushDeferredRenders(); // removal may not fire focusout
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
    document.getElementById('task-title-input').value = task.title;
    document.getElementById('task-assigned-date').value = task.assignedDate || '';
    document.getElementById('task-deadline').value = task.deadline || '';
    document.getElementById('task-category-input').value = task.category || '';
    pendingCategoryColor = null;
    categorySwatchesForced = false;
    renderCategoryColorUI();
    document.getElementById('task-recurrence').value = task.recurrence || '';
    document.getElementById('task-importance').value = task.importance || '';
    document.getElementById('task-urgency').value = task.urgency || '';
    document.getElementById('task-is-habit').checked = !!task.isHabit;
    document.getElementById('habit-target-count').value = task.habitTarget ? task.habitTarget.count : '';
    document.getElementById('habit-target-period').value = task.habitTarget ? task.habitTarget.period : 'day';
    toggleHabitFieldsVisibility(); // field visibility + modal title
    modal.classList.add('open');
    // On Android, focusing pops the keyboard over the modal — don't.
    if (!isAndroidShell()) document.getElementById('task-title-input').focus();
  }

  // Which edit-modal fields don't apply to the task being edited:
  //  - goal tasks: no assigned day / due date / category / priority / repeat
  //    (they're scheduled from the goal page and never in Deadlines/Backlog)
  //  - habits (live checkbox): no assigned day / due date / repeat
  // Hidden fields are also NOT written back on save (stored values kept).
  function getHiddenTaskFields() {
    const task = editingTaskId ? Storage.getAllTasks().find(t => t.id === editingTaskId) : null;
    const isGoalTask = !!(task && task.goalId);
    const isHabit = !!document.getElementById('task-is-habit')?.checked;
    return {
      isGoalTask,
      isHabit,
      assignedDate: isGoalTask || isHabit,
      deadline: isGoalTask || isHabit,
      recurrence: isGoalTask || isHabit,
      category: isGoalTask,
      priority: isGoalTask,
    };
  }

  // ---- Edit modal: category colour dot + swatch row ---------
  // The dot shows the current category's colour. A brand-new category (no
  // stored colour and no task carrying the tag yet) opens the swatch row
  // automatically; tapping the dot toggles it for an existing category. A
  // tapped swatch is held here and saved on Save (Storage.setCategoryColor,
  // the synced colorData doc); with none tapped the hash colour stays.
  let pendingCategoryColor = null;     // { category, color }
  let categorySwatchesForced = false;  // row opened via the dot

  function currentModalCategory() {
    const input = document.getElementById('task-category-input');
    return input ? input.value.trim() : '';
  }

  function modalCategoryColor(cat) {
    if (pendingCategoryColor && pendingCategoryColor.category === cat) return pendingCategoryColor.color;
    return Storage.getCategoryColor(cat);
  }

  function isNewCategory(cat) {
    if (!cat || modalCategoryColor(cat)) return false;
    return !Storage.getAllTasks().some(t => t.category === cat);
  }

  function renderCategoryColorUI() {
    const dot = document.getElementById('task-category-dot');
    const row = document.getElementById('task-category-swatches');
    if (!dot || !row) return;
    const cat = currentModalCategory();
    const color = cat ? (modalCategoryColor(cat) || autoCategoryColor(cat)) : '';
    if (color) dot.style.setProperty('--dot', color);
    else dot.style.removeProperty('--dot');
    dot.classList.toggle('empty', !cat);
    dot.disabled = !cat;
    const show = !!cat && (categorySwatchesForced || isNewCategory(cat));
    row.hidden = !show;
    row.innerHTML = show
      ? CATEGORY_COLORS.map(c => `<button type="button" class="category-swatch${c === color ? ' active' : ''}" data-color="${c}" style="--swatch:${c}" title="${c}" aria-label="Colour ${c}"></button>`).join('')
      : '';
  }

  function toggleCategorySwatches() {
    if (!currentModalCategory()) return;
    categorySwatchesForced = document.getElementById('task-category-swatches').hidden;
    renderCategoryColorUI();
  }

  function initCategoryColorUI() {
    const input = document.getElementById('task-category-input');
    const row = document.getElementById('task-category-swatches');
    if (!input || !row) return;
    input.addEventListener('input', () => { categorySwatchesForced = false; renderCategoryColorUI(); });
    row.addEventListener('click', e => {
      const btn = e.target.closest('.category-swatch');
      const cat = currentModalCategory();
      if (!btn || !cat) return;
      pendingCategoryColor = { category: cat, color: btn.dataset.color };
      categorySwatchesForced = false;
      renderCategoryColorUI();
    });
  }

  function setShown(id, shown) {
    const el = document.getElementById(id);
    if (el) el.style.display = shown ? '' : 'none';
  }

  function toggleHabitFieldsVisibility() {
    const hidden = getHiddenTaskFields();
    setShown('habit-target-row', hidden.isHabit);
    setShown('task-assigned-group', !hidden.assignedDate);
    setShown('task-deadline-group', !hidden.deadline);
    setShown('task-dates-row', !(hidden.assignedDate && hidden.deadline));
    setShown('task-category-group', !hidden.category);
    setShown('task-recurrence-group', !hidden.recurrence);
    setShown('task-category-row', !(hidden.category && hidden.recurrence));
    setShown('task-priority-row', !hidden.priority);

    const titleEl = document.getElementById('modal-title');
    if (titleEl) {
      let title = 'Edit Task';
      if (hidden.isHabit) {
        title = 'Edit Habit';
      } else if (hidden.isGoalTask) {
        const task = Storage.getAllTasks().find(t => t.id === editingTaskId);
        const goal = task && Storage.getAllGoals().find(g => g.id === task.goalId);
        if (goal) title = `Edit Task · 🎯 ${goal.title}`; // textContent → no HTML injection
      }
      titleEl.textContent = title;
    }
  }

  function closeModal() {
    document.getElementById('task-modal').classList.remove('open');
    editingTaskId = null;
    pendingCategoryColor = null;
    categorySwatchesForced = false;
    refreshTimeline(); // sync any changes
  }

  function archiveCurrentTask() {
    if (!editingTaskId) return;
    archiveTask(editingTaskId);
    closeModal();
  }

  // Edit modal 🗑️ Delete. The modal stays open if the confirm is cancelled.
  function deleteCurrentTask() {
    if (!editingTaskId) return;
    if (confirmDelete(editingTaskId)) closeModal();
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('task-title-input').value.trim();
    if (!title) return;
    if (editingTaskId) {
      const isHabit = document.getElementById('task-is-habit').checked;
      const targetCount = parseInt(document.getElementById('habit-target-count').value, 10);
      const habitTarget = isHabit && targetCount > 0
        ? { count: targetCount, period: document.getElementById('habit-target-period').value || 'day' }
        : null;
      // Fields hidden for this task (goal task / habit) are left untouched.
      const hidden = getHiddenTaskFields();
      const updates = { title, isHabit, habitTarget };
      if (!hidden.assignedDate) updates.assignedDate = document.getElementById('task-assigned-date').value || null;
      if (!hidden.deadline) updates.deadline = document.getElementById('task-deadline').value || null;
      if (!hidden.category) {
        updates.category = document.getElementById('task-category-input').value.trim();
        if (updates.category && pendingCategoryColor && pendingCategoryColor.category === updates.category) {
          Storage.setCategoryColor(updates.category, pendingCategoryColor.color);
        }
      }
      if (!hidden.recurrence) updates.recurrence = document.getElementById('task-recurrence').value || '';
      // Turning an existing non-habit task into a habit clears its schedule
      // (habits have no assigned day / due date / repeat).
      const stored = Storage.getAllTasks().find(t => t.id === editingTaskId);
      if (isHabit && stored && !stored.isHabit) {
        updates.assignedDate = null;
        updates.deadline = null;
        updates.recurrence = '';
      }
      if (!hidden.priority) {
        updates.importance = document.getElementById('task-importance').value || '';
        updates.urgency = document.getElementById('task-urgency').value || '';
      }
      Storage.updateTask(editingTaskId, updates).then(() => closeModal());
    } else {
      closeModal();
    }
  }

  // ---- Actions ----------------------------------------------
  // Marks `tasks` done in one write and spawns the next occurrence of each
  // recurring one. Callers pass ONLY the tasks this action newly completes
  // (not already done / archived). If a recurring subtask's parent also
  // recurred, the subtask's next occurrence is nested under the parent's
  // next occurrence — so parents are processed before their children.
  function completeTasks(tasks, completedAt = new Date().toISOString()) {
    if (!tasks.length) return Promise.resolve();
    const byId = new Map(Storage.getAllTasks().map(t => [t.id, t]));
    const depth = t => {
      let d = 0;
      const seen = new Set([t.id]);
      for (let p = t.parentId; p && byId.has(p) && !seen.has(p); p = byId.get(p).parentId) { seen.add(p); d++; }
      return d;
    };
    // Snapshot before the write updates the cache.
    const toRecur = tasks.filter(t => t.recurrence)
      .map(t => ({ task: { ...t }, depth: depth(t) }))
      .sort((a, b) => a.depth - b.depth)
      .map(e => e.task);
    return Storage.updateTasks(tasks.map(t => t.id), { done: true, completedAt }).then(() => {
      const nextIdFor = {};
      let toasted = false;
      toRecur.forEach(t => {
        const parentId = (t.parentId && nextIdFor[t.parentId]) || t.parentId;
        const next = handleRecurrence(t, { parentId, silent: toasted });
        if (next) { nextIdFor[t.id] = next.id; toasted = true; }
      });
    });
  }

  function toggleDone(id) {
    const task = Storage.getAllTasks().find(t => t.id === id);
    if (!task) return;
    if (task.done) {
      // Un-completing touches ONLY the clicked task — subtasks the user
      // completed stay completed.
      Storage.updateTask(id, { done: false, completedAt: null }).then(() => refreshTimeline());
      return;
    }
    // Completing cascades to descendants that aren't already done/archived.
    const all = Storage.getAllTasks();
    const newlyDone = [task, ...getDescendantIds(id)
      .map(did => all.find(t => t.id === did))
      .filter(t => t && !t.done && !t.archived)];
    completeTasks(newlyDone).then(() => {
      touchForCompletedTask(task);
      showToast('✅ Done!');
      refreshTimeline();
    });
  }

  // Returns true if the user confirmed (the delete was started).
  function confirmDelete(id) {
    const task = Storage.getAllTasks().find(t => t.id === id);
    if (!task) return false;
    const descendantIds = getDescendantIds(id);
    const message = descendantIds.length
      ? `Delete "${task.title}" and its ${descendantIds.length} subtask${descendantIds.length === 1 ? '' : 's'}?`
      : `Delete "${task.title}"?`;
    if (confirm(message)) {
      Storage.deleteTasks([id, ...descendantIds]).then(() => {
        refreshTimeline();
        renderArchivePanel();
      });
      return true;
    }
    return false;
  }

  // ---- Archive ------------------------------------------------
  function archiveTask(id) {
    const ids = [id, ...getDescendantIds(id)];
    Storage.updateTasks(ids, { archived: true }).then(() => {
      refreshTimeline();
      renderArchivePanel();
      const subCount = ids.length - 1;
      showToast(subCount > 0 ? `📦 Archived + ${subCount} subtask${subCount === 1 ? '' : 's'}` : '📦 Archived');
    });
  }

  function unarchiveTask(id) {
    const ids = [id, ...getDescendantIds(id)];
    Storage.updateTasks(ids, { archived: false }).then(() => {
      refreshTimeline();
      renderArchivePanel();
    });
  }

  // Archive every task (anywhere, root or nested) carrying this category tag,
  // plus each match's own subtasks.
  function archiveCategory(category) {
    const matches = Storage.getAllTasks().filter(t => !t.archived && t.category === category);
    if (matches.length === 0) return;
    const ids = new Set();
    matches.forEach(t => {
      ids.add(t.id);
      getDescendantIds(t.id).forEach(id => ids.add(id));
    });
    const count = ids.size;
    if (!confirm(`Archive all ${matches.length} task${matches.length === 1 ? '' : 's'} tagged "${category}" (and their subtasks)?`)) return;
    Storage.updateTasks([...ids], { archived: true }).then(() => {
      refreshTimeline();
      renderArchivePanel();
      showToast(`📦 Archived ${count} task${count === 1 ? '' : 's'} tagged "${category}"`);
    });
  }

  // Unarchive every archived task carrying this category tag, plus each
  // match's own subtasks (so a restored group comes back whole).
  function unarchiveCategory(category) {
    const matches = Storage.getAllTasks().filter(t => t.archived && t.category === category);
    if (matches.length === 0) return;
    const ids = new Set();
    matches.forEach(t => {
      ids.add(t.id);
      getDescendantIds(t.id).forEach(id => ids.add(id));
    });
    const count = ids.size;
    if (!confirm(`Unarchive all ${matches.length} task${matches.length === 1 ? '' : 's'} tagged "${category}" (and their subtasks)?`)) return;
    Storage.updateTasks([...ids], { archived: false }).then(() => {
      refreshTimeline();
      renderArchivePanel();
      showToast(`📤 Unarchived ${count} task${count === 1 ? '' : 's'} tagged "${category}"`);
    });
  }

  function getActiveCategories() {
    const cats = new Set();
    Storage.getAllTasks().forEach(t => { if (!t.archived && t.category) cats.add(t.category); });
    return [...cats].sort();
  }

  function getArchivedCategories() {
    const cats = new Set();
    Storage.getAllTasks().forEach(t => { if (t.archived && t.category) cats.add(t.category); });
    return [...cats].sort();
  }

  function renderArchiveTagLists() {
    const activeContainer = document.getElementById('archive-tags-active');
    const archivedContainer = document.getElementById('archive-tags-archived');

    if (activeContainer) {
      const activeCats = getActiveCategories();
      activeContainer.innerHTML = activeCats.length === 0
        ? '<div class="empty-state">No tags to archive</div>'
        : activeCats.map(cat => `
          <div class="archive-tag-row">
            <span class="task-category" style="background:${categoryColor(cat)}22;color:${categoryColor(cat)}">${escapeHtml(cat)}</span>
            <button class="btn btn-secondary" data-category="${escapeHtml(cat)}" onclick="App.archiveCategory(this.dataset.category)">Archive all</button>
          </div>`).join('');
    }

    if (archivedContainer) {
      const archivedCats = getArchivedCategories();
      archivedContainer.innerHTML = archivedCats.length === 0
        ? '<div class="empty-state">Nothing archived by tag</div>'
        : archivedCats.map(cat => `
          <div class="archive-tag-row">
            <span class="task-category" style="background:${categoryColor(cat)}22;color:${categoryColor(cat)}">${escapeHtml(cat)}</span>
            <button class="btn btn-secondary" data-category="${escapeHtml(cat)}" onclick="App.unarchiveCategory(this.dataset.category)">Unarchive all</button>
          </div>`).join('');
    }
  }

  // A task is a top-level entry in the archive panel if it has no parent,
  // or its parent isn't archived — covers tasks archived individually (e.g.
  // via the tag bulk-action) even when they're nested under a live parent.
  function getArchivedRootTasks() {
    const all = Storage.getAllTasks();
    return all.filter(t => {
      if (!t.archived) return false;
      if (!t.parentId) return true;
      const parent = all.find(p => p.id === t.parentId);
      return !parent || !parent.archived;
    });
  }

  // isRoot: only the top-level archived task (the group head) gets an
  // Unarchive button — unarchiving restores the whole group together, so
  // nested subtasks shouldn't offer their own independent Unarchive.
  function renderArchivedCard(task, isRoot) {
    // Archived tasks come from the full cache, which still includes archived
    // descendants — getChildTasks() filters those out, so walk manually here.
    const children = Storage.getAllTasks()
      .filter(t => t.parentId === task.id)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const hasChildren = children.length > 0;
    const collapsed = collapsedTaskIds.has(task.id);
    const toggleHtml = hasChildren
      ? `<button class="task-collapse-toggle" onclick="event.stopPropagation(); App.toggleTaskCollapse('${task.id}')" title="${collapsed ? 'Expand' : 'Collapse'} subtasks">${collapsed ? '▸' : '▾'}</button>` : '';
    const childrenHtml = hasChildren && !collapsed
      ? `<div class="task-children">${children.map(c => renderArchivedCard(c, false)).join('')}</div>` : '';
    const restoreBtnHtml = isRoot
      ? `<button class="btn btn-secondary archive-restore-btn" onclick="App.unarchiveTask('${task.id}')">Unarchive</button>` : '';
    const dateStr = task.deadline || task.assignedDate;
    const dateHtml = dateStr ? `<span class="archive-task-date">${formatDate(dateStr)}</span>` : '';
    return `
      <div class="task-card archived-card ${task.done ? 'task-done' : ''}" data-task-id="${task.id}">
        <div class="task-top-row">
          ${toggleHtml}
          <span class="task-title">${escapeHtml(task.title)}</span>
          ${dateHtml}
          <div class="archive-actions">
            ${restoreBtnHtml}
            <button class="btn btn-secondary archive-delete-btn" onclick="App.confirmDelete('${task.id}')">Delete</button>
          </div>
        </div>
        ${childrenHtml}
      </div>`;
  }

  // Which tag-groups are expanded in the archive panel. Empty by default —
  // groups start collapsed so the list doesn't just dump everything on screen.
  const expandedArchiveGroups = new Set();

  function toggleArchiveGroup(tag) {
    if (expandedArchiveGroups.has(tag)) expandedArchiveGroups.delete(tag);
    else expandedArchiveGroups.add(tag);
    renderArchiveTaskGroups();
  }

  function renderArchiveTaskGroups() {
    const container = document.getElementById('archive-tasks');
    if (!container) return;
    const tasks = getArchivedRootTasks();
    if (tasks.length === 0) {
      container.innerHTML = '<div class="empty-state">Nothing archived 🎉</div>';
      return;
    }

    const groups = {};
    tasks.forEach(t => {
      const key = t.category || '(no tag)';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    container.innerHTML = Object.keys(groups).sort().map(tag => {
      const items = groups[tag];
      const expanded = expandedArchiveGroups.has(tag);
      const color = tag === '(no tag)' ? 'var(--text-dim)' : categoryColor(tag);
      return `
        <div class="archive-group" data-tag="${escapeHtml(tag)}">
          <button class="archive-group-header" data-tag="${escapeHtml(tag)}" onclick="App.toggleArchiveGroup(this.dataset.tag)">
            <span class="archive-group-toggle">${expanded ? '▾' : '▸'}</span>
            <span class="task-category" style="background:${color}22;color:${color}">${escapeHtml(tag)}</span>
            <span class="archive-group-count">${items.length}</span>
          </button>
          <div class="archive-group-body" style="display:${expanded ? '' : 'none'}">
            ${items.map(t => renderArchivedCard(t, true)).join('')}
          </div>
        </div>`;
    }).join('');
  }

  function renderArchivePanel() {
    renderArchiveTagLists();
    renderArchiveTaskGroups();
  }

  // While searching, force-expand only the groups that contain a match and
  // hide groups with none; clearing the search restores the collapsed state.
  function filterArchiveTasks(query) {
    const q = query.toLowerCase().trim();
    if (!q) { renderArchiveTaskGroups(); return; }
    document.querySelectorAll('.archive-group').forEach(group => {
      const cards = [...group.querySelectorAll('.task-card')];
      const anyMatch = applyNestedCardFilter(cards, card => ownCardText(card, '.task-title').includes(q)) > 0;
      group.style.display = anyMatch ? '' : 'none';
      const body = group.querySelector('.archive-group-body');
      if (body) body.style.display = anyMatch ? '' : 'none';
    });
  }

  function openArchivePanel() {
    const searchInput = document.getElementById('archive-search-input');
    if (searchInput) searchInput.value = '';
    renderArchivePanel();
    document.getElementById('archive-modal').classList.add('open');
  }

  function closeArchivePanel() {
    document.getElementById('archive-modal').classList.remove('open');
  }

  // ---- Goals & Subgoals --------------------------------------
  const collapsedSubgoalIds = new Set();
  let currentGoalId = null;
  let editingGoalId = null;

  function createGoal({ title, finishCondition = '', notes = '' } = {}) {
    const now = new Date().toISOString();
    return { id: uuid(), title, finishCondition, notes, createdAt: now, lastTouchedAt: now };
  }

  function createSubgoal({ goalId, parentSubgoalId = null, title }) {
    const now = new Date().toISOString();
    return { id: uuid(), goalId, parentSubgoalId, title, done: false, sortOrder: Date.now(), createdAt: now, completedAt: null, lastTouchedAt: now };
  }

  function getGoalSubgoals(goalId) {
    return Storage.getAllSubgoals().filter(s => s.goalId === goalId);
  }

  function getSubgoalChildren(parentSubgoalId) {
    return Storage.getAllSubgoals()
      .filter(s => s.parentSubgoalId === parentSubgoalId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  function getSubgoalDescendantIds(subgoalId) {
    const all = Storage.getAllSubgoals();
    const result = [];
    const seen = new Set([subgoalId]); // cycle guard, same reason as getDescendantIds
    const queue = [subgoalId];
    while (queue.length) {
      const current = queue.shift();
      const children = all.filter(s => s.parentSubgoalId === current);
      for (const child of children) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        result.push(child.id);
        queue.push(child.id);
      }
    }
    return result;
  }

  // Sorted by sortOrder (same as getChildTasks) so a saved drag-reorder
  // renders in its new position and siblingSortOrder sees real neighbours.
  function getGoalDirectTasks(goalId) {
    return Storage.getAllTasks()
      .filter(t => !t.archived && !t.parentId && t.goalId === goalId && !t.subgoalId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  function getSubgoalTasks(subgoalId) {
    return Storage.getAllTasks()
      .filter(t => !t.archived && !t.parentId && t.subgoalId === subgoalId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  function getGoalProgress(goalId) {
    const subgoals = getGoalSubgoals(goalId);
    return { done: subgoals.filter(s => s.done).length, total: subgoals.length };
  }

  // ---- Dormancy: "last touched" instead of a forced schedule ----
  function daysSince(isoString) {
    if (!isoString) return Infinity;
    return Math.floor((Date.now() - new Date(isoString).getTime()) / 86400000);
  }

  function dormancyTier(lastTouchedAt) {
    const days = daysSince(lastTouchedAt);
    if (days < 3) return 'fresh';
    if (days <= 14) return 'fading';
    return 'dormant';
  }

  function lastTouchedLabel(lastTouchedAt) {
    const days = daysSince(lastTouchedAt);
    if (days <= 0) return 'last touched today';
    if (days === 1) return 'last touched yesterday';
    return `last touched ${days} days ago`;
  }

  function touchGoal(goalId) {
    Storage.updateGoal(goalId, { lastTouchedAt: new Date().toISOString() })
      .catch(e => console.warn('Failed to touch goal:', e));
  }

  function touchSubgoalAndGoal(subgoalId) {
    const subgoal = Storage.getAllSubgoals().find(s => s.id === subgoalId);
    Storage.updateSubgoal(subgoalId, { lastTouchedAt: new Date().toISOString() })
      .catch(e => console.warn('Failed to touch subgoal:', e));
    if (subgoal) touchGoal(subgoal.goalId);
  }

  function touchForCompletedTask(task) {
    if (task.subgoalId) touchSubgoalAndGoal(task.subgoalId);
    else if (task.goalId) touchGoal(task.goalId);
  }

  function touchForNewGoalTask(goalId, subgoalId) {
    if (subgoalId) touchSubgoalAndGoal(subgoalId);
    else if (goalId) touchGoal(goalId);
  }

  // ---- Habit tracking (repetition log, not a done/not-done checkbox) ----
  // Logging is append-only (multiple entries per day are allowed — e.g.
  // "brush teeth twice a day"); undo removes only the single most recent
  // entry, never the whole day. No streak counter that resets on a miss —
  // just the raw log, always, per the habit-formation research.
  function startOfWeek(d) {
    const day = d.getDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? -6 : 1 - day; // Monday-start week
    const start = new Date(d);
    start.setDate(d.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  // n periods back from now; n=0 is the current (possibly still in-progress)
  // period. A "period" is 1 day for a daily target/no target, 1 week
  // (Monday-start, matching startOfWeek) for a weekly target.
  function habitPeriodRange(task, n) {
    if (task.habitTarget?.period === 'week') {
      const start = startOfWeek(new Date());
      start.setDate(start.getDate() - n * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return [start, end];
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - n);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start, end];
  }

  function habitPeriodCount(task, n) {
    const [start, end] = habitPeriodRange(task, n);
    return (task.habitLog || []).filter(iso => { const d = new Date(iso); return d >= start && d < end; }).length;
  }

  function habitPeriodHit(task, n) {
    return habitPeriodCount(task, n) >= (task.habitTarget?.count || 1);
  }

  // "Consecutive periods hit, misses forgiven" — NOT a raw lifetime count,
  // and NOT a classic streak that resets to zero on any miss. Walks backward
  // from the current period: the current period never counts as a miss
  // while it's still in progress (you haven't failed it yet), exactly one
  // isolated missed period is forgiven (the streak keeps accumulating
  // through it), but two consecutive misses ends the streak where it stood.
  function habitStreak(task) {
    if (!(task.habitLog || []).length) return 0;
    let streak = 0, misses = 0, n = 0;
    while (n < 3650) { // safety bound, not a real limit on habit age
      if (habitPeriodHit(task, n)) {
        streak++;
        misses = 0;
      } else if (n > 0) {
        misses++;
        if (misses >= 2) break;
      }
      n++;
    }
    return streak;
  }

  // 2-tier grace, nothing in between: "on-track" unless the current period
  // AND the one immediately before it are BOTH completely empty. Logging
  // even once, at any point, instantly flips this back to on-track — there
  // is deliberately no red/alarming styling for the other tier (see
  // .habit-check-in in styles.css), just a gentle nudge.
  function habitGraceStatus(task) {
    // A habit with no log history at all hasn't missed anything yet — there's
    // no prior period to have skipped, so it can't be "2 consecutive misses."
    if (!(task.habitLog || []).length) return 'on-track';
    if (habitPeriodCount(task, 0) > 0) return 'on-track';
    return habitPeriodCount(task, 1) > 0 ? 'on-track' : 'check-in';
  }

  function habitStatusLabel(task) {
    const streak = habitStreak(task);
    const total = (task.habitLog || []).length;
    return `${streak > 0 ? `🔥${streak} streak · ` : ''}${total} total`;
  }

  // A habit log entry is a UTC ISO timestamp; this resolves it to the local
  // calendar date it should count toward, matching how the rest of the app
  // resolves "today" (toLocalDateStr), so a late-night log lands on the
  // day it felt like, not the day its UTC instant happened to fall on.
  function habitLogDateKey(iso) {
    return toLocalDateStr(new Date(iso));
  }

  function habitLogCountForDate(task, date) {
    return (task.habitLog || []).filter(iso => habitLogDateKey(iso) === date).length;
  }

  // A habit can be logged on many different days at once (it's an append-only
  // log, not a single done/not-done flag) — this finds every habit that has
  // at least one log entry for this specific date, so it can show up on every
  // day it has history for, not just wherever its assignedDate happens to be.
  function getHabitCompletionsForDate(date, excludeIds = new Set()) {
    return getAllHabitTasks()
      .filter(t => !excludeIds.has(t.id))
      .map(t => ({ task: t, count: habitLogCountForDate(t, date) }))
      .filter(entry => entry.count > 0);
  }

  function logHabitNow(taskId) {
    const task = Storage.getAllTasks().find(t => t.id === taskId);
    if (!task) return;
    const habitLog = [...(task.habitLog || []), new Date().toISOString()];
    Storage.updateTask(taskId, { habitLog }).then(() => {
      touchForCompletedTask(task);
      refreshTimeline();
      renderBacklog();
      renderSidebarHabits();
      if (currentGoalId) renderGoalDetail(currentGoalId); else renderGoalsDashboard();
      showToast(`🔁 Logged ${task.title}`);
    });
  }

  // Tap on a habit card (via tapHabitCard). A touch long-press that Sortable
  // "chose" (buzzed) but that never became a drag still ends in a click —
  // that must not log; nor may a click during/just after a drag. Mouse
  // chooses instantly on mousedown, so only touch presses ≥ the 300ms
  // Sortable delay count as a long-press. Quick taps log as usual.
  function tapLogHabit(taskId) {
    const now = Date.now();
    if (isDragInProgress() || now - lastDragEndAt < POST_DRAG_CLICK_IGNORE_MS) return;
    const chosenThisPress = lastSortableChooseAt >= pressStartAt && now - lastSortableChooseAt < 1000;
    if (chosenThisPress && pressIsTouch && now - pressStartAt >= SORTABLE_TOUCH_OPTIONS.delay) return;
    logHabitNow(taskId);
  }

  // Whole-card tap on a habit card (renderTaskCard). Taps on the card's own
  // interactive children (✎, ↩, ×, collapse toggle, + Add subtask and its
  // input, nested subtask cards, inputs) do their own thing instead. closest()
  // can climb past the card (e.g. to a parent's .task-children when this card
  // is nested), so only matches inside this card count.
  const HABIT_CARD_TAP_IGNORE = [
    'button', 'a', 'input', 'textarea', 'select', 'label',
    '.habit-edit-btn', '.habit-undo-btn', '.task-delete', '.task-collapse-toggle',
    '.task-add-subtask', '.task-children', '.goal-schedule-btn',
  ].join(', ');

  function tapHabitCard(e, taskId) {
    const card = e.currentTarget;
    const hit = e.target && e.target.closest ? e.target.closest(HABIT_CARD_TAP_IGNORE) : null;
    if (hit && hit !== card && card.contains(hit)) return;
    tapLogHabit(taskId);
  }

  // Dragging a habit onto a day column (see handleTaskDrop) logs
  // that specific day instead of "now" — noon-local avoids the log landing
  // on the adjacent day once habitLogDateKey converts it back, same
  // T12:00:00 convention the rest of the app already uses for date math.
  function logHabitOnDate(taskId, date) {
    const task = Storage.getAllTasks().find(t => t.id === taskId);
    if (!task || !date) return;
    // Same-day repeats are intentional (e.g. brushing teeth twice) — never block.
    const habitLog = [...(task.habitLog || []), new Date(date + 'T12:00:00').toISOString()];
    Storage.updateTask(taskId, { habitLog }).then(() => {
      touchForCompletedTask(task);
      refreshTimeline();
      renderBacklog();
      renderSidebarHabits();
      if (currentGoalId) renderGoalDetail(currentGoalId); else renderGoalsDashboard();
      showToast(`🔁 Logged ${task.title} for ${formatDateWithDay(date)}`);
    });
  }

  function undoLastHabitLog(taskId) {
    const task = Storage.getAllTasks().find(t => t.id === taskId);
    if (!task || !task.habitLog || task.habitLog.length === 0) return;
    const habitLog = task.habitLog.slice(0, -1); // removes only the most recent entry
    Storage.updateTask(taskId, { habitLog }).then(() => {
      refreshTimeline();
      renderBacklog();
      renderSidebarHabits();
      if (currentGoalId) renderGoalDetail(currentGoalId); else renderGoalsDashboard();
    });
  }

  // ---- Subgoal done (cascades to descendant subgoals + linked tasks,
  // including each linked task's own nested subtasks). Completing only
  // touches open, non-habit, non-archived tasks (recurring ones spawn their
  // next occurrence); reopening reverts the subgoals only — tasks the user
  // completed stay completed. -----------
  function toggleSubgoalDone(subgoalId) {
    const subgoal = Storage.getAllSubgoals().find(s => s.id === subgoalId);
    if (!subgoal) return;
    const nowDone = !subgoal.done;
    const now = new Date().toISOString();
    const allSubgoalIds = [subgoalId, ...getSubgoalDescendantIds(subgoalId)];

    let tasksWrite = Promise.resolve();
    if (nowDone) {
      const all = Storage.getAllTasks();
      const byId = new Map(all.map(t => [t.id, t]));
      const eligible = t => t && !t.done && !t.archived && !t.isHabit;
      const taskIds = new Set();
      all.filter(t => allSubgoalIds.includes(t.subgoalId) && !t.archived && !t.isHabit).forEach(t => {
        taskIds.add(t.id);
        getDescendantIds(t.id).forEach(id => taskIds.add(id));
      });
      tasksWrite = completeTasks([...taskIds].map(id => byId.get(id)).filter(eligible), now);
    }

    Promise.all([
      Storage.updateSubgoals(allSubgoalIds, { done: nowDone, completedAt: nowDone ? now : null }),
      tasksWrite,
    ]).then(() => {
      touchSubgoalAndGoal(subgoalId);
      if (currentGoalId) renderGoalDetail(currentGoalId);
      refreshTimeline();
      renderBacklog();
      renderDeadlines();
      updateSidebarBadges();
      showToast(nowDone ? '✅ Subgoal done!' : 'Subgoal reopened');
    });
  }

  function toggleSubgoalCollapse(id) {
    if (collapsedSubgoalIds.has(id)) collapsedSubgoalIds.delete(id);
    else collapsedSubgoalIds.add(id);
    if (currentGoalId) renderGoalDetail(currentGoalId);
  }

  // ---- Drag-and-drop within the Goals view (SortableJS) --------
  // Every subgoal-children list (at any nesting depth) and the root
  // subgoal-tree share one group, so dragging a subgoal INTO another's
  // children list is how you nest it (not "drop onto a card").
  function bindSubgoalList(el) {
    if (!el || el.dataset.sortableBound || typeof Sortable === 'undefined') return;
    el.dataset.sortableBound = 'true';
    Sortable.create(el, {
      ...SORTABLE_TOUCH_OPTIONS,
      group: 'subgoals',
      onStart: () => document.body.classList.add('subgoal-dragging'),
      onEnd: evt => {
        document.body.classList.remove('subgoal-dragging');
        handleSubgoalSortableMove(evt);
      },
    });
  }

  // Subgoal task-lists + the goal's direct-tasks zone are in the same
  // 'calendar-tasks' group as the calendar/backlog/subtask lists, with the
  // same shared drop handler (handleTaskDrop) — so a task can move between
  // subgoals, onto a day column (gets a date, keeps its goal link), or from
  // the calendar/backlog into a subgoal (gets linked to that goal).
  function bindGoalTaskList(el) {
    bindCalendarSortable(el);
  }

  // renderGoalDetail rebuilds its whole subtree every time, so every call
  // needs a fresh binding pass (the elements themselves are brand new) —
  // including the task cards' own .task-children lists.
  function initGoalDetailSortables() {
    document.querySelectorAll('.subgoal-tree, .subgoal-children').forEach(bindSubgoalList);
    document.querySelectorAll('.subgoal-tasks, .goal-direct-tasks-zone').forEach(bindGoalTaskList);
    initCalendarSortables();
  }

  function handleSubgoalSortableMove(evt) {
    lastDragEndAt = Date.now();
    const subgoalId = evt.item?.dataset?.subgoalId;
    if (!subgoalId) return;
    // Dropped back where it started — nothing changed.
    if (evt.to === evt.from && evt.oldIndex === evt.newIndex) return;
    const newParentId = evt.to.dataset.parentSubgoalId || null;
    if (newParentId && (newParentId === subgoalId || getSubgoalDescendantIds(subgoalId).includes(newParentId))) {
      if (currentGoalId) renderGoalDetail(currentGoalId); // illegal (cycle) — snap back
      return;
    }
    // The tree renders by sortOrder, so the new position must be saved too
    // (from the subgoal cards' data-sort-order in the target list).
    const siblings = [...evt.to.children].filter(el => el.dataset && el.dataset.subgoalId);
    const sortOrder = midpointSortOrder(siblings, evt.item);
    Storage.updateSubgoal(subgoalId, { parentSubgoalId: newParentId, sortOrder }).then(() => {
      touchSubgoalAndGoal(subgoalId);
      if (currentGoalId) renderGoalDetail(currentGoalId);
    });
  }

  function editSubgoalTitle(subgoalId) {
    const card = document.querySelector(`.subgoal-card[data-subgoal-id="${subgoalId}"]`);
    if (!card) return;
    const titleEl = card.querySelector('.task-title');
    if (!titleEl || titleEl.querySelector('input')) return;
    const subgoal = Storage.getAllSubgoals().find(s => s.id === subgoalId);
    if (!subgoal) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'week-title-input';
    input.value = subgoal.title;
    input.maxLength = 200;

    titleEl.innerHTML = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    function commit() {
      if (committed) return;
      committed = true;
      // Drop focus first so renderGoalDetail isn't deferred (isEditingInside)
      // waiting on this now-finished input.
      input.blur();
      const newTitle = input.value.trim();
      if (newTitle && newTitle !== subgoal.title) {
        Storage.updateSubgoal(subgoalId, { title: newTitle }).then(() => { if (currentGoalId) renderGoalDetail(currentGoalId); });
      } else if (currentGoalId) {
        renderGoalDetail(currentGoalId);
      }
    }
    function cancel() {
      if (committed) return;
      committed = true;
      input.blur();
      if (currentGoalId) renderGoalDetail(currentGoalId);
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
  }

  // ---- Delete-choice popup (subgoal/goal has linked tasks) ----
  function showDeleteLinkedTasksChoice({ count, onUnlink, onDeleteToo, onCancel }) {
    document.getElementById('delete-choice-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'delete-choice-overlay';
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal-content delete-choice-popup">
        <p>This has ${count} linked task${count === 1 ? '' : 's'}. What should happen to ${count === 1 ? 'it' : 'them'}?</p>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary dcp-cancel-btn">Cancel</button>
          <button type="button" class="btn btn-archive dcp-unlink-btn">Unlink (keep tasks)</button>
          <button type="button" class="btn btn-primary dcp-delete-btn">Delete tasks too</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = () => overlay.remove();
    const cancel = () => { cleanup(); if (onCancel) onCancel(); };
    // Escape / Android back (closeTopLayer) go through the same cancel path.
    overlay._dismiss = cancel;
    overlay.querySelector('.dcp-unlink-btn').addEventListener('click', () => { cleanup(); onUnlink(); });
    overlay.querySelector('.dcp-delete-btn').addEventListener('click', () => { cleanup(); onDeleteToo(); });
    overlay.querySelector('.dcp-cancel-btn').addEventListener('click', cancel);
    overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
  }

  function confirmDeleteSubgoal(subgoalId) {
    const subgoal = Storage.getAllSubgoals().find(s => s.id === subgoalId);
    if (!subgoal) return;
    const descendantIds = getSubgoalDescendantIds(subgoalId);
    const allSubgoalIds = [subgoalId, ...descendantIds];
    const linkedTasks = Storage.getAllTasks().filter(t => allSubgoalIds.includes(t.subgoalId));

    function doDelete(taskAction) {
      (async () => {
        if (linkedTasks.length) {
          if (taskAction === 'delete') {
            const taskIds = new Set();
            linkedTasks.forEach(t => { taskIds.add(t.id); getDescendantIds(t.id).forEach(id => taskIds.add(id)); });
            await Storage.deleteTasks([...taskIds]);
          } else {
            await Storage.updateTaskFields(linkedTasks.map(t => ({ id: t.id, updates: { subgoalId: null } })));
          }
        }
        await Storage.deleteSubgoals(allSubgoalIds);
        if (currentGoalId) renderGoalDetail(currentGoalId);
        refreshTimeline();
        renderBacklog();
        renderDeadlines();
        showToast('🗑️ Subgoal deleted');
      })();
    }

    if (linkedTasks.length === 0) {
      const msg = descendantIds.length
        ? `Delete "${subgoal.title}" and its ${descendantIds.length} nested subgoal${descendantIds.length === 1 ? '' : 's'}?`
        : `Delete "${subgoal.title}"?`;
      if (confirm(msg)) doDelete('unlink');
    } else {
      showDeleteLinkedTasksChoice({
        count: linkedTasks.length,
        onUnlink: () => doDelete('unlink'),
        onDeleteToo: () => doDelete('delete'),
      });
    }
  }

  function confirmDeleteGoal(goalId) {
    const goal = Storage.getAllGoals().find(g => g.id === goalId);
    if (!goal) return;
    const subgoalIds = getGoalSubgoals(goalId).map(s => s.id);
    const linkedTasks = Storage.getAllTasks().filter(t => t.goalId === goalId);

    function doDelete(taskAction) {
      (async () => {
        if (linkedTasks.length) {
          if (taskAction === 'delete') {
            const taskIds = new Set();
            linkedTasks.forEach(t => { taskIds.add(t.id); getDescendantIds(t.id).forEach(id => taskIds.add(id)); });
            await Storage.deleteTasks([...taskIds]);
          } else {
            await Storage.updateTaskFields(linkedTasks.map(t => ({ id: t.id, updates: { goalId: null, subgoalId: null } })));
          }
        }
        if (subgoalIds.length) await Storage.deleteSubgoals(subgoalIds);
        await Storage.deleteGoal(goalId);
        closeGoalModal();
        closeGoalsPage();
        renderGoalsDashboard();
        refreshTimeline();
        renderBacklog();
        renderDeadlines();
        showToast('🗑️ Goal deleted');
      })();
    }

    if (linkedTasks.length === 0) {
      const msg = subgoalIds.length
        ? `Delete "${goal.title}" and its ${subgoalIds.length} subgoal${subgoalIds.length === 1 ? '' : 's'}?`
        : `Delete "${goal.title}"?`;
      if (confirm(msg)) doDelete('unlink');
    } else {
      showDeleteLinkedTasksChoice({
        count: linkedTasks.length,
        onUnlink: () => doDelete('unlink'),
        onDeleteToo: () => doDelete('delete'),
      });
    }
  }

  function deleteCurrentGoalFromModal() {
    if (!editingGoalId) return;
    confirmDeleteGoal(editingGoalId);
  }

  // ---- Goal-tag badge on task cards --------------------------
  function goalTagHtml(task) {
    if (!task.goalId) return '';
    const goal = Storage.getAllGoals().find(g => g.id === task.goalId);
    if (!goal) return '';
    return `<span class="task-goal-tag" title="${escapeHtml(goal.title)}">🎯 ${escapeHtml(goal.title)}</span>`;
  }

  // ---- Goals dashboard (lightweight, lives in the drawer) + detail
  // (a separate page, NOT the drawer — these are two distinct surfaces) ----
  function renderGoalsDashboard() {
    renderSidebarHabits();
    const container = document.getElementById('goals-grid');
    if (!container) return;
    const goals = Storage.getAllGoals();
    container.innerHTML = goals.length === 0
      ? '<div class="empty-state">No goals yet — click "+ New Goal" to start one 🎯</div>'
      : goals.map(renderGoalCard).join('');
  }

  function renderGoalCard(goal) {
    const { done, total } = getGoalProgress(goal.id);
    const progressHtml = total > 0
      ? `<div class="goal-progress"><div class="goal-progress-fill" style="width:${Math.round((done / total) * 100)}%"></div></div>
         <div class="goal-progress-label">${done}/${total} subgoals</div>`
      : '';
    const tier = dormancyTier(goal.lastTouchedAt);
    const tierClass = tier === 'fading' ? 'goal-fading' : tier === 'dormant' ? 'goal-dormant' : '';
    return `
      <div class="goal-card ${tierClass}" onclick="App.openGoalDetail('${goal.id}')">
        <div class="goal-card-title">🎯 ${escapeHtml(goal.title)}</div>
        ${progressHtml}
        <div class="goal-last-touched">${lastTouchedLabel(goal.lastTouchedAt)}</div>
      </div>`;
  }

  function openGoalDetail(goalId) {
    currentGoalId = goalId;
    renderGoalDetail(goalId);
    document.getElementById('goals-page')?.classList.add('open');
    // The drawer's job here was just letting you pick a goal — once a
    // specific goal's page is open, close it so the calendar stays visible
    // (the goals page is a side panel, not a full takeover, specifically so
    // tasks can still be dragged onto a day column while it's open).
    document.getElementById('app-container')?.classList.add('sidebar-collapsed');
  }

  function closeGoalsPage() {
    currentGoalId = null;
    document.getElementById('goals-page')?.classList.remove('open');
  }

  // ---- Habits (prioritized slot in the drawer — not a dump of every task) ----
  function getAllHabitTasks() {
    return Storage.getAllTasks()
      .filter(t => !t.archived && t.isHabit)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  function renderSidebarHabits() {
    const container = document.getElementById('sidebar-habits-list');
    if (!container) return;
    if (deferIfEditing('habits', container, renderSidebarHabits)) return;
    const habits = getAllHabitTasks();
    container.innerHTML = habits.length === 0
      ? '<div class="empty-state">No habits yet — make one from a task\'s edit screen</div>'
      : habits.map(t => renderTaskCard(t, { isBacklog: true, isHabitsList: true })).join('');
    initCalendarSortables(); // bind the habit cards' fresh .task-children lists
    reapplySearch();
  }


  // Goal notes → safe HTML: every piece is escaped, newlines become <br>,
  // and http(s) URLs become links (trailing punctuation stays outside).
  function formatNotesHtml(text) {
    const urlRe = /https?:\/\/[^\s<>\x22\x27]+/g;
    const textPart = s => escapeHtml(s).replace(/\r?\n/g, '<br>');
    let html = '';
    let last = 0;
    let m;
    while ((m = urlRe.exec(text)) !== null) {
      let url = m[0];
      const trailing = '.,;:!?)]';
      while (url.length && trailing.includes(url[url.length - 1])) url = url.slice(0, -1);
      html += textPart(text.slice(last, m.index));
      html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
      last = m.index + url.length;
    }
    html += textPart(text.slice(last));
    return html;
  }

  function renderGoalDetail(goalId) {
    const goal = Storage.getAllGoals().find(g => g.id === goalId);
    const container = document.getElementById('goal-detail-content');
    if (!goal || !container) return;
    if (deferIfEditing('goalDetail', container, () => { if (currentGoalId) renderGoalDetail(currentGoalId); })) return;

    const { done, total } = getGoalProgress(goalId);
    const progressHtml = total > 0
      ? `<div class="goal-progress"><div class="goal-progress-fill" style="width:${Math.round((done / total) * 100)}%"></div></div>
         <div class="goal-progress-label">${done}/${total} subgoals · ${lastTouchedLabel(goal.lastTouchedAt)}</div>`
      : `<div class="goal-last-touched">${lastTouchedLabel(goal.lastTouchedAt)}</div>`;

    const finishConditionHtml = goal.finishCondition
      ? `<div class="goal-finish-condition">🏁 ${escapeHtml(goal.finishCondition)}</div>` : '';
    const notesHtml = (goal.notes && goal.notes.trim())
      ? `<div class="goal-notes-block">${formatNotesHtml(goal.notes)}</div>` : '';

    const subgoalTreeHtml = renderSubgoalTree(goalId);
    const directTasks = getGoalDirectTasks(goalId);
    const directTasksHtml = directTasks.length
      ? directTasks.map(t => renderTaskCard(t, { isBacklog: true, isGoalPage: true })).join('')
      : '<div class="empty-state">Drag a task here, or add one below</div>';

    container.innerHTML = `
      <div class="goal-detail-header">
        <h2>🎯 ${escapeHtml(goal.title)}</h2>
        <button class="btn btn-secondary" onclick="App.openGoalModal('${goal.id}')">✏️ Edit</button>
      </div>
      ${finishConditionHtml}
      ${notesHtml}
      ${progressHtml}

      <div class="goal-section-title">Subgoals</div>
      <div class="subgoal-tree" data-parent-subgoal-id="">${subgoalTreeHtml}</div>
      <div class="goal-add-subgoal"><button class="add-task-btn" onclick="App.startSubgoalQuickAdd(this,'${goal.id}',null)">+ Add subgoal</button></div>

      <div class="goal-section-title">Tasks not tied to a subgoal</div>
      <div class="goal-direct-tasks-zone" data-goal-id="${goal.id}">${directTasksHtml}</div>
      <div class="goal-add-task"><button class="add-task-btn" onclick="App.startGoalTaskQuickAdd(this,{goalId:'${goal.id}'})">+ Add task</button></div>
    `;

    initGoalDetailSortables();
    reapplySearch();
  }

  // Goal-page 📅 button: the (invisible) date input itself receives the tap.
  // Prefer showPicker() where available; otherwise let the input's default
  // activation open the native picker (Android WebView does this on tap).
  function openSchedulePicker(input, e) {
    if (e) e.stopPropagation();
    if (!input || typeof input.showPicker !== 'function') return;
    try {
      input.showPicker();
      if (e) e.preventDefault(); // picker already open — skip default activation
    } catch {
      // NotAllowedError etc. — fall back to the default activation / focus.
      try { input.focus(); } catch { /* ignore */ }
    }
  }

  function scheduleGoalTask(taskId, date) {
    if (!taskId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return; // cleared/invalid → no change
    const task = Storage.getAllTasks().find(t => t.id === taskId);
    if (!task) return;
    Storage.updateTask(taskId, { assignedDate: date }).then(() => {
      rerenderTaskSurfaces(); // timeline, backlog, deadlines, habits, goal page
      showToast(`📅 Scheduled for ${formatDateWithDay(date)}`);
    });
  }

  function renderSubgoalTree(goalId) {
    const roots = getGoalSubgoals(goalId)
      .filter(s => !s.parentSubgoalId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return roots.map(renderSubgoalCard).join('');
  }

  function renderSubgoalCard(subgoal) {
    const children = getSubgoalChildren(subgoal.id);
    const hasChildren = children.length > 0;
    const collapsed = collapsedSubgoalIds.has(subgoal.id);
    const tasks = getSubgoalTasks(subgoal.id);

    // Collapsing hides both the subgoal's tasks and its child subgoals, so
    // the toggle shows whenever there's either to hide.
    const toggleHtml = (hasChildren || tasks.length > 0)
      ? `<button class="task-collapse-toggle" onclick="event.stopPropagation(); App.toggleSubgoalCollapse('${subgoal.id}')" title="${collapsed ? 'Expand' : 'Collapse'}">${collapsed ? '▸' : '▾'}</button>`
      : '';

    // Always render these two containers (even empty) so they're valid
    // drop targets for Sortable — collapsing just hides them visually.
    const childrenHtml = children.map(renderSubgoalCard).join('');
    const tasksHtml = tasks.map(t => renderTaskCard(t, { isBacklog: true, isGoalPage: true })).join('');

    return `
      <div class="subgoal-card ${subgoal.done ? 'task-done' : ''}" data-kind="subgoal" data-subgoal-id="${subgoal.id}" data-sort-order="${Number(subgoal.sortOrder) || 0}">
        <div class="task-top-row">
          ${toggleHtml}
          <button class="task-check ${subgoal.done ? 'checked' : ''}" onclick="App.toggleSubgoalDone('${subgoal.id}')" title="${subgoal.done ? 'Mark undone' : 'Mark done'}">${subgoal.done ? '✓' : ''}</button>
          <span class="task-title" onclick="App.editSubgoalTitle('${subgoal.id}')">${escapeHtml(subgoal.title)}</span>
          <span class="goal-last-touched">${lastTouchedLabel(subgoal.lastTouchedAt)}</span>
          <button class="task-delete" onclick="App.confirmDeleteSubgoal('${subgoal.id}')" title="Delete">×</button>
        </div>
        <div class="subgoal-tasks" data-subgoal-id="${subgoal.id}" data-goal-id="${subgoal.goalId}" style="${collapsed ? 'display:none' : ''}">${tasksHtml}</div>
        <div class="subgoal-children" data-parent-subgoal-id="${subgoal.id}" style="${collapsed ? 'display:none' : ''}">${childrenHtml}</div>
        <div class="task-add-subtask">
          <button class="add-subtask-btn" onclick="App.startSubgoalQuickAdd(this,'${subgoal.goalId}','${subgoal.id}')">+ Add subgoal</button>
          <button class="add-subtask-btn" onclick="App.startGoalTaskQuickAdd(this,{goalId:'${subgoal.goalId}',subgoalId:'${subgoal.id}'})">+ Add task</button>
        </div>
      </div>`;
  }

  // ---- Quick-add for subgoals / goal tasks -------------------
  function startSubgoalQuickAdd(btn, goalId, parentSubgoalId) {
    const container = btn.parentElement;
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quick-add-input';
    input.placeholder = 'Subgoal name… (Enter)';
    input.maxLength = 200;
    container.appendChild(input);
    input.focus();

    let closed = false;
    function commit() {
      if (closed) return;
      closed = true;
      const title = input.value.trim();
      cleanup();
      if (title) {
        const subgoal = createSubgoal({ goalId, parentSubgoalId, title });
        Storage.addSubgoal(subgoal).then(() => {
          touchGoal(goalId);
          if (currentGoalId) renderGoalDetail(currentGoalId);
          showToast('🎯 Subgoal added');
        });
      }
    }
    function cancel() { if (closed) return; closed = true; cleanup(); }
    function cleanup() { if (document.body.contains(input)) input.remove(); btn.style.display = ''; flushDeferredRenders(); }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (!closed) commit(); }, 150); });
  }

  function startGoalTaskQuickAdd(btn, { goalId, subgoalId = null }) {
    const container = btn.parentElement;
    btn.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quick-add-input';
    input.placeholder = 'Task name… (Enter)';
    input.maxLength = 200;
    container.appendChild(input);
    input.focus();

    let closed = false;
    function commit() {
      if (closed) return;
      closed = true;
      const title = input.value.trim();
      cleanup();
      if (title) {
        const task = createTask({ title, goalId, subgoalId });
        Storage.addTask(task).then(() => {
          touchForNewGoalTask(goalId, subgoalId);
          if (currentGoalId) renderGoalDetail(currentGoalId);
          showToast('✅ Task added');
        });
      }
    }
    function cancel() { if (closed) return; closed = true; cleanup(); }
    function cleanup() { if (document.body.contains(input)) input.remove(); btn.style.display = ''; flushDeferredRenders(); }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (!closed) commit(); }, 150); });
  }

  // ---- Goal CRUD modal ----------------------------------------
  function openGoalModal(goalId) {
    editingGoalId = goalId;
    const modal = document.getElementById('goal-modal');
    const deleteBtn = document.querySelector('.goal-delete-btn');
    if (goalId) {
      const goal = Storage.getAllGoals().find(g => g.id === goalId);
      if (!goal) return;
      document.getElementById('goal-modal-title').textContent = 'Edit Goal';
      document.getElementById('goal-title-input').value = goal.title;
      document.getElementById('goal-finish-condition').value = goal.finishCondition || '';
      document.getElementById('goal-notes').value = goal.notes || '';
      if (deleteBtn) deleteBtn.style.display = '';
    } else {
      document.getElementById('goal-modal-title').textContent = 'New Goal';
      document.getElementById('goal-title-input').value = '';
      document.getElementById('goal-finish-condition').value = '';
      document.getElementById('goal-notes').value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }
    modal.classList.add('open');
    document.getElementById('goal-title-input').focus();
  }

  function closeGoalModal() {
    document.getElementById('goal-modal').classList.remove('open');
    editingGoalId = null;
  }

  function handleGoalFormSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('goal-title-input').value.trim();
    if (!title) return;
    const finishCondition = document.getElementById('goal-finish-condition').value.trim();
    const notes = document.getElementById('goal-notes').value.trim();

    if (editingGoalId) {
      const id = editingGoalId;
      Storage.updateGoal(id, { title, finishCondition, notes }).then(() => {
        closeGoalModal();
        if (currentGoalId === id) renderGoalDetail(id); else renderGoalsDashboard();
        showToast('🎯 Goal saved');
      });
    } else {
      const goal = createGoal({ title, finishCondition, notes });
      Storage.addGoal(goal).then(() => {
        closeGoalModal();
        openGoalDetail(goal.id);
        showToast('🎯 Goal created');
      });
    }
  }

  // ---- Paste-import -------------------------------------------
  function parseGoalOutline(text) {
    const lines = text.split('\n').map(l => l.replace(/\t/g, '  ')).filter(l => l.trim().length > 0);
    if (lines.length === 0) return null;

    const titleMatch = lines[0].match(/^#\s+(.+)/);
    if (!titleMatch) return null;
    const goalTitle = titleMatch[1].trim();

    let idx = 1;
    let finishCondition = '';
    if (lines[idx]) {
      const fcMatch = lines[idx].match(/^>\s+(.+)/);
      if (fcMatch) { finishCondition = fcMatch[1].trim(); idx++; }
    }

    const subgoals = [];
    const tasks = [];
    const stack = [];
    let subgoalCounter = 0;

    for (; idx < lines.length; idx++) {
      const line = lines[idx];
      const leadingSpaces = (line.match(/^( *)/) || ['', ''])[1].length;
      const indent = Math.floor(leadingSpaces / 2);
      const trimmed = line.trim();

      if (trimmed.startsWith('- ')) {
        while (stack.length && stack[stack.length - 1].depth >= indent) stack.pop();
        const parentTempId = stack.length ? stack[stack.length - 1].tempId : null;
        const tempId = `sg${subgoalCounter++}`;
        subgoals.push({ tempId, parentTempId, title: trimmed.slice(2).trim() });
        stack.push({ depth: indent, tempId });
      } else if (trimmed.startsWith('* ')) {
        let owner = null;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].depth < indent) { owner = stack[i].tempId; break; }
        }
        let body = trimmed.slice(2).trim();
        let assignedDate = null;
        body = body.replace(/@(\d{4}-\d{2}-\d{2})/, (_, d) => { assignedDate = d; return ''; });
        // Goal tasks never have deadlines: a "!date" is stripped and ignored.
        body = body.replace(/!(\d{4}-\d{2}-\d{2})/, '');
        tasks.push({ title: body.trim(), assignedDate, subgoalTempId: owner });
      } else {
        console.warn('Skipping unrecognized line in goal import:', line);
      }
    }

    return { goalTitle, finishCondition, subgoals, tasks };
  }

  function handleGoalImportSubmit(e) {
    e.preventDefault();
    const text = document.getElementById('goal-import-textarea').value;
    const parsed = parseGoalOutline(text);
    if (!parsed) {
      showToast('Could not parse plan — make sure it starts with "# Goal Title"', 'error');
      return;
    }

    const goal = createGoal({ title: parsed.goalTitle, finishCondition: parsed.finishCondition });
    Storage.addGoal(goal).then(async () => {
      const idMap = {};
      for (const sg of parsed.subgoals) {
        const subgoal = createSubgoal({
          goalId: goal.id,
          parentSubgoalId: sg.parentTempId ? idMap[sg.parentTempId] : null,
          title: sg.title,
        });
        await Storage.addSubgoal(subgoal);
        idMap[sg.tempId] = subgoal.id;
      }
      for (const t of parsed.tasks) {
        const task = createTask({
          title: t.title,
          assignedDate: t.assignedDate,
          goalId: goal.id,
          subgoalId: t.subgoalTempId ? idMap[t.subgoalTempId] : null,
        });
        await Storage.addTask(task);
      }
      touchGoal(goal.id);
      closeGoalImportModal();
      openGoalDetail(goal.id);
      showToast(`🎯 Imported "${parsed.goalTitle}" — ${parsed.subgoals.length} subgoals, ${parsed.tasks.length} tasks`);
    });
  }

  function openGoalImportModal() {
    document.getElementById('goal-import-textarea').value = '';
    document.getElementById('goal-import-modal').classList.add('open');
  }

  function closeGoalImportModal() {
    document.getElementById('goal-import-modal').classList.remove('open');
  }

  // ---- Search -----------------------------------------------
  // Subtasks render INSIDE their parent's card, so a card stays visible when
  // it OR any descendant card matches: hide every non-matching card, then
  // un-hide each match's ancestor cards. Title/category are read from the
  // card's own rows only (not from a nested child's).
  // A match inside a collapsed parent temporarily reveals that collapsed
  // .task-children list (marked so clearing the search re-collapses it).
  function restoreSearchExpandedLists() {
    document.querySelectorAll('.task-children[data-search-expanded]').forEach(list => {
      list.style.display = 'none';
      delete list.dataset.searchExpanded;
    });
  }

  function applyNestedCardFilter(cards, matches) {
    restoreSearchExpandedLists();
    const matched = cards.filter(matches);
    const matchedSet = new Set(matched);
    cards.forEach(card => { card.style.display = matchedSet.has(card) ? '' : 'none'; });
    matched.forEach(card => {
      let list = card.parentElement?.closest('.task-children');
      while (list) {
        if (list.style.display === 'none') { list.style.display = ''; list.dataset.searchExpanded = 'true'; }
        list = list.parentElement?.closest('.task-children');
      }
      let ancestor = card.parentElement?.closest('.task-card');
      while (ancestor) {
        ancestor.style.display = '';
        ancestor = ancestor.parentElement?.closest('.task-card');
      }
    });
    return matched.length;
  }

  function ownCardText(card, selector) {
    return card.querySelector(`:scope > .task-top-row ${selector}, :scope > .task-meta ${selector}`)?.textContent.toLowerCase() || '';
  }

  // The live top-bar query, so the filter can be re-applied after any render
  // rebuilds task cards (otherwise re-rendered cards all reappear).
  let currentSearchQuery = '';
  let searchReapplyQueued = false;

  // Coalesces the many render calls of one update into a single filter pass
  // (microtask: runs after the current render code, before paint).
  function reapplySearch() {
    if (!currentSearchQuery.trim() || searchReapplyQueued) return;
    searchReapplyQueued = true;
    queueMicrotask(() => {
      searchReapplyQueued = false;
      if (currentSearchQuery.trim()) handleSearch(currentSearchQuery);
    });
  }

  function handleSearch(query) {
    currentSearchQuery = String(query || '');
    const q = currentSearchQuery.toLowerCase().trim();
    const cards = [...document.querySelectorAll('.task-card')];
    if (!q) { restoreSearchExpandedLists(); cards.forEach(card => { card.style.display = ''; }); return; }
    applyNestedCardFilter(cards, card =>
      ownCardText(card, '.task-title').includes(q) || ownCardText(card, '.task-category').includes(q));
  }

  // ---- Export / Import --------------------------------------
  function exportTasks() {
    const json = String(Storage.exportData());
    const filename = `todo-backup-${today()}.json`;
    // Inside the Android WebView shell, blob/<a download> doesn't work —
    // hand the file to the native bridge instead.
    if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') {
      try {
        window.AndroidBridge.saveFile(filename, json, 'application/json');
      } catch (err) {
        console.error('AndroidBridge.saveFile failed:', err);
        showToast('Export failed', 'error');
      }
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
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
  // Closes ONLY the topmost open layer: the day colour picker → an open
  // modal → the goal page → the sidebar drawer. Returns true if something
  // was closed. Used by Escape and by the Android back button
  // (App.handleBackButton); never throws — if a layer's closer throws, the
  // layer is force-hidden and it still counts as closed.
  const MODAL_CLOSERS = {
    'task-modal': () => closeModal(),
    'archive-modal': () => closeArchivePanel(),
    'goal-modal': () => closeGoalModal(),
    'goal-import-modal': () => closeGoalImportModal(),
    // Dynamically created — cancel through its own onCancel path + remove.
    'delete-choice-overlay': () => {
      const overlay = document.getElementById('delete-choice-overlay');
      if (!overlay) return;
      if (typeof overlay._dismiss === 'function') overlay._dismiss();
      else overlay.remove();
    },
  };

  // Runs `close`; if it throws, runs `forceHide` instead. Always true.
  function closeLayer(close, forceHide) {
    try {
      close();
    } catch (err) {
      console.error('Closing layer failed:', err);
      try { forceHide(); } catch (err2) { console.error('Force-hide failed:', err2); }
    }
    return true;
  }

  function closeTopLayer() {
    try {
      // Mid-drag: swallow Back/Escape — closing the layer under the finger
      // would yank away the list being dragged from. "Handled" = true.
      if (isDragInProgress()) return true;
      if (isDayColorPickerOpen()) {
        return closeLayer(closeDayColorPicker, () => document.getElementById('day-color-picker')?.remove());
      }
      // Later in the DOM = stacked on top when several share a z-index.
      const openModals = [...document.querySelectorAll('.modal-overlay.open')];
      if (openModals.length) {
        const top = openModals[openModals.length - 1];
        const close = MODAL_CLOSERS[top.id];
        const forceHide = () => {
          if (top.id === 'delete-choice-overlay') top.remove();
          else top.classList.remove('open');
        };
        return closeLayer(close || forceHide, forceHide);
      }
      if (isGoalsPageOpen()) {
        return closeLayer(closeGoalsPage, () => document.getElementById('goals-page')?.classList.remove('open'));
      }
      const app = document.getElementById('app-container');
      if (app && !app.classList.contains('sidebar-collapsed')) {
        return closeLayer(collapseSidebar, () => app.classList.add('sidebar-collapsed'));
      }
    } catch (err) {
      console.error('closeTopLayer failed:', err);
    }
    return false;
  }

  // ---- Tap outside the goal page closes it --------------------
  // The goal page is a side panel with NO backdrop on purpose (its tasks
  // must stay draggable onto the calendar), so this is a document-level
  // check instead. Bubble phase + composedPath(): the path is fixed at
  // dispatch, so it's still right when a handler re-rendered/removed the
  // clicked element (e.g. a button inside the goal page).
  const GOAL_PAGE_OUTSIDE_IGNORE = [
    '#goals-page', '.modal-overlay', '#day-color-picker',
    '.goal-card', '#goals-pill-btn', '#sidebar', '.sidebar-backdrop', '#menu-btn',
    '#toast-container', '.toast',
  ].join(', ');
  const POST_DRAG_CLICK_IGNORE_MS = 300;

  function handleGoalPageOutsideClick(e) {
    if (!isGoalsPageOpen()) return;
    if (isDragInProgress() || Date.now() - lastDragEndAt < POST_DRAG_CLICK_IGNORE_MS) return;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const inside = path.length
      ? path.some(n => n && n.nodeType === 1 && n.matches(GOAL_PAGE_OUTSIDE_IGNORE))
      : !!(e.target && e.target.closest && e.target.closest(GOAL_PAGE_OUTSIDE_IGNORE));
    if (inside) return;
    closeGoalsPage();
  }

  function handleBackButton() {
    try { return closeTopLayer() === true; } catch { return false; }
  }

  function initKeyboard() {
    document.addEventListener('keydown', e => {
      // Inline inputs (quick-add, subgoal/week title edit) handle Escape
      // themselves and call preventDefault — don't also close a layer.
      if (e.key === 'Escape' && !e.defaultPrevented) closeTopLayer();
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

  // Safe for text content AND quoted attribute values (quotes are escaped).
  // Not for JS string contexts — pass such values via data-* attributes.
  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>\x22\x27]/g, ch => HTML_ESCAPES[ch]);
  }

  // ---- Init -------------------------------------------------
  function init() {
    // Storage writes are fire-and-forget promises with no .catch at the call
    // sites — without this, a failed save (offline, permission, batch error)
    // just silently does nothing and the user thinks it worked.
    // Only Firestore errors get the "failed to save" toast; everything is logged.
    window.addEventListener('unhandledrejection', e => {
      console.error('Unhandled rejection:', e.reason);
      const r = e.reason;
      if (r && (r.name === 'FirebaseError' || typeof r.code === 'string')) {
        showToast('⚠ Something failed to save — check your connection and try again', 'error');
      }
    });
    // Flush renders that were deferred while an inline input had focus.
    document.addEventListener('focusout', flushDeferredRenders);
    initTimeline();
    renderBacklog();
    renderDeadlines();
    renderGoalsDashboard();
    updateSidebarBadges();
    initKeyboard();
    initDayHeaderLongPress();
    initCategoryColorUI();
    initDrawerSwipeToClose();
    document.addEventListener('click', handleGoalPageOutsideClick);
    document.getElementById('task-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('task-modal').addEventListener('click', e => { if (e.target.id === 'task-modal') closeModal(); });
    document.getElementById('archive-modal')?.addEventListener('click', e => { if (e.target.id === 'archive-modal') closeArchivePanel(); });
    document.getElementById('search-input').addEventListener('input', e => handleSearch(e.target.value));
    document.getElementById('archive-search-input')?.addEventListener('input', e => filterArchiveTasks(e.target.value));
    document.getElementById('goal-form')?.addEventListener('submit', handleGoalFormSubmit);
    document.getElementById('goal-modal')?.addEventListener('click', e => { if (e.target.id === 'goal-modal') closeGoalModal(); });
    document.getElementById('goal-import-form')?.addEventListener('submit', handleGoalImportSubmit);
    document.getElementById('goal-import-modal')?.addEventListener('click', e => { if (e.target.id === 'goal-import-modal') closeGoalImportModal(); });

    // Real-time sync: refresh UI when data changes from another device
    Storage.onChange(() => {
      refreshTimeline();
      renderBacklog();
      renderDeadlines();
      updateSidebarBadges();
      if (isGoalsPageOpen() && currentGoalId) renderGoalDetail(currentGoalId);
      if (isGoalsDrawerTabOpen()) renderGoalsDashboard();
    });

    Storage.onGoalsChange(() => {
      updateSidebarBadges();
      if (isGoalsPageOpen() && currentGoalId) renderGoalDetail(currentGoalId);
      if (isGoalsDrawerTabOpen()) renderGoalsDashboard();
    });

    // Midnight auto-refresh
    setInterval(() => { const n = new Date(); if (n.getHours() === 0 && n.getMinutes() === 0) { initTimeline(); refreshTimeline(); } }, 60000);
    console.log('✅ TODO App initialized');
  }

  return {
    init, scrollToToday,
    startQuickAdd, startBacklogQuickAdd, startSubtaskQuickAdd,
    openEditModal, closeModal, archiveCurrentTask, deleteCurrentTask, toggleCategorySwatches,
    toggleDone, confirmDelete,
    toggleTaskCollapse,
    unarchiveTask, openArchivePanel, closeArchivePanel, archiveCategory, unarchiveCategory, toggleArchiveGroup,
    switchSidebarTab, sortBacklogByImportance, sortBacklogByUrgency,
    toggleSidebar, openSidebarToTab,
    toggleHabitFieldsVisibility, logHabitNow, tapLogHabit, tapHabitCard, undoLastHabitLog,
    exportTasks, importTasks, showToast,
    handleBackButton,
    editWeekTitle, openDayColorPicker,
    openGoalDetail, closeGoalsPage,
    toggleSubgoalDone, toggleSubgoalCollapse, editSubgoalTitle, confirmDeleteSubgoal,
    startSubgoalQuickAdd, startGoalTaskQuickAdd,
    openSchedulePicker, scheduleGoalTask,
    openGoalModal, closeGoalModal, confirmDeleteGoal, deleteCurrentGoalFromModal,
    openGoalImportModal, closeGoalImportModal,
  };
})();

// A top-level const is NOT a window property — the Android wrapper calls
// window.App.handleBackButton(), so expose it explicitly.
window.App = App;

document.addEventListener('DOMContentLoaded', App.init);
