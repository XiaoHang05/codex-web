# 嵌入契约 v1

`createCodexWeb` 接收下列依赖，返回 Express 中间件。宿主可通过该接口接入服务，无需复制聊天界面或通过通用 RPC 暴露管理能力。

| 参数 | 责任 |
| --- | --- |
| `config`、`save()` | 私有配置与保存回调；配置不自动公开给浏览器 |
| `paths.dataDirectory` | 账号配置、历史索引、队列和设置的私有目录 |
| `paths.workspaceDirectory` | 新会话默认工作目录，与源码目录分离 |
| `auth` | 提供 `info(req)`、`requireSession(req)`、`csrf(req)`、`session(req)` |
| `services.codex` | 可选，注入宿主已持有的实例；模块不拥有其生命周期 |
| `services.preferences` | 可选，注入现有设置存储，保持已有设置 |
| `desktopAdapter` | 可选，提供桌面对象、历史、`list`、`handle`、图像引用、队列及关闭方法 |
| `eventStream(req,res)` | 可选，将既有传输事件接到已鉴权的 SSE；只能转发固定事件端点 |
| `notifications.enqueue(event)` | 可选，由宿主决定是否通知；默认是空实现 |
| `projectNotifications` | 可选，注入同一个 `ProjectNotifications` 实例；未注入时使用模块私有数据目录 |
| `notificationStatus()` | 可选，提供 `masterEnabled` 给项目设置界面展示；不允许项目规则开启宿主总开关 |
| `privateRoots` | 附加禁止文件预览和下载的绝对目录；数据目录始终禁止 |
| `browserState.queueDatabase` | 可选，保留原浏览器待发送队列数据库名；默认使用通用名称 |
| `assetVersion` | 可选，40 位提交 SHA；固定页面及浏览器模块资源版本，宿主须保留并路由旧发布物 |

宿主必须先完成 Host、Origin、HTTPS 代理来源校验，再挂载模块。模块对接口执行会话检查、对写请求执行 CSRF 检查；宿主桥接还应在边界处重复这些检查，不能传入无条件放行的生产鉴权适配器。独立入口内置密码、通行密钥与会话实现，首次运行为空配置。

```js
import {createCodexWeb} from './codex-web/src/service.js';

const service = await createCodexWeb({
  config, save, auth,
  paths: {dataDirectory, workspaceDirectory},
  services: {codex: existingManager, preferences},
  desktopAdapter,
  eventStream: existingAuthenticatedEventStream,
  embedded: true,
});
app.use(service.middleware);
```

宿主不应把 `context` 暴露给浏览器。它仅供受信任的进程内组合使用。接口采用限定路由和原生方法白名单，不提供任意路径反代或任意 native 方法转发。

`embedded: true` 时，`close()` 仅关闭模块自己的浏览器事件连接；不会停止注入的引擎、关闭注入的桌面连接、修改账户或重启宿主。独立入口拥有自己创建的实例，仅在该入口退出时清理它们。

使用 `adoptCodexManager` 可保留运行中的实例 Map、请求、审批和队列，以抽离实现处理新调用。旧传输的监听函数在当前进程退出前继续归宿主管理；不要为迁移而重启或接管它们。共享账号文件继续留在宿主私有目录，不能复制进源码包。

UI 使用固定的 `/codex/` 与 `/codex-api/v1/` 同源挂载。文件预览、图片、下载和 SSE 都使用同一个接口命名空间。宿主已有的管理接口可继续保留给管理主页，但聊天 UI 不再直接调用它们。

项目通知接口为 `/codex-api/v1/project-notifications`，使用 GET 读取、PUT 修改。修改载荷包括最新 `revision`、`action`（`project`、`all`、`default`）及 `enabled`；单项目修改还包含项目 `key`。冲突返回 409，客户端应读回，不自动重放写请求。宿主管理网站可通过指向同一实例的明确接口别名接入。项目规则由网页管理，App 的通知接收在服务端出口执行相同规则。

宿主接收的通知事件包含项目目录 `cwd`；队列必须保留对应项目标识。宿主在入队和发送前都应检查项目策略、总开关、来源/事件、通道与设备开关，关闭项目时取消其尚未发送的事件，重新开启不补发旧事件。独立包不引入任何具体推送供应商或宿主账号信息。

本服务定位为单个所有者自托管，不提供跨用户租户隔离。部署者应自行维护引擎、HTTPS、存储权限与备份。

通知事件字段、HTTP载荷、已有引擎的出口所有权和发送前检查示例见 [通知边界与接入](NOTIFICATIONS.md)。

源码与发布物职责、资源版本固定和无引擎重启更新见 [单一源码与宿主更新](UPDATING.md)。
# Interrupted task continuation

The browser offers a play button for the latest interrupted or failed turn. It starts a native empty-input turn (`input: []`, `turnTrigger: "resume_interrupted_task"`), preserving the composer draft. It never synthesizes a user text message.

Compatibility addition: `POST /codex-api/v1/desktop/:threadId/send` accepts optional `turnTrigger: "resume_interrupted_task"` with `expectedTurnId`. This combination requires empty input and verifies the latest stopped turn, idle runtime and absence of pending approvals; stale state returns HTTP 409. Ordinary sends are unchanged. Web engines use the existing `turn/start` RPC. Authentication, CSRF, account ownership and native approval policies remain enforced; existing callers need no migration.
