# 🛡️ PrivacyBlur

<div align="center">

  > **The privacy-first redaction tool. Zero data collection. 100% Client-side.**
  >
  > **隐私优先的打码工具。零数据收集，100% 本地运行。**

  <h3>
    <a href="https://YOUR-PROJECT-NAME.vercel.app">
      🚀 Launch App / 点击直接使用
    </a>
  </h3>

  <p>
    No Install. No Login. Runs instantly in your browser.
    <br/>
    无需安装，无需登录，浏览器即开即用。
  </p>

  <img src="https://via.placeholder.com/800x450?text=Demo+Video+Placeholder" alt="PrivacyBlur Demo" width="100%" style="border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">

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

### 🪄 2. Magic Redact (AI) / AI 魔法打码
- **Smart Detection:** One-click to auto-detect **Emails** and **Phone Numbers** using local OCR (`Tesseract.js`).
- **智能识别：** 集成 `Tesseract.js`，一键自动识别并遮挡图片中的**邮箱**和**电话号码**。

### 📄 3. PDF Workflow / PDF 工作流
- **Multi-Page Support:** Import a PDF, edit pages individually, and export as a new PDF.
- **多页支持：** 支持导入 PDF 文件，逐页编辑打码，最后重新合并导出。

### 📝 4. Text Overlay / 伪数据覆盖
- **Mock Data:** Instead of just blurring, replace sensitive text with fake names (e.g., "John Doe") to create clean, professional screenshots for presentations.
- **伪造数据：** 不仅仅是模糊，还可以用虚拟文本（如“张三”）覆盖原始信息，让演示截图更专业、美观。

---

## 🛠️ Tech Stack / 技术栈

Built with the "Vibecoding" stack for speed and aesthetics:

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Components:** [Shadcn UI](https://ui.shadcn.com/) (Concepts)
- **Core Graphics:** HTML5 Canvas API
- **PDF Engine:** `pdfjs-dist` (Parsing) + `jspdf` (Generation)
- **OCR Engine:** `tesseract.js` (WASM-based local OCR)

---

## 🚀 For Developers / 开发者指南

If you want to run this project locally or contribute:
如果你想在本地运行或参与开发：

### 1. Clone & Install
```bash
git clone [https://github.com/YOUR_USERNAME/privacy-blur.git](https://github.com/YOUR_USERNAME/privacy-blur.git)
cd privacy-blur
npm install
# Note: Use 'npm install --registry=[https://registry.npmmirror.com](https://registry.npmmirror.com)' if you are in China
