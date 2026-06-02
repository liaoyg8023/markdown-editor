/*
 * Markdown Editor - 简洁强大的 Markdown 编辑与预览工具
 * Copyright (C) 2024 liaoyg8023
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

(function () {
  'use strict';

  const fontSizeInput = document.getElementById('fontSize');
  const fontSizeLabel = document.getElementById('fontSizeLabel');
  const autoSaveCheck = document.getElementById('autoSave');
  const themeBtns = document.querySelectorAll('.theme-btn');
  const storageDesc = document.getElementById('storageDesc');
  const storageBadge = document.getElementById('storageBadge');
  const btnCleanOrphans = document.getElementById('btnCleanOrphans');
  const btnClearAll = document.getElementById('btnClearAll');

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  async function updateStorageInfo() {
    try {
      const bytes = await new Promise((resolve) => {
        chrome.storage.local.getBytesInUse(null, resolve);
      });
      const idbSize = await getIdbSize();
      storageDesc.textContent = `内部存储: ${formatBytes(bytes)} | IndexedDB: ${idbSize}`;
      storageBadge.textContent = formatBytes(bytes);
    } catch (err) {
      storageDesc.textContent = '无法获取存储信息';
      storageBadge.textContent = '?';
    }
  }

  async function getIdbSize() {
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('FileHandles', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('handles');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!db.objectStoreNames.contains('handles')) {
        db.close();
        return '0 个文件句柄';
      }
      const tx = db.transaction('handles', 'readonly');
      const store = tx.objectStore('handles');
      const count = await new Promise((resolve, reject) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return count + ' 个文件句柄';
    } catch {
      return '0 个文件句柄';
    }
  }

  async function cleanOrphanedHandles() {
    const { files = [] } = await chrome.storage.local.get('files');
    const validIds = new Set(files.map((f) => f.id));

    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('FileHandles', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('handles');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (!db.objectStoreNames.contains('handles')) {
        db.close();
        return 0;
      }

      const tx = db.transaction('handles', 'readwrite');
      const store = tx.objectStore('handles');
      const allReq = store.getAllKeys();

      const keys = await new Promise((resolve, reject) => {
        allReq.onsuccess = () => resolve(allReq.result);
        allReq.onerror = () => reject(allReq.error);
      });

      let deleted = 0;
      for (const key of keys) {
        if (!validIds.has(key)) {
          store.delete(key);
          deleted++;
        }
      }

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });

      db.close();
      return deleted;
    } catch {
      return 0;
    }
  }

  async function clearAllData() {
    if (!confirm('确定清除所有文件？此操作不可撤销！')) return;
    if (!confirm('再次确认：所有已导入的文件将被永久删除。')) return;

    try {
      await chrome.storage.local.set({ files: [] });
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('FileHandles', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('handles');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!db.objectStoreNames.contains('handles')) {
        db.close();
        await updateStorageInfo();
        alert('已清除所有文件数据。');
        return;
      }
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').clear();
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
      await updateStorageInfo();
      alert('已清除所有文件数据。');
    } catch (err) {
      alert('清除失败: ' + err.message);
    }
  }

  async function loadSettings() {
    const { theme = 'light', autoSave = true, editorFontSize = 16 } = await chrome.storage.local.get([
      'theme', 'autoSave', 'editorFontSize'
    ]);

    fontSizeInput.value = editorFontSize;
    fontSizeLabel.textContent = editorFontSize + 'px';
    autoSaveCheck.checked = autoSave;

    themeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    await updateStorageInfo();
  }

  fontSizeInput.addEventListener('input', () => {
    const val = fontSizeInput.value;
    fontSizeLabel.textContent = val + 'px';
    chrome.storage.local.set({ editorFontSize: parseInt(val) });
  });

  autoSaveCheck.addEventListener('change', () => {
    chrome.storage.local.set({ autoSave: autoSaveCheck.checked });
  });

  themeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      themeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      chrome.storage.local.set({ theme });
    });
  });

  btnCleanOrphans.addEventListener('click', async () => {
    btnCleanOrphans.disabled = true;
    btnCleanOrphans.textContent = '清理中...';
    const count = await cleanOrphanedHandles();
    btnCleanOrphans.disabled = false;
    btnCleanOrphans.textContent = '清理';
    await updateStorageInfo();
    alert(`清理完成，移除了 ${count} 个孤立句柄。`);
  });

  btnClearAll.addEventListener('click', clearAllData);

  loadSettings();
})();
