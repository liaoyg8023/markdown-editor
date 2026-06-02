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

/**
 * 轻量级 Markdown -> HTML 解析器
 * 支持常用 Markdown 语法
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseInline(text) {
    let result = escapeHtml(text);

    // 图片 ![alt](url)
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');

    // 链接 [text](url)
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );

    // 行内代码 `code`
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 删除线 ~~text~~
    result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 加粗 **text** 或 __text__
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 斜体 *text* 或 _text_
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    result = result.replace(/_([^_]+)_/g, '<em>$1</em>');

    return result;
  }

  function parseTableLines(lines, startIdx) {
    const headerRow = lines[startIdx];
    const separatorRow = startIdx + 1 < lines.length ? lines[startIdx + 1] : '';
    const rows = [];

    // Check if separator row is valid
    if (!separatorRow || !/^\s*[-:| ]+\s*$/.test(separatorRow)) {
      return null;
    }

    const headers = headerRow.split('|').map((h) => h.trim()).filter(Boolean);
    const alignments = separatorRow.split('|').map((a) => {
      const trimmed = a.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
      if (trimmed.endsWith(':')) return 'right';
      if (trimmed.startsWith(':')) return 'left';
      return null;
    }).filter((_, i) => i < headers.length);

    let html = '<table><thead><tr>';
    headers.forEach((h, i) => {
      const align = alignments[i] ? ` style="text-align:${alignments[i]}"` : '';
      html += `<th${align}>${parseInline(h)}</th>`;
    });
    html += '</tr></thead><tbody>';

    let rowIdx = startIdx + 2;
    while (rowIdx < lines.length) {
      const line = lines[rowIdx].trim();
      if (!line || !line.includes('|')) break;
      const cols = line.split('|').map((c) => c.trim()).filter((_, i) => i < headers.length);
      if (cols.length === 0) break;
      html += '<tr>';
      cols.forEach((c, i) => {
        const align = alignments[i] ? ` style="text-align:${alignments[i]}"` : '';
        html += `<td${align}>${parseInline(c)}</td>`;
      });
      html += '</tr>';
      rowIdx++;
    }

    html += '</tbody></table>';
    return { html, nextIndex: rowIdx };
  }

  function renderMarkdown(md) {
    if (!md) return '';

    const lines = md.split('\n');
    let html = '';
    let i = 0;
    let inCodeBlock = false;
    let codeLang = '';
    let codeContent = '';

    let inList = null;
    let listItems = [];
    let inBlockquote = false;
    let blockquoteLines = [];

    function flushList() {
      if (listItems.length > 0) {
        const tag = inList === 'ol' ? 'ol' : 'ul';
        html += `<${tag}>\n${listItems.join('\n')}\n</${tag}>\n`;
        listItems = [];
        inList = null;
      }
    }

    function flushBlockquote() {
      if (blockquoteLines.length > 0) {
        html += `<blockquote>\n${blockquoteLines.map((l) => `<p>${l}</p>`).join('\n')}\n</blockquote>\n`;
        blockquoteLines = [];
        inBlockquote = false;
      }
    }

    while (i < lines.length) {
      let line = lines[i];
      let trimmed = line.trim();

      // 代码块
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          if (codeLang === 'mermaid') {
            html += `<div class="mermaid">\n${codeContent.trim()}\n</div>\n`;
          } else {
            html += `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeContent.trimEnd())}</code></pre>\n`;
          }
          codeContent = '';
          codeLang = '';
          inCodeBlock = false;
        } else {
          flushList();
          flushBlockquote();
          codeLang = trimmed.slice(3).trim();
          inCodeBlock = true;
        }
        i++;
        continue;
      }

      if (inCodeBlock) {
        codeContent += line + '\n';
        i++;
        continue;
      }

      flushBlockquote();

      // 空行
      if (trimmed === '') {
        flushList();
        html += '\n';
        i++;
        continue;
      }

      // 水平线
      if (/^[-*_]{3,}\s*$/.test(trimmed)) {
        flushList();
        html += '<hr>\n';
        i++;
        continue;
      }

      // 标题
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushList();
        const level = headingMatch[1].length;
        html += `<h${level}>${parseInline(headingMatch[2])}</h${level}>\n`;
        i++;
        continue;
      }

      // 引用
      const bqMatch = trimmed.match(/^>\s*(.*)$/);
      if (bqMatch) {
        flushList();
        blockquoteLines.push(parseInline(bqMatch[1]));
        i++;
        continue;
      }

      // 无序列表
      const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (inList === 'ol') flushList();
        inList = 'ul';
        listItems.push(`<li>${parseInline(ulMatch[1])}</li>`);
        i++;
        continue;
      }

      // 有序列表
      const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (inList === 'ul') flushList();
        inList = 'ol';
        listItems.push(`<li>${parseInline(olMatch[1])}</li>`);
        i++;
        continue;
      }

      // 表格
      if (trimmed.includes('|') && trimmed.split('|').filter(Boolean).length >= 2) {
        flushList();
        const tableResult = parseTableLines(lines, i);
        if (tableResult) {
          html += tableResult.html + '\n';
          i = tableResult.nextIndex;
          continue;
        }
      }

      flushList();

      // 普通段落（合并多行）
      let paragraph = '';
      while (i < lines.length) {
        const currentLine = lines[i];
        const currentTrimmed = currentLine.trim();

        if (
          currentTrimmed === '' ||
          /^(#{1,6}\s|```|>|[-*+]\s|\d+\.\s)/.test(currentTrimmed) ||
          /^[-*_]{3,}\s*$/.test(currentTrimmed)
        ) {
          break;
        }

        if (currentTrimmed.includes('|') && currentTrimmed.split('|').filter(Boolean).length >= 2) {
          const nextLine = lines[i + 1] || '';
          if (/^\s*[-:| ]+\s*$/.test(nextLine.trim())) break;
        }

        paragraph += (paragraph ? ' ' : '') + currentLine;
        i++;
      }

      if (paragraph) {
        html += `<p>${parseInline(paragraph)}</p>\n`;
      } else {
        i++;
      }
    }

    if (inCodeBlock) {
      if (codeLang === 'mermaid') {
        html += `<div class="mermaid">\n${codeContent.trim()}\n</div>\n`;
      } else {
        html += `<pre><code>${escapeHtml(codeContent.trimEnd())}</code></pre>\n`;
      }
    }
    flushList();
    flushBlockquote();

    return html;
  }

  global.MarkdownParser = { render: renderMarkdown };
})(typeof window !== 'undefined' ? window : this);
