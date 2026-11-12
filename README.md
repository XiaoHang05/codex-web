# Codex Web

本仓库是唯一源码维护入口。宿主使用经过验证的提交发布物接入，不维护另一份 UI；更新和资源版本约定见 [单一源码与宿主更新](docs/UPDATING.md)。

可独立运行、也可嵌入现有网站的 Codex Web 客户端。保留项目与会话列表、移动布局、流式回复、工具记录、草稿、附件、文件预览、模型设置、审批、提问和待发送队列。桌面共享通过可选适配器提供，默认关闭。

项目通知支持侧栏铃铛、单独开关、全部开启/关闭和新项目默认值；入口位于项目行、项目菜单与“账号与设置 → 通知”。策略保存在私有数据目录 `project-notifications.json`，同项目网页会话和桌面共享共用规则。批量操作仅改变已有项目，不改变新项目默认值或宿主总开关。模块提供项目过滤，真实通知通道和最终发送前的再次校验由宿主负责。独立入口默认不发送通知，需接入发送器；详见 [通知边界与接入](docs/NOTIFICATIONS.md)。

本目录是可移植源码边界。它不依赖外围项目，不包含真实账号、会话、上传文件、个人部署配置、截图或签名材料。尚未上传或公开发布；项目许可证待所有者决定。

## 独立运行

需要 Node.js 22.13 或更高版本，以及自行安装、登录和维护的 Codex 引擎。源码不分发桌面程序或引擎二进制。不同引擎版本的能力可能不同，不支持的高级功能会报告不可用。

```sh
npm ci
npm start
```

打开 `http://127.0.0.1:3290/codex/`。默认只监听回环地址，本机浏览器自动取得本地会话。首次使用需要在网页设置中登录自己的 Codex 账号，或配置自己的 API 提供方。默认工作区和私有数据位于 `.local/workspace`、`.local/data`；均不应提交。

引擎可以通过 PATH 发现，或设置 `CODEX_WEB_CODEX_BIN` 为可执行文件的绝对路径。Windows 上需要 `codex.exe`，不执行 `.cmd` shim 或 shell 命令。默认不会查找桌面安装，也不会复制全局规则、技能或凭据。

需要独立配置时，复制 `.env.example` 为 `.env`，填写自己的路径，然后执行：

```sh
node --env-file=.env src/standalone.js
```

公网访问需由自有 HTTPS 反向代理回源到回环端口，并配置 `CODEX_WEB_PUBLIC_ORIGIN`。代理须保留公网 Host、设置 `X-Forwarded-Proto: https`，并禁用事件流缓冲。严格的 Host、Origin、Cookie、CSRF 和原生审批检查保持开启。请先在本机 `/codex/access.html` 设置网站密码，可再注册通行密钥。网站登录与 Codex 账号登录是两套独立凭据。

文件预览支持对话中的普通 Markdown 文件链接，包括项目目录外明确链接的日志、报告和索引文件；历史回复无需重新生成。预览、下载与打开共用同一访问校验，私有目录和凭据文件仍拒绝访问。具体范围与打开方式见 [文件预览与打开](docs/LOCAL-FILES.md)。

## 桌面共享

默认配置是 `desktop.enabled: false`，关闭时不加载桌面适配器、不连接命名管道、不读取桌面历史。

如需启用，在私有数据目录的 `config.json` 中显式配置：

```json
{
  "desktop": {
    "enabled": true,
    "homeDirectory": "/absolute/path/to/your/desktop-home",
    "observe": false
  }
}
```

当前适配器使用 Windows 命名管道，依赖桌面端共享协议及历史数据库格式；它不是跨平台稳定接口。路径应改为部署者自己的桌面数据目录。独立版不安装计划任务、不修改桌面进程、不接管已有聊天。桌面新会话助手通过显式的 `projectRoutes` 扩展注入，未配置时不可用。

如需使用桌面安装目录的引擎，可在私有配置中设置 `discoverDesktopBinary: true`。HTTP 提供方兼容措施为 `chatgptHttpCompatibility: true`，默认关闭。不要把某个桌面版本的实验能力视为所有 CLI 版本均支持。

## 接口与嵌入

- `/codex/`：页面和全部静态资源。
- `/codex-api/v1/`：明确限定的聊天接口；以 `/capabilities` 查询协议版本及可选能力。
- `src/service.js`：`createCodexWeb(options)`，返回 `middleware`、`context`、`close()`。
- `src/embedded.js`：`adoptCodexManager(existing, config)`，在保留运行状态的前提下使用抽离后的方法。
- `adapters/desktop/index.js`：可选桌面模块，不反向引用任何宿主代码。

鉴权、生命周期、事件流与数据所有权的要求见 [嵌入契约](docs/EMBEDDING.md)。每个进程使用一套存储路径；不同实例请分进程启动，重复配置为其他路径会明确报错。

末条用户消息的铅笔按钮、重新生成、恢复记录及新增 HTTP/SSE 接口见 [消息修改](docs/MESSAGE-EDIT.md)。

## 验证与交付

```sh
npm test
npm run check
node scripts/audit-source.mjs
```

测试仅使用临时账号、虚构消息和本机协议模拟引擎，不访问真实模型、桌面实例或第三方通知。浏览器视觉验收证据属于外围工程，不进入此源码目录。`audit-source` 是发布前初筛，不能代替人工审查。

仅交付根目录文档、锁文件、`src`、`adapters`、`public`、`scripts`、`test` 和 `docs`。排除 `.local`、`.env`、`node_modules`、日志、数据库及生成产物。第三方声明见 [NOTICE](NOTICE.md)。
