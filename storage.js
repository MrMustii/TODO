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
  let colorDataInitialized = false;

  function loadColorCacheFromLocalStorage() {
    try { weekNamesCache = JSON.parse(localStorage.getItem('weekNames') || '{}'); } catch { weekNamesCache = {}; }
    try { dayColorsCache = JSON.parse(localStorage.getItem('dayColors') || '{}'); } catch { dayColorsCache = {}; }
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

  // ---- Tasks ------------------------------------------------
  function getAllTasks() {
    return tasksCache;
  }

  async function saveTasks(tasks) {
    // Batch write all tasks (used for import)
    const batch = db.batch();
    const collection = getTasksCollection();
    
    // Delete all existing
    const existing = await collection.get();
    existing.docs.forEach(doc => batch.delete(doc.ref));
    
    // Add all new
    tasks.forEach(task => {
      const { id, ...data } = task;
      batch.set(collection.doc(id), data);
    });
    
    await batch.commit();
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

  // ---- Color metadata (weekNames + dayColors) ---------------

  function initColorDataSync() {
    if (colorDataInitialized) return;
    colorDataInitialized = true;

    getColorDataRef().onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();
        weekNamesCache = data.weekNames || {};
        dayColorsCache = data.dayColors || {};
        // Keep localStorage in sync for fast offline reads
        localStorage.setItem('weekNames', JSON.stringify(weekNamesCache));
        localStorage.setItem('dayColors', JSON.stringify(dayColorsCache));
      }
    }, (error) => {
      console.warn('Color data sync error:', error);
    });
  }

  function getWeekName(mondayDate) {
    return weekNamesCache[mondayDate] || null;
  }

  function setWeekName(mondayDate, name) {
    if (name) weekNamesCache[mondayDate] = name;
    else delete weekNamesCache[mondayDate];
    localStorage.setItem('weekNames', JSON.stringify(weekNamesCache));
    // Persist to Firestore in background
    getColorDataRef().set({ weekNames: weekNamesCache, dayColors: dayColorsCache }, { merge: false })
      .catch(e => console.warn('Failed to save weekName:', e));
  }

  function getDayColor(date) {
    return dayColorsCache[date] || null;
  }

  function setDayColor(date, color) {
    if (color) dayColorsCache[date] = color;
    else delete dayColorsCache[date];
    localStorage.setItem('dayColors', JSON.stringify(dayColorsCache));
    // Persist to Firestore in background
    getColorDataRef().set({ weekNames: weekNamesCache, dayColors: dayColorsCache }, { merge: false })
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
      settings: getSettings(),
      weekNames: weekNamesCache,
      dayColors: dayColorsCache,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  async function importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.tasks) await saveTasks(data.tasks);
    if (data.settings) saveSettings(data.settings);
    if (data.weekNames) {
      weekNamesCache = data.weekNames;
      localStorage.setItem('weekNames', JSON.stringify(weekNamesCache));
    }
    if (data.dayColors) {
      dayColorsCache = data.dayColors;
      localStorage.setItem('dayColors', JSON.stringify(dayColorsCache));
    }
    if (data.weekNames || data.dayColors) {
      await getColorDataRef().set({ weekNames: weekNamesCache, dayColors: dayColorsCache }, { merge: false });
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
    getSettings,
    saveSettings,
    getWeekName,
    setWeekName,
    getDayColor,
    setDayColor,
    exportData,
    importData,
    isOnline,
    getSyncStatus,
  };
})();

// Initialize sync after auth is ready
authReady.then(() => {
  Storage.initRealTimeSync();
  Storage.initColorDataSync();
});
