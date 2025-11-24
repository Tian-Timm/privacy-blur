# 🛡️ PrivacyBlur

<div align="center">

  > **The privacy-first redaction tool. Zero data collection. 100% Client-side.**
  >
  > **隐私优先的打码工具。零数据收集，100% 本地运行。**

  <h3>
    <a href="https://privacy-blur-tool.vercel.app">
      🚀 Launch App / 点击直接使用
    </a>
  </h3>

  <p>
    No Install. No Login. Runs instantly in your browser.
    <br/>
    无需安装，无需登录，浏览器即开即用。
  </p>

  <img src="https://via.placeholder.com/800x450?text=Please+Replace+With+Your+Demo+GIF" alt="PrivacyBlur Demo" width="100%" style="border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">

  <br/><br/>

  ![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
  ![Tailwind](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat-square&logo=tailwind-css)
  ![TypeScript](https://img.shields.io/badge/TypeScript-Blue?style=flat-square&logo=typescript)
  ![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

</div>

---

## ✨ Features / 功能特性

### 🔒 1. Local-First Privacy / 本地隐私优先
- **Zero Server Uploads:** Images and PDFs are processed entirely within your browser's memory.
- **Safe:** Your sensitive data (ID cards, contracts, chat logs) never leaves your device.
- **零服务端上传：** 图片和 PDF 完全在浏览器内存中处理。
- **安全：** 你的敏感数据（身份证、合同、聊天记录）永远不会离开你的设备。

### 🦎 2. Chameleon Text Overlay / 变色龙伪造数据
- **Smart Blending:** Automatically samples the surrounding background color to make text overlays look native.
- **Mock Data:** Replace sensitive numbers like `$1,234` with `$9,999` seamlessly. No more ugly black boxes.
- **智能背景融合：** 自动吸取选区周围的背景色，让覆盖上去的伪造数据（如假名字、假金额）完美融入背景，毫无违和感。

### ✋ 3. Move & Edit / 自由编辑
- **Layer Control:** Select, drag, and drop any redaction box to adjust its position.
- **Live Update:** Text overlays automatically re-calculate background colors when moved to a new spot.
- **自由拖拽：** 支持选中任意遮挡框进行移动和调整。
- **实时计算：** 文字框拖动到新位置时，会自动重新吸取新位置的背景色，确保持续“隐身”。

### 📄 4. PDF Workflow / PDF 工作流
- **Multi-Page Support:** Import a PDF, edit pages individually using lazy-loading, and export as a new PDF.
- **多页支持：** 支持导入多页 PDF 文件，采用懒加载技术流畅处理，逐页编辑打码，最后重新合并导出。

---

## 🛠️ Tech Stack / 技术栈

Built with the "Vibecoding" stack for speed and aesthetics:

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Core Graphics:** HTML5 Canvas API (Custom Rendering Engine)
- **PDF Engine:** `pdfjs-dist` (Parsing) + `jspdf` (Generation)
- **Architecture:** Local-First, Headless UI logic.

---

## 🚀 For Developers / 开发者指南

If you want to run this project locally or contribute:
如果你想在本地运行或参与开发：

### 1. Clone & Install
```bash
git clone [https://github.com/Tian-Timm/privacy-blur.git](https://github.com/Tian-Timm/privacy-blur.git)
cd privacy-blur
npm install
# Note: Use 'npm install --registry=[https://registry.npmmirror.com](https://registry.npmmirror.com)' if you are in China
2. Run Development Server
Bash

npm run dev
Open http://localhost:3000 with your browser.

3. Build for Production
Bash

npm run build
npm start
🤝 Contributing / 贡献
Created by Vic.

This project is open source. Feel free to open issues or submit PRs if you have cool ideas! 本项目完全开源。如果你有很酷的想法，欢迎提交 Issue 或 PR！

📄 License
MIT License © 2025 PrivacyBlur