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

  // === State ===
  const state = {
    files: [],
    currentId: null,
    isDirty: false,
    localDirty: false,
    saveTimer: null,
    previewMode: 'split', // 'split' | 'preview' | 'editor'
    isResizing: false,
    theme: 'light',
    autoSave: true,
    editorFontSize: 14,
    localHandle: null,
    fsaCompatible: null
  };

  // === DOM References ===
  const $ = (id) => document.getElementById(id);
  const editor = $('editor');
  const preview = $('preview');
  const fileList = $('fileList');
  const fileName = $('fileName');
  const fileStatus = $('fileStatus');
  const emptyState = $('emptyState');
  const editorArea = $('editorArea');
  const wordCount = $('wordCount');
  const lineCount = $('lineCount');
  const saveStatus = $('saveStatus');
  const toast = $('toast');
  const editorBody = $('editorBody');
  const fileSearch = $('fileSearch');

  // === Utility ===
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function showToast(message, type = 'info', duration) {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    requestAnimationFrame(() => {
      toast.classList.add('show');
      clearTimeout(toast._hideTimer);
      toast._hideTimer = setTimeout(() => toast.classList.remove('show'), duration || 2500);
    });
  }

  function getSelectedText() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    return editor.value.substring(start, end);
  }

  function replaceSelection(replacement) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    editor.value = text.substring(0, start) + replacement + text.substring(end);
    editor.selectionStart = editor.selectionEnd = start + replacement.length;
    editor.focus();
    triggerUpdate();
  }

  function wrapSelection(before, after) {
    const selected = getSelectedText();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    if (selected) {
      editor.value = text.substring(0, start) + before + selected + after + text.substring(end);
      editor.selectionStart = start + before.length;
      editor.selectionEnd = start + before.length + selected.length;
    } else {
      editor.value = text.substring(0, start) + before + after + text.substring(end);
      editor.selectionStart = start + before.length;
      editor.selectionEnd = start + before.length;
    }
    editor.focus();
    triggerUpdate();
  }

  function insertAtLine(before, after = '') {
    const start = editor.selectionStart;
    const text = editor.value;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = text.indexOf('\n', start);
    const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
    const indentation = line.match(/^\s*/)[0];
    const insertion = before + indentation;
    editor.value = text.substring(0, lineStart) + insertion + line + after + text.substring(lineEnd === -1 ? text.length : lineEnd);
    const cursorPos = lineStart + insertion.length;
    editor.selectionStart = editor.selectionEnd = cursorPos;
    editor.focus();
    triggerUpdate();
  }

  // === Markdown Render ===
  function renderPreview() {
    const md = editor.value || '';
    preview.innerHTML = MarkdownParser.render(md);
    updateStats(md);
    renderDiagrams();
  }

  function renderDiagrams() {
    const mermaidElements = preview.querySelectorAll('.mermaid');
    if (mermaidElements.length > 0 && typeof mermaid !== 'undefined') {
      mermaidElements.forEach((el) => {
        el.removeAttribute('data-processed');
      });
      mermaid.run({ nodes: mermaidElements }).catch((err) => {
        console.warn('Mermaid render error:', err);
      });
    }
  }

  const triggerUpdate = debounce(renderPreview, 150);

  // === Stats ===
  function updateStats(md) {
    const chars = md.length;
    const lines = md ? md.split('\n').length : 1;
    wordCount.textContent = `字符: ${chars}`;
    lineCount.textContent = `行: ${lines}`;
  }

  // === File System Handle (IndexedDB) ===
  function openHandleDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('FileHandles', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('handles');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveFileHandle(fileId, handle) {
    try {
      const db = await openHandleDB();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, fileId);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    } catch (err) {
      console.warn('Failed to save file handle:', err);
    }
  }

  async function getFileHandle(fileId) {
    try {
      const db = await openHandleDB();
      const tx = db.transaction('handles', 'readonly');
      const request = tx.objectStore('handles').get(fileId);
      return await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      return null;
    }
  }

  async function removeFileHandle(fileId) {
    try {
      const db = await openHandleDB();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(fileId);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    } catch (err) {
      console.warn('Failed to remove file handle:', err);
    }
  }

  // === Import from Local Filesystem ===
  async function importFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'UTF-8');
    });
  }

  async function importFileToStorage(file) {
    const content = await importFileContent(file);
    const name = file.name.endsWith('.md') ? file.name : file.name + '.md';
    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_FILE',
      id: null,
      content,
      name
    });
    return res.success ? res.files[0] : null;
  }

  function isMdFile(file) {
    return file.name.endsWith('.md') || file.type === 'text/markdown' || file.name.endsWith('.markdown');
  }

  async function openLocalFilePicker() {
    if (state.fsaCompatible === false) {
      $('fileInput').click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Markdown Files',
          accept: { 'text/markdown': ['.md', '.markdown'] }
        }],
        multiple: false
      });
      const file = await handle.getFile();
      if (!isMdFile(file)) {
        showToast('请选择 .md 文件', 'warning');
        return;
      }
      const fileEntry = await importFileToStorage(file);
      if (fileEntry) {
        await saveFileHandle(fileEntry.id, handle);
        await loadFiles();
        await openFile(fileEntry.id);
        showToast('文件已打开', 'success');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        $('fileInput').click();
      }
    }
  }



  async function handleFileSelect(files) {
    if (!files || files.length === 0) return;
    const mdFiles = Array.from(files).filter(isMdFile);
    if (mdFiles.length === 0) {
      showToast('未找到 .md 文件', 'warning');
      return;
    }
    showToast(`正在导入 ${mdFiles.length} 个文件...`, 'info');
    let imported = null;
    for (const file of mdFiles) {
      try {
        const fileEntry = await importFileToStorage(file);
        if (!imported) imported = fileEntry;
      } catch (err) {
        console.error('Failed to import:', file.name, err);
      }
    }
    await loadFiles();
    if (imported) {
      await openFile(imported.id);
      showToast(`成功导入 ${mdFiles.length} 个文件`, 'success');
    }
  }

  async function handleFolderSelect(files) {
    if (!files || files.length === 0) return;
    const mdFiles = Array.from(files).filter(isMdFile);
    if (mdFiles.length === 0) {
      showToast('文件夹中未找到 .md 文件', 'warning');
      return;
    }
    showToast(`正在导入文件夹 (${mdFiles.length} 个 .md 文件)...`, 'info');
    let imported = null;
    for (const file of mdFiles) {
      try {
        const fileEntry = await importFileToStorage(file);
        if (!imported) imported = fileEntry;
      } catch (err) {
        console.error('Failed to import:', file.name, err);
      }
    }
    await loadFiles();
    if (imported) {
      await openFile(imported.id);
      showToast(`成功导入文件夹 ${mdFiles.length} 个文件`, 'success');
    }
  }

  // === File Management ===
  async function loadFiles() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_FILES' });
      if (res.success) {
        state.files = res.files;
        renderFileList();
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  }

  function renderFileList() {
    const query = fileSearch.value.toLowerCase().trim();
    const filtered = query
      ? state.files.filter((f) => f.name.toLowerCase().includes(query))
      : state.files;

    if (filtered.length === 0) {
      fileList.innerHTML = `<div class="file-empty">${query ? '没有匹配的文件' : '暂无文件，点击 + 创建'}</div>`;
      return;
    }

    fileList.innerHTML = filtered
      .map(
        (f) => `
      <div class="file-item ${f.id === state.currentId ? 'active' : ''}" data-id="${f.id}">
        <span class="file-icon">&#128196;</span>
        <div class="file-info">
          <div class="file-name">${escapeHtml(f.name)}</div>
          <div class="file-meta">${formatDate(f.updatedAt)}</div>
        </div>
        <div class="file-actions">
          <button class="btn-del" data-id="${f.id}" title="关闭">&#10005;</button>
        </div>
      </div>`
      )
      .join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function supportsFileSystemAccess() {
    return 'showSaveFilePicker' in window;
  }

  function checkFSACompatibility() {
    if (!('showSaveFilePicker' in window)) {
      state.fsaCompatible = false;
      return;
    }
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('edg/')) {
      state.fsaCompatible = false;
      return;
    }
    state.fsaCompatible = true;
  }

  function updateFSAHint() {
    const hint = $('fsaHint');
    if (state.fsaCompatible === false) {
      hint.textContent = '⚠ 该浏览器不支持同步保存文件到本地，只支持下载';
    } else {
      hint.textContent = '';
    }
  }

  async function downloadFile(name, content) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url, filename: name, saveAs: true });
      state.localDirty = false;
      saveStatus.textContent = '已保存到本地';
      saveStatus.className = 'saved';
      showToast('已保存到本地', 'success', 1500);
    } catch (err) {
      saveStatus.textContent = '已缓存（下载失败）';
      saveStatus.className = 'saved';
      showToast('保存到本地失败，内容已缓存', 'warning');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function saveCurrentFile(isManual) {
    if (!state.currentId) return;
    const name = fileName.value.trim() || '未命名.md';
    if (!name.endsWith('.md')) fileName.value = name + '.md';

    saveStatus.textContent = '保存中...';
    saveStatus.className = 'saving';

    if (isManual && !state.localHandle) {
      let fsaFailed = false;
      if (supportsFileSystemAccess()) {
        try {
          const suggestedName = fileName.value;
          state.localHandle = await window.showSaveFilePicker({
            types: [{
              description: 'Markdown Files',
              accept: { 'text/markdown': ['.md'] }
            }],
            suggestedName
          });
          await saveFileHandle(state.currentId, state.localHandle);
        } catch (err) {
          if (err.name === 'AbortError') {
            saveStatus.textContent = '已缓存';
            saveStatus.className = 'saved';
            return;
          }
          fsaFailed = true;
        }
      } else {
        fsaFailed = true;
      }
      if (fsaFailed) {
        saveStatus.textContent = '该浏览器不支持同步保存文件到本地，只支持下载';
        saveStatus.className = 'saved';
        const res = await chrome.runtime.sendMessage({
          type: 'SAVE_FILE',
          id: state.currentId,
          content: editor.value,
          name: fileName.value
        });
        if (res.success) {
          state.files = res.files;
          state.isDirty = false;
          renderFileList();
        }
        await downloadFile(fileName.value, editor.value);
        if (state.localDirty === false) {
          saveStatus.textContent = '已通过下载保存到本地';
          saveStatus.className = 'saved';
        }
        return;
      }
    }

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'SAVE_FILE',
        id: state.currentId,
        content: editor.value,
        name: fileName.value
      });
      if (!res.success) throw new Error('Internal save failed');

      state.files = res.files;
      state.isDirty = false;
      renderFileList();

      await saveToLocal(isManual);
    } catch (err) {
      saveStatus.textContent = '保存失败';
      saveStatus.className = 'error';
      showToast('保存失败', 'error');
    }
  }

  async function saveToLocal(isManual) {
    const handle = state.localHandle;
    if (!handle) {
      saveStatus.textContent = '已缓存';
      saveStatus.className = 'saved';
      return;
    }

    if (!isManual) {
      saveStatus.textContent = state.localDirty ? '已缓存（未保存到本地）' : '已缓存';
      saveStatus.className = 'saved';
      return;
    }

    try {
      const writable = await handle.createWritable();
      await writable.write(editor.value);
      await writable.close();
      state.localDirty = false;
      const savedName = handle.name;
      if (savedName && savedName !== fileName.value) {
        const res = await chrome.runtime.sendMessage({
          type: 'SAVE_FILE',
          id: state.currentId,
          content: editor.value,
          name: savedName
        });
        if (res.success) {
          state.files = res.files;
          fileName.value = savedName;
          renderFileList();
        }
      }
      saveStatus.textContent = '已保存到本地';
      saveStatus.className = 'saved';
      showToast('已保存到本地', 'success', 1500);
    } catch (err) {
      // createWritable may fail in some Chromium-based browsers, fall back to download
      try {
        await downloadFile(fileName.value, editor.value);
      } catch {
        saveStatus.textContent = '已缓存（本地写入失败）';
        saveStatus.className = 'saved';
        showToast('本地文件写入失败，内容已保存到内部存储', 'warning');
      }
    }
  }

  const autoSave = debounce(() => {
    if (state.autoSave && state.currentId && state.isDirty) {
      saveCurrentFile(false);
    }
  }, 800);

  async function openFile(id) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_FILE', id });
      if (res.success) {
        state.currentId = id;
        state.isDirty = false;
        state.localDirty = false;
        state.localHandle = await getFileHandle(id);
        editor.value = res.file.content || '';
        fileName.value = res.file.name || '未命名.md';
        renderPreview();
        showEditor();
        renderFileList();
        saveStatus.textContent = '已缓存';
        saveStatus.className = 'saved';
      }
    } catch (err) {
      showToast('打开文件失败', 'error');
    }
  }

  async function closeFile(id) {
    if (!confirm('确定关闭此文件？')) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'DELETE_FILE', id });
      if (res.success) {
        state.files = res.files;
        if (state.currentId === id) {
          state.currentId = null;
          state.localHandle = null;
          showEmptyState();
        }
        renderFileList();
        removeFileHandle(id);
        showToast('文件已关闭', 'success');
      }
    } catch (err) {
      showToast('关闭失败', 'error');
    }
  }

  async function createNewFile() {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'SAVE_FILE',
        id: null,
        content: '',
        name: '未命名.md'
      });
      if (res.success) {
        state.files = res.files;
        const newFile = res.files[0];
        openFile(newFile.id);
        showToast('已创建新文件', 'success');
      }
    } catch (err) {
      showToast('创建文件失败', 'error');
    }
  }

  // === UI State ===
  function showEditor() {
    emptyState.style.display = 'none';
    editorArea.style.display = 'flex';
  }

  function showEmptyState() {
    emptyState.style.display = 'flex';
    editorArea.style.display = 'none';
    state.currentId = null;
    renderFileList();
  }

  // === Toolbar Commands ===
  const commands = {
    h1: () => insertAtLine('# '),
    h2: () => insertAtLine('## '),
    h3: () => insertAtLine('### '),
    h4: () => insertAtLine('#### '),
    h5: () => insertAtLine('##### '),
    h6: () => insertAtLine('###### '),
    bold: () => wrapSelection('**', '**'),
    italic: () => wrapSelection('*', '*'),
    strikethrough: () => wrapSelection('~~', '~~'),
    code: () => wrapSelection('`', '`'),
    codeblock: () => insertAtLine('```\n', '\n```'),
    quote: () => insertAtLine('> '),
    link: () => {
      const sel = getSelectedText() || '链接文本';
      const start = editor.selectionStart;
      const text = editor.value;
      const insertion = `[${sel}](url)`;
      editor.value = text.substring(0, start) + insertion + text.substring(start + sel.length);
      editor.selectionStart = start + text.substring(start, start + sel.length).length + 1;
      editor.selectionEnd = start + insertion.length - 1;
      editor.focus();
      triggerUpdate();
    },
    image: () => {
      const start = editor.selectionStart;
      const text = editor.value;
      editor.value = text.substring(0, start) + `![图片描述](url)` + text.substring(start);
      editor.selectionStart = start + 2;
      editor.selectionEnd = start + 6;
      editor.focus();
      triggerUpdate();
    },
    ul: () => insertAtLine('- '),
    ol: () => insertAtLine('1. '),
    table: () => {
      const start = editor.selectionStart;
      const text = editor.value;
      const table = '\n| 表头1 | 表头2 | 表头3 |\n| ------ | ------ | ------ |\n| 单元格 | 单元格 | 单元格 |\n';
      editor.value = text.substring(0, start) + table + text.substring(start);
      editor.selectionStart = start + table.length;
      editor.focus();
      triggerUpdate();
    },
    hr: () => insertAtLine('---\n', ''),
  };

  // === Sync Scroll ===
  let _syncingScroll = false;

  function syncScroll(source, target) {
    if (_syncingScroll) return;
    const srcMax = source.scrollHeight - source.clientHeight;
    if (srcMax <= 0) return;
    _syncingScroll = true;
    const ratio = source.scrollTop / srcMax;
    const tgtMax = target.scrollHeight - target.clientHeight;
    if (tgtMax > 0) {
      target.scrollTop = ratio * tgtMax;
    }
    _syncingScroll = false;
  }

  editor.addEventListener('scroll', () => {
    if (state.previewMode !== 'split') return;
    syncScroll(editor, preview);
  });

  preview.addEventListener('scroll', () => {
    if (state.previewMode !== 'split') return;
    syncScroll(preview, editor);
  });

  // === Event Listeners ===
  // Editor
  editor.addEventListener('input', () => {
    state.isDirty = true;
    state.localDirty = true;
    triggerUpdate();
    if (state.autoSave) autoSave();
    saveStatus.textContent = '未保存';
    saveStatus.className = '';
  });

  editor.addEventListener('keydown', (e) => {
    // Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const text = editor.value;
      editor.value = text.substring(0, start) + '  ' + text.substring(start);
      editor.selectionStart = editor.selectionEnd = start + 2;
      triggerUpdate();
    }
  });

  // Toolbar
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (commands[cmd]) commands[cmd]();
    });
  });

  // File list events (delegation)
  fileList.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.btn-del');

    if (delBtn) {
      e.stopPropagation();
      closeFile(delBtn.dataset.id);
      return;
    }
    const item = e.target.closest('.file-item');
    if (item) {
      if (state.isDirty) saveCurrentFile(false);
      openFile(item.dataset.id);
    }
  });

  // Buttons
  $('btnNewFile').addEventListener('click', createNewFile);
  $('btnStartNew').addEventListener('click', createNewFile);
  $('btnStartOpen').addEventListener('click', openLocalFilePicker);
  $('btnOpenFile').addEventListener('click', openLocalFilePicker);
  $('btnOpenFolder').addEventListener('click', () => $('folderInput').click());
  $('btnSave').addEventListener('click', () => saveCurrentFile(true));

  $('btnDownloadMd').addEventListener('click', async () => {
    if (!editor.value && !state.currentId) return;
    const name = fileName.value || '未命名.md';
    const blob = new Blob([editor.value], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url, filename: name, saveAs: true });
      showToast('下载成功', 'success');
    } catch (err) {
      showToast('下载失败', 'error');
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  $('btnExportHtml').addEventListener('click', async () => {
    if (!editor.value && !state.currentId) return;
    const name = fileName.value || '未命名.md';
    const baseName = name.replace(/\.md$/i, '') || 'export';
    const content = editor.value;
    const rendered = MarkdownParser.render(content);
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(baseName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; line-height: 1.8; color: #333; }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; line-height: 1.3; }
    h1 { font-size: 2em; border-bottom: 2px solid #f0f0f0; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #f0f0f0; padding-bottom: 0.2em; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: 'Fira Code', monospace; font-size: 0.9em; }
    pre { background: #1e1e2e; color: #cdd6f4; padding: 16px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; color: inherit; }
    blockquote { border-left: 4px solid #4A90D9; margin: 1em 0; padding: 0.5em 1em; background: #f8f9fa; color: #555; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; }
    img { max-width: 100%; }
    a { color: #4A90D9; text-decoration: none; }
    ul, ol { padding-left: 2em; }
    hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
  </style>
</head>
<body>${rendered}</body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url, filename: `${baseName}.html`, saveAs: true });
      showToast('导出 HTML 成功', 'success');
    } catch (err) {
      showToast('导出失败', 'error');
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  $('btnDeleteFile').addEventListener('click', () => {
    if (state.currentId) closeFile(state.currentId);
  });

  // Toggle Preview Mode
  $('btnTogglePreview').addEventListener('click', () => {
    switch (state.previewMode) {
      case 'split':
        state.previewMode = 'preview';
        editorBody.className = 'editor-body preview-only';
        break;
      case 'preview':
        state.previewMode = 'editor';
        editorBody.className = 'editor-body editor-only';
        break;
      case 'editor':
        state.previewMode = 'split';
        editorBody.className = 'editor-body';
        break;
    }
  });

  // File inputs
  $('fileInput').addEventListener('change', (e) => {
    handleFileSelect(e.target.files);
    e.target.value = '';
  });
  $('folderInput').addEventListener('change', (e) => {
    handleFolderSelect(e.target.files);
    e.target.value = '';
  });

  // File search
  fileSearch.addEventListener('input', () => renderFileList());

  // Make filename read-only (rename removed)
  fileName.readOnly = true;

  // === Resize ===
  const resizeHandle = $('resizeHandle');
  resizeHandle.addEventListener('mousedown', (e) => {
    state.isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizeHandle.classList.add('active');
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.isResizing) return;
    const editorPane = $('editorPane');
    const previewPane = $('previewPane');
    const bodyRect = editorBody.getBoundingClientRect();
    const x = e.clientX - bodyRect.left;
    const minWidth = 100;
    const maxWidth = bodyRect.width - minWidth - resizeHandle.offsetWidth;
    const editorWidth = Math.max(minWidth, Math.min(x, maxWidth));
    const previewWidth = bodyRect.width - editorWidth - resizeHandle.offsetWidth;
    editorPane.style.flex = 'none';
    editorPane.style.width = editorWidth + 'px';
    previewPane.style.flex = 'none';
    previewPane.style.width = previewWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (state.isResizing) {
      state.isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizeHandle.classList.remove('active');
    }
  });

  // === Keyboard shortcuts ===
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentFile(true);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      commands.bold();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      commands.italic();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createNewFile();
    }
  });

  // === Window / Fullscreen ===
  function openInNewWindow() {
    const fileId = state.currentId || '';
    const url = chrome.runtime.getURL(`popup/popup.html?mode=window&fileId=${fileId}`);
    window.open(url, '_blank', 'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no');
    window.close();
  }

  function getFullscreenIcon(isFullscreen) {
    return isFullscreen
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  }

  function updateFullscreenBtn(isFullscreen) {
    const btn = $('btnFullscreen');
    if (!btn) return;
    btn.innerHTML = getFullscreenIcon(isFullscreen);
    btn.title = isFullscreen ? '退出全屏' : '全屏显示';
  }

  function toggleFullscreen() {
    const isWindowMode = document.body.classList.contains('window-mode');
    if (isWindowMode) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        document.documentElement.requestFullscreen().catch(() => {
          openInNewWindow();
        });
      }
    } else {
      openInNewWindow();
    }
  }

  // === Popup resize ===
  const popupResizeHandle = $('popupResizeHandle');
  let isPopupResizing = false;
  let startX, startY, startW, startH;

  popupResizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isPopupResizing = true;
    startX = e.screenX;
    startY = e.screenY;
    startW = window.innerWidth;
    startH = window.innerHeight;
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPopupResizing) return;
    const dw = e.screenX - startX;
    const dh = e.screenY - startY;
    const newW = Math.max(600, startW + dw);
    const newH = Math.max(400, startH + dh);
    try {
      chrome.windows.getCurrent((win) => {
        if (chrome.runtime.lastError) return;
        chrome.windows.update(win.id, { width: Math.round(newW), height: Math.round(newH) });
      });
    } catch (err) {
      // Silently fail if not in popup context
    }
  });

  document.addEventListener('mouseup', () => {
    if (isPopupResizing) {
      isPopupResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // === Storage Cleanup ===
  async function cleanOrphanedHandles() {
    const { files = [] } = await chrome.storage.local.get('files');
    const validIds = new Set(files.map((f) => f.id));

    try {
      const db = await openHandleDB();
      if (!db.objectStoreNames.contains('handles')) {
        db.close();
        return;
      }
      const tx = db.transaction('handles', 'readonly');
      const store = tx.objectStore('handles');
      const keys = await new Promise((resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      let cleaned = 0;
      for (const key of keys) {
        if (!validIds.has(key)) {
          removeFileHandle(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} orphaned file handles`);
      }
      db.close();
    } catch (err) {
      console.warn('Failed to clean orphaned handles:', err);
    }
  }

  // === Init ===
  async function init() {
    if (typeof mermaid !== 'undefined') {
      mermaid.initialize({ startOnLoad: false, theme: 'default' });
    }

    // Clean up orphaned handles on startup
    cleanOrphanedHandles();

    checkFSACompatibility();
    updateFSAHint();

    const params = new URLSearchParams(window.location.search);
    const isWindowMode = params.get('mode') === 'window';

    if (isWindowMode) {
      document.body.classList.add('window-mode');
    }

    const { theme = 'light', autoSave = true, editorFontSize = 14 } = await chrome.storage.local.get([
      'theme', 'autoSave', 'editorFontSize'
    ]);
    state.theme = theme;
    state.autoSave = autoSave;
    state.editorFontSize = editorFontSize;
    editor.style.fontSize = editorFontSize + 'px';
    await loadFiles();

    const fileId = params.get('fileId');
    if (fileId) {
      openFile(fileId);
    } else if (state.files.length > 0) {
      openFile(state.files[0].id);
    }

    renderPreview();
  }

  // Save internal storage when popup loses focus (close or blur)
  window.addEventListener('blur', () => {
    if (state.isDirty && state.currentId) {
      saveCurrentFile(false);
    }
  });

  // Fullscreen / expand buttons
  $('btnFullscreen').addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', () => {
    updateFullscreenBtn(!!document.fullscreenElement);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  init();
})();
