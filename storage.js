// ============================================================
// Storage Layer — localStorage now, swappable to API later
// ============================================================

const Storage = (() => {
  const TASKS_KEY = 'todo_app_tasks';
  const SETTINGS_KEY = 'todo_app_settings';

  function _read(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function _write(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ---- Tasks ------------------------------------------------
  function getAllTasks() {
    return _read(TASKS_KEY) || [];
  }

  function saveTasks(tasks) {
    _write(TASKS_KEY, tasks);
  }

  function addTask(task) {
    const tasks = getAllTasks();
    tasks.push(task);
    saveTasks(tasks);
    return tasks;
  }

  function updateTask(id, updates) {
    const tasks = getAllTasks().map(t =>
      t.id === id ? { ...t, ...updates } : t
    );
    saveTasks(tasks);
    return tasks;
  }

  function deleteTask(id) {
    const tasks = getAllTasks().filter(t => t.id !== id);
    saveTasks(tasks);
    return tasks;
  }

  // ---- Settings ---------------------------------------------
  function getSettings() {
    return _read(SETTINGS_KEY) || {
      theme: 'dark',
      weekStartsOn: 'monday',     // 'monday' | 'sunday'
      workingHoursPerDay: 8,
      showCompletedTasks: true,
    };
  }

  function saveSettings(settings) {
    _write(SETTINGS_KEY, settings);
  }

  // ---- Export / Import --------------------------------------
  function exportData() {
    return JSON.stringify({
      tasks: getAllTasks(),
      settings: getSettings(),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  function importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.tasks) saveTasks(data.tasks);
    if (data.settings) saveSettings(data.settings);
    return data;
  }

  return {
    getAllTasks,
    saveTasks,
    addTask,
    updateTask,
    deleteTask,
    getSettings,
    saveSettings,
    exportData,
    importData,
  };
})();
