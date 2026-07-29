# weiboshare

基于 Electron 和 Puppeteer 的微博批量分享工具。

## 功能

- 导入本地 `.txt` 链接文件
- 从远程接口同步待分享链接
- 按区间筛选本次要处理的链接
- 打开本机 Chrome 完成微博登录
- 按设定间隔执行批量分享
- 记录当前进度，异常后可重新开始

## 安装

```bash
npm install
```

## 运行

```bash
npm start
```

如果自动探测不到 Chrome，可在界面中手动填写 Chrome 可执行文件路径。

macOS 常见路径：

```text
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

## 打包

```bash
npm run build
```

macOS Universal（同时支持 Intel 和 Apple Silicon）：

```bash
npm run build:mac
```

说明：

- 当前 `build:mac` 已配置为 `universal`
- 已启用 `hardenedRuntime`
- 已接入 `electron-builder` 的签名与 notarization 配置
- 只有在提供有效 Apple 签名证书和 notarization 凭证后，才会真正完成签名与公证

Windows：

```bash
npm run build:win
```

## macOS 签名与 Notarization

项目当前使用 `electron-builder` 官方支持的 macOS 签名与 notarization 流程。

### 1. 准备签名证书

用于 macOS 应用直发分发时，需要 `Developer ID Application` 证书。

推荐做法：

- 在钥匙串中安装 `Developer ID Application`
- 或者准备导出的 `.p12` 文件，并通过环境变量提供给 `electron-builder`

常用环境变量：

```bash
export CSC_LINK=/absolute/path/to/DeveloperIDApplication.p12
export CSC_KEY_PASSWORD='your-p12-password'
```

如果你的机器钥匙串里已经有可用证书，也可以不设置 `CSC_LINK`，让 `electron-builder` 自动发现。

### 2. 准备 notarization 凭证

推荐使用 App Store Connect API Key。

需要以下环境变量：

```bash
export APPLE_API_KEY=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export APPLE_TEAM_ID=ABCDE12345
```

也可以改用 Apple ID 方式：

```bash
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCDE12345
```

### 3. 执行打包

```bash
npm run build:mac
```

### 4. 当前项目里的相关配置

- `package.json` 中的 `mac.hardenedRuntime` 已开启
- `package.json` 中的 `mac.notarize` 已开启
- 主应用 entitlements 文件是 `build/entitlements.mac.plist`
- 继承 entitlements 文件是 `build/entitlements.mac.inherit.plist`

### 5. 验证建议

打包完成后，建议额外验证：

```bash
codesign -dv --verbose=4 dist/mac-universal/微博分享助手.app
spctl -a -vv dist/mac-universal/微博分享助手.app
stapler validate dist/mac-universal/微博分享助手.app
```

## 使用流程

1. 导入链接文件，或点击“同步链接”
2. 根据需要设置分享间隔和区间筛选
3. 点击“启动浏览器”
4. 在打开的 Chrome 中完成微博登录
5. 回到应用点击“开始分享”

## 已做的工程化改进

- 主进程分享逻辑拆分到 `src/main/share-service.js`
- Chrome 路径支持自动探测和手动配置
- 使用 `preload.js` 暴露受控 API，移除渲染进程 `nodeIntegration`
- 渲染层拆出状态和 UI 辅助模块，避免链接筛选污染原始数据
- macOS 打包已明确配置为 `universal`，单个安装包同时支持 Intel 和 Apple Silicon
- macOS 已接入 `hardenedRuntime`、签名 entitlements 和 notarization 配置
