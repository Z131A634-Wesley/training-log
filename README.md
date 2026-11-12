# 训练日志

手机优先的个人训练记录，数据保存在当前浏览器的 localStorage。

## 本地开发

使用 Node.js 24，在项目目录运行：

```bash
npm ci
npm run dev
```

使用 `npm run verify` 执行类型检查、测试和生产构建。

## 发布到 GitHub Pages

将代码推送到 GitHub 仓库，在 Settings → Pages → Build and deployment 中将 Source 设置为 GitHub Actions。`main` 分支通过检查后自动构建并发布。项目使用相对资源路径，支持 `https://用户名.github.io/仓库名/`。

## 备份与迁移

在页面中导出 JSON 备份，在需要恢复的浏览器中导入并确认替换。浏览器数据不随 GitHub 仓库自动同步；清理浏览器数据、更换浏览器或设备之前请先备份。请勿将个人训练记录和备份文件提交到仓库。
