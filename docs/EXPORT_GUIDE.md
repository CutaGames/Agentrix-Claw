# 文档导出指南 / Document Export Guide

## 文件位置

| 文档 | 路径 | 格式 |
|------|------|------|
| **白皮书 Whitepaper** | `docs/WHITEPAPER.md` | Markdown → PDF |
| **商业计划书 Pitch Deck** | `docs/PITCH_DECK.md` | Marp Markdown → PDF/PPTX |

---

## 方法 1: VS Code 一键导出（推荐）

### 白皮书 → PDF

1. 安装 VS Code 扩展: **Markdown PDF** (`yzane.markdown-pdf`)
2. 打开 `docs/WHITEPAPER.md`
3. `Ctrl+Shift+P` → `Markdown PDF: Export (pdf)`
4. 自动生成 `docs/WHITEPAPER.pdf`

### Pitch Deck → PDF / PPTX

1. 安装 VS Code 扩展: **Marp for VS Code** (`marp-team.marp-vscode`)
2. 打开 `docs/PITCH_DECK.md`
3. 点击右上角预览按钮查看幻灯片效果
4. `Ctrl+Shift+P` → `Marp: Export Slide Deck...`
5. 选择格式: **PDF** 或 **PPTX**

---

## 方法 2: 命令行导出

### 安装 Marp CLI

```bash
npm install -g @marp-team/marp-cli
```

### 导出 Pitch Deck

```bash
# 导出为 PDF
marp docs/PITCH_DECK.md --pdf -o docs/PITCH_DECK.pdf

# 导出为 PPTX
marp docs/PITCH_DECK.md --pptx -o docs/PITCH_DECK.pptx

# 导出为 HTML（含动画）
marp docs/PITCH_DECK.md --html -o docs/PITCH_DECK.html
```

### 导出白皮书（使用 pandoc）

```bash
# 安装 pandoc
sudo apt install pandoc texlive-xetex

# 导出 PDF（支持中文）
pandoc docs/WHITEPAPER.md -o docs/WHITEPAPER.pdf \
  --pdf-engine=xelatex \
  -V mainfont="Noto Sans CJK SC" \
  -V geometry:margin=1in

# 导出 DOCX
pandoc docs/WHITEPAPER.md -o docs/WHITEPAPER.docx
```

---

## 方法 3: 在线工具

- **白皮书**: 复制 Markdown 到 [https://stackedit.io](https://stackedit.io) → Export → PDF
- **Pitch Deck**: 复制到 [https://web.marp.app](https://web.marp.app) → Menu → Export → PDF/PPTX

---

## Marp Pitch Deck 预览

安装 Marp for VS Code 后，打开 `PITCH_DECK.md` 可以直接在 VS Code 中预览幻灯片效果：

- 深色主题（#0a0a1a 背景）
- 蓝色高亮（#00d4ff 标题）
- 20 页完整路演内容
- 支持导出为 16:9 宽屏 PDF/PPTX
