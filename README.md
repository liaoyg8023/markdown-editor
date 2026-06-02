# Markdown Editor

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

简洁强大的 Markdown 编辑与预览工具，作为 Chrome 扩展运行。

## 功能

### 编辑器
- 完整的 Markdown 语法支持：标题、粗体、斜体、删除线、行内代码、代码块、引用、链接、图片、有序/无序列表、表格、水平线
- 实时预览，三种预览模式：**分栏** / **仅编辑器** / **仅预览**
- 支持 **Mermaid 图表**（流程图、时序图、甘特图等）
- 编辑器和预览面板可拖拽调整宽度

### 文件管理
- 新建、打开、重命名、删除 Markdown 文件
- 从本地导入单个 `.md` 文件或整个文件夹
- 文件列表支持搜索过滤
- 自动保存到插件内部存储，数据不丢失

### 保存到本地
- **Ctrl+S / 保存按钮** 将内容写回本地原文件（使用 File System Access API）
- 新建文件首次保存时弹出位置选择对话框，后续自动记住
- 自动保存仅写入内部缓存，不覆盖本地文件

### 导出
- 下载 `.md` 文件
- 导出为 HTML 文件

### 界面
- 浅色/深色主题
- 全屏显示模式（F11 或点击全屏按钮）
- 可拖拽调整弹窗大小
- 状态栏显示字数、行数、保存状态

### 设置
- 编辑器字体大小调节
- 自动保存开关
- 存储用量查看与清理

## 安装

### 从源码加载（开发者模式）

1. 克隆仓库：
   ```bash
   gitee：
   git clone https://gitee.com/liaoyg/markdown-editor.git

   github：
   git clone https://github.com/liaoyg8023/markdown-editor.git
   ```
2. 打开 Chrome 浏览器，进入 `chrome://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」，选择项目目录

### 从 Chrome 网上应用店

（待发布）

## 项目结构

```
markdown-editor/
├── manifest.json              # 扩展清单
├── background.js              # 后台 Service Worker
├── icons/                     # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── lib/
│   ├── markdown-parser.js     # Markdown 解析器
│   └── mermaid.min.js         # Mermaid 图表引擎
├── popup/
│   ├── popup.html             # 主界面
│   ├── popup.css              # 样式
│   └── popup.js               # 逻辑
└── options/
    ├── options.html           # 设置页
    ├── options.css
    └── options.js
```

## 技术栈

- **Manifest V3** — Chrome 扩展最新标准
- **File System Access API** — 本地文件读写
- **IndexedDB** — 文件句柄持久化
- **Mermaid.js** — 图表渲染
- **Vanilla JS** — 无框架依赖

## 许可证

Copyright (C) 2024 liaoyg8023

本项目使用 **GNU General Public License v3.0 (GPL v3)** 许可证发布。详情请查看 [LICENSE](LICENSE) 文件。

本项目中使用的 Mermaid.js 等第三方库遵循其各自的许可证（MIT / Apache 2.0），详见 [NOTICE](NOTICE) 文件。

## 隐私

所有数据存储在本地浏览器中，不会上传到任何服务器。
