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

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      theme: 'light',
      editorFontSize: 16,
      autoSave: true,
      files: []
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_FILES':
      getFiles().then(sendResponse);
      return true;
    case 'SAVE_FILE':
      saveFile(message.id, message.content, message.name).then(sendResponse);
      return true;
    case 'DELETE_FILE':
      deleteFile(message.id).then(sendResponse);
      return true;
    case 'GET_FILE':
      getFile(message.id).then(sendResponse);
      return true;
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

async function getFiles() {
  const { files = [] } = await chrome.storage.local.get('files');
  return { success: true, files };
}

async function saveFile(id, content, name) {
  const { files = [] } = await chrome.storage.local.get('files');
  const timestamp = Date.now();

  if (id) {
    const index = files.findIndex((f) => f.id === id);
    if (index !== -1) {
      files[index].content = content;
      files[index].updatedAt = timestamp;
      if (name) files[index].name = name;
    }
  } else {
    const newId = 'md_' + timestamp + '_' + Math.random().toString(36).slice(2, 8);
    files.unshift({
      id: newId,
      name: name || '未命名.md',
      content: content || '',
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  await chrome.storage.local.set({ files });
  return { success: true, files };
}

async function deleteFile(id) {
  const { files = [] } = await chrome.storage.local.get('files');
  const filtered = files.filter((f) => f.id !== id);
  await chrome.storage.local.set({ files: filtered });
  return { success: true, files: filtered };
}

async function getFile(id) {
  const { files = [] } = await chrome.storage.local.get('files');
  const file = files.find((f) => f.id === id);
  if (file) {
    return { success: true, file };
  }
  return { success: false, error: 'File not found' };
}
