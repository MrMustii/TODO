// ============================================================
// Storage Layer — Firebase Firestore with real-time sync
// ============================================================

const Storage = (() => {
  const SETTINGS_KEY = 'todo_app_settings';
  
  // Local cache of tasks (updated via real-time listener)
  let tasksCache = [];
  let isInitialized = false;
  let onChangeCallbacks = [];

  // Get Firestore collection reference for this user
  function getTasksCollection() {
    return db.collection('users').doc(USER_ID).collection('tasks');
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
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  async function importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.tasks) await saveTasks(data.tasks);
    if (data.settings) saveSettings(data.settings);
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
    onChange,
    getAllTasks,
    saveTasks,
    addTask,
    updateTask,
    deleteTask,
    getSettings,
    saveSettings,
    exportData,
    importData,
    isOnline,
    getSyncStatus,
  };
})();

// Initialize sync after auth is ready
authReady.then(() => {
  Storage.initRealTimeSync();
});
