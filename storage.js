// ============================================================
// Storage Layer — Firebase Firestore with real-time sync
// ============================================================

const Storage = (() => {
  const SETTINGS_KEY = 'todo_app_settings';
  
  // Local cache of tasks (updated via real-time listener)
  let tasksCache = [];
  let isInitialized = false;
  let onChangeCallbacks = [];

  // Local cache of color metadata (updated via real-time listener)
  let weekNamesCache = {};
  let dayColorsCache = {};
  // Category → colour picked by the user (edit modal). Categories without an
  // entry keep the automatic hash colour (App.categoryColor).
  let categoryColorsCache = {};
  let colorDataInitialized = false;

  function loadColorCacheFromLocalStorage() {
    try { weekNamesCache = JSON.parse(localStorage.getItem('weekNames') || '{}'); } catch { weekNamesCache = {}; }
    try { dayColorsCache = JSON.parse(localStorage.getItem('dayColors') || '{}'); } catch { dayColorsCache = {}; }
    try { categoryColorsCache = JSON.parse(localStorage.getItem('categoryColors') || '{}'); } catch { categoryColorsCache = {}; }
  }
  loadColorCacheFromLocalStorage();

  // Get Firestore collection reference for this user
  function getTasksCollection() {
    return db.collection('users').doc(USER_ID).collection('tasks');
  }

  // Get Firestore document reference for color metadata
  function getColorDataRef() {
    return db.collection('users').doc(USER_ID).collection('metadata').doc('colorData');
  }

  // Initialize real-time listener
  function initRealTimeSync() {
    if (isInitialized) return;
    isInitialized = true;

    getTasksCollection().onSnapshot((snapshot) => {
      tasksCache = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Notify all listeners that data changed
      onChangeCallbacks.forEach(cb => {
        try { cb(tasksCache); } catch (e) { console.error(e); }
      });
    }, (error) => {
      console.error('Firestore sync error:', error);
    });
  }

  // Subscribe to changes (for UI updates)
  function onChange(callback) {
    onChangeCallbacks.push(callback);
    // Return unsubscribe function
    return () => {
      onChangeCallbacks = onChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  // ---- Batched writes -----------------------------------------
  // Firestore rejects any single batch over 500 writes, so every bulk
  // operation goes through this: it splits the writes into chunks of at
  // most 500 and commits them one after another. (Chunks aren't atomic with
  // each other, but a bulk action now completes instead of failing outright.)
  const MAX_BATCH_WRITES = 500;

  async function commitInChunks(ops) {
    for (let i = 0; i < ops.length; i += MAX_BATCH_WRITES) {
      const batch = db.batch();
      ops.slice(i, i + MAX_BATCH_WRITES).forEach(op => op(batch));
      await batch.commit();
    }
  }

  // Make a collection match `items` exactly (used by backup import — tasks,
  // goals and subgoals alike). Order matters for safety: the backup's docs
  // are written FIRST, and only afterwards are existing docs that aren't in
  // the backup deleted. If a chunk fails partway, you end up with extra docs,
  // never with your data deleted and the backup only half-written.
  async function replaceCollection(collection, items) {
    const valid = items.filter(item => item && typeof item.id === 'string' && item.id);
    const keepIds = new Set(valid.map(item => item.id));
    const existing = await collection.get();
    await commitInChunks(valid.map(item => {
      const { id, ...data } = item;
      return b => b.set(collection.doc(id), data);
    }));
    await commitInChunks(existing.docs
      .filter(doc => !keepIds.has(doc.id))
      .map(doc => b => b.delete(doc.ref)));
  }

  // ---- Tasks ------------------------------------------------
  function getAllTasks() {
    return tasksCache;
  }

  async function saveTasks(tasks) {
    // Replace all tasks (used for import)
    await replaceCollection(getTasksCollection(), tasks);
    return tasks;
  }

  async function addTask(task) {
    const { id, ...data } = task;
    await getTasksCollection().doc(id).set(data);
    return [...tasksCache, task];
  }

  async function updateTask(id, updates) {
    await getTasksCollection().doc(id).update(updates);
    return tasksCache.map(t => t.id === id ? { ...t, ...updates } : t);
  }

  async function deleteTask(id) {
    await getTasksCollection().doc(id).delete();
    return tasksCache.filter(t => t.id !== id);
  }

  // Delete multiple tasks (e.g. a task + all its nested descendants) in one batch
  async function deleteTasks(ids) {
    const collection = getTasksCollection();
    await commitInChunks(ids.map(id => b => b.delete(collection.doc(id))));
    return tasksCache.filter(t => !ids.includes(t.id));
  }

  // Apply the same field updates to multiple tasks in one batch (e.g. archive/unarchive a whole subtree)
  async function updateTasks(ids, updates) {
    const collection = getTasksCollection();
    await commitInChunks(ids.map(id => b => b.update(collection.doc(id), updates)));
    return tasksCache.map(t => ids.includes(t.id) ? { ...t, ...updates } : t);
  }

  // Like updateTasks, but each task gets its own distinct updates object
  // (e.g. a different sortOrder per task). Only touches the given docs —
  // unlike saveTasks, it never deletes/recreates the whole collection, so it
  // can't clobber a task someone else just created on another device.
  async function updateTaskFields(entries) {
    const collection = getTasksCollection();
    await commitInChunks(entries.map(({ id, updates }) => b => b.update(collection.doc(id), updates)));
    return tasksCache.map(t => {
      const entry = entries.find(e => e.id === t.id);
      return entry ? { ...t, ...entry.updates } : t;
    });
  }

  // ---- Goals & Subgoals --------------------------------------
  let goalsCache = [];
  let subgoalsCache = [];
  let goalsInitialized = false;
  let goalsOnChangeCallbacks = [];

  function getGoalsCollection() {
    return db.collection('users').doc(USER_ID).collection('goals');
  }
  function getSubgoalsCollection() {
    return db.collection('users').doc(USER_ID).collection('subgoals');
  }

  function initGoalsRealTimeSync() {
    if (goalsInitialized) return;
    goalsInitialized = true;
    const notify = () => goalsOnChangeCallbacks.forEach(cb => {
      try { cb(); } catch (e) { console.error(e); }
    });

    getGoalsCollection().onSnapshot((snapshot) => {
      goalsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      notify();
    }, (error) => console.error('Goals sync error:', error));

    getSubgoalsCollection().onSnapshot((snapshot) => {
      subgoalsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      notify();
    }, (error) => console.error('Subgoals sync error:', error));
  }

  function onGoalsChange(callback) {
    goalsOnChangeCallbacks.push(callback);
    return () => { goalsOnChangeCallbacks = goalsOnChangeCallbacks.filter(cb => cb !== callback); };
  }

  function getAllGoals() { return goalsCache; }
  function getAllSubgoals() { return subgoalsCache; }

  async function addGoal(goal) {
    const { id, ...data } = goal;
    await getGoalsCollection().doc(id).set(data);
    return [...goalsCache, goal];
  }
  async function updateGoal(id, updates) {
    await getGoalsCollection().doc(id).update(updates);
    return goalsCache.map(g => g.id === id ? { ...g, ...updates } : g);
  }
  async function deleteGoal(id) {
    await getGoalsCollection().doc(id).delete();
    return goalsCache.filter(g => g.id !== id);
  }

  async function addSubgoal(subgoal) {
    const { id, ...data } = subgoal;
    await getSubgoalsCollection().doc(id).set(data);
    return [...subgoalsCache, subgoal];
  }
  async function updateSubgoal(id, updates) {
    await getSubgoalsCollection().doc(id).update(updates);
    return subgoalsCache.map(s => s.id === id ? { ...s, ...updates } : s);
  }
  async function deleteSubgoal(id) {
    await getSubgoalsCollection().doc(id).delete();
    return subgoalsCache.filter(s => s.id !== id);
  }
  // Batch cascade-delete (e.g. a subgoal + all its nested descendant subgoals)
  async function deleteSubgoals(ids) {
    const collection = getSubgoalsCollection();
    await commitInChunks(ids.map(id => b => b.delete(collection.doc(id))));
    return subgoalsCache.filter(s => !ids.includes(s.id));
  }
  // Apply the same field updates to multiple subgoals in one batch (e.g. cascade done)
  async function updateSubgoals(ids, updates) {
    const collection = getSubgoalsCollection();
    await commitInChunks(ids.map(id => b => b.update(collection.doc(id), updates)));
    return subgoalsCache.map(s => ids.includes(s.id) ? { ...s, ...updates } : s);
  }

  // ---- Color metadata (weekNames + dayColors) ---------------

  function initColorDataSync() {
    if (colorDataInitialized) return;
    colorDataInitialized = true;

    getColorDataRef().onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();
        weekNamesCache = data.weekNames || {};
        dayColorsCache = data.dayColors || {};
        categoryColorsCache = data.categoryColors || {};
        // Keep localStorage in sync for fast offline reads
        localStorage.setItem('weekNames', JSON.stringify(weekNamesCache));
        localStorage.setItem('dayColors', JSON.stringify(dayColorsCache));
        localStorage.setItem('categoryColors', JSON.stringify(categoryColorsCache));
      }
    }, (error) => {
      console.warn('Color data sync error:', error);
    });
  }

  // The whole colorData doc is rewritten (merge: false), so every write must
  // carry all three maps or it would wipe the others.
  function colorDataDoc() {
    return { weekNames: weekNamesCache, dayColors: dayColorsCache, categoryColors: categoryColorsCache };
  }

  function getWeekName(mondayDate) {
    return weekNamesCache[mondayDate] || null;
  }

  function setWeekName(mondayDate, name) {
    if (name) weekNamesCache[mondayDate] = name;
    else delete weekNamesCache[mondayDate];
    localStorage.setItem('weekNames', JSON.stringify(weekNamesCache));
    // Persist to Firestore in background
    getColorDataRef().set(colorDataDoc(), { merge: false })
      .catch(e => console.warn('Failed to save weekName:', e));
  }

  function getCategoryColor(category) {
    return (category && categoryColorsCache[category]) || null;
  }

  function setCategoryColor(category, color) {
    if (!category) return;
    if (color) categoryColorsCache[category] = color;
    else delete categoryColorsCache[category];
    localStorage.setItem('categoryColors', JSON.stringify(categoryColorsCache));
    getColorDataRef().set(colorDataDoc(), { merge: false })
      .catch(e => console.warn('Failed to save categoryColor:', e));
  }

  function getDayColor(date) {
    return dayColorsCache[date] || null;
  }

  function setDayColor(date, color) {
    if (color) dayColorsCache[date] = color;
    else delete dayColorsCache[date];
    localStorage.setItem('dayColors', JSON.stringify(dayColorsCache));
    // Persist to Firestore in background
    getColorDataRef().set(colorDataDoc(), { merge: false })
      .catch(e => console.warn('Failed to save dayColor:', e));
  }

  // ---- Settings (still local, not synced) -------------------
  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
        theme: 'dark',
        weekStartsOn: 'monday',
        workingHoursPerDay: 8,
        showCompletedTasks: true,
      };
    } catch {
      return {
        theme: 'dark',
        weekStartsOn: 'monday',
        workingHoursPerDay: 8,
        showCompletedTasks: true,
      };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  // ---- Export / Import --------------------------------------
  function exportData() {
    return JSON.stringify({
      tasks: getAllTasks(),
      goals: getAllGoals(),
      subgoals: getAllSubgoals(),
      settings: getSettings(),
      weekNames: weekNamesCache,
      dayColors: dayColorsCache,
      categoryColors: categoryColorsCache,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  async function importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.tasks) await saveTasks(data.tasks);
    // Only replace goals/subgoals when the backup actually has them — an
    // older backup made before goals existed must not wipe current goals.
    if (Array.isArray(data.goals)) await replaceCollection(getGoalsCollection(), data.goals);
    if (Array.isArray(data.subgoals)) await replaceCollection(getSubgoalsCollection(), data.subgoals);
    if (data.settings) saveSettings(data.settings);
    if (data.weekNames) {
      weekNamesCache = data.weekNames;
      localStorage.setItem('weekNames', JSON.stringify(weekNamesCache));
    }
    if (data.dayColors) {
      dayColorsCache = data.dayColors;
      localStorage.setItem('dayColors', JSON.stringify(dayColorsCache));
    }
    if (data.categoryColors) {
      categoryColorsCache = data.categoryColors;
      localStorage.setItem('categoryColors', JSON.stringify(categoryColorsCache));
    }
    if (data.weekNames || data.dayColors || data.categoryColors) {
      await getColorDataRef().set(colorDataDoc(), { merge: false });
    }
    return data;
  }

  // ---- Sync status ------------------------------------------
  function isOnline() {
    return navigator.onLine;
  }

  function getSyncStatus() {
    return {
      initialized: isInitialized,
      online: isOnline(),
      taskCount: tasksCache.length,
      userId: USER_ID
    };
  }

  return {
    initRealTimeSync,
    initColorDataSync,
    onChange,
    getAllTasks,
    saveTasks,
    addTask,
    updateTask,
    deleteTask,
    deleteTasks,
    updateTasks,
    updateTaskFields,
    initGoalsRealTimeSync,
    onGoalsChange,
    getAllGoals,
    getAllSubgoals,
    addGoal,
    updateGoal,
    deleteGoal,
    addSubgoal,
    updateSubgoal,
    deleteSubgoal,
    deleteSubgoals,
    updateSubgoals,
    getSettings,
    saveSettings,
    getWeekName,
    setWeekName,
    getDayColor,
    setDayColor,
    getCategoryColor,
    setCategoryColor,
    exportData,
    importData,
    isOnline,
    getSyncStatus,
  };
})();

// Start syncing whenever a user is signed in — NOT off the one-shot
// `authReady` promise: that resolves once with null when nobody is signed in
// yet (e.g. first launch), which made sync crash on users/null/... and never
// start again after logging in. Each init* is guarded so it runs only once;
// sign-out reloads the page, so a different user always gets a fresh start.
auth.onAuthStateChanged(user => {
  if (!user || !USER_ID) return;
  Storage.initRealTimeSync();
  Storage.initColorDataSync();
  Storage.initGoalsRealTimeSync();
});
