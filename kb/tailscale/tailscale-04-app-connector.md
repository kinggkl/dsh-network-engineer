---
vendor: Tailscale
os: Tailscale 1.104（客户端 1.104.6 实测；命令以官方 CLI 参考为准）
topic: App Connector 与流量分流
devices: Linux app connector（需公网 IP）、Android / iOS / macOS / Windows 客户端、tailnet 管理后台
keywords: [app connector, advertise-connector, 域名分流, 公网 IP, Android 分流, MDM, grants, app-connectors]
sources:
  - https://tailscale.com/docs/features/app-connectors/how-to/setup
  - https://tailscale.com/docs/features/client/android-app-split-tunneling
  - https://tailscale.com/docs/features/client/ios-vpn-on-demand
verified: high
updated: 2026-11-16
---

# Tailscale · App Connector 与流量分流

> App Connector 是「按域名分流」的服务端方案：tailnet 里某台 Linux 节点通告自己是某个域名的出口，客户端访问该域名时流量自动绕到 connector，再从 connector 的公网出口发出。它对客户端透明，但硬性要求 connector **有公网 IP 且做了端口转发**——纯内网机器当不了 connector。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 通告为 connector | `tailscale up --advertise-connector --advertise-tags=tag:app-connector` | 客户端 | 需公网 IP + 端口转发 |
| 关闭 connector | `tailscale set --advertise-connector=false` | 客户端 | 停止通告 |
| 后台添加域名 | Machines → 设备 → ⋯ → Edit route settings → Add domains | 管理后台 | 例 `*.example.com` |
| ACL 授权域名 | 策略文件 `grants` 的 `app` 段 | 策略文件 | 限定谁能用哪个域名 |
| tag 归属 | 策略文件 `tagOwners` | 策略文件 | connector 的 tag 先授权 |
| 验证域名解析 | `tailscale status` | 客户端 | 看目标是否走 connector |
| 分层连通性 | `tailscale ping <connector 名称>` | 客户端 | 确认能到 connector |
| Android 按 App 分流 | 客户端 Settings → App split tunneling | 客户端 | ≥1.70，可排除或包含 |
| Android 包含式（MDM） | 通过 AppConfig 下发 include 列表 | 管理后台 / MDM | 只让选中 App 走 Tailscale |
| iOS 分流现状 | iOS 设置 → VPN On Demand | 客户端 | 原生无按 App 选路 |
| 查看 connector 标记 | 管理后台 Machines 列表 | 管理后台 | 设备显示 App connector |
| 恢复默认分流 | 客户端内改回「全部走 Tailscale」 | 客户端 | 立即生效 |

## 典型示例

```bash
# HIG 侧 Linux 节点作为 *.example.com 的 app connector
sudo tailscale up \
  --advertise-connector \
  --advertise-tags=tag:app-connector \
  --hostname=hig-connector
```

```json
{
  "tagOwners": { "tag:app-connector": ["autogroup:admin"] },
  "grants": [
    {
      "src": ["autogroup:member"],
      "dst": ["tag:app-connector"],
      "app": { "tailscale.com/app-connectors": ["*.example.com"] }
    }
  ]
}
```

```json
{
  "tagOwners": { "tag:hig-app-connector": ["autogroup:admin"] },
  "autoApprovers": { "routes": { "0.0.0.0/0": ["tag:hig-app-connector"] } },
  "grants": [
    { "src": ["autogroup:member"], "dst": ["tag:hig-app-connector"],
      "app": { "tailscale.com/app-connectors": ["*.example.com"] } },
    { "src": ["autogroup:member"], "dst": ["tag:hig-app-connector"],
      "ip": ["tcp:53", "udp:53"] }
  ]
}
```

## 陷阱与版本差异

- 公网 IP + 端口转发是硬性前提；只在内网可达的节点通告 connector 后，客户端解析到了域名却连不通。
- 访问日志里看到的源 IP 是 connector 的公网出口 IP，不是终端 IP；做溯源要把 connector 日志与 tailnet 审计一起看。
- 域名必须在管理后台添加、并在 ACL 的 `app` 段授权，两步缺一不可；只加域名不授权等于没配。
- Android 自 1.70 起支持按 App 分流：默认是「排除部分 App」，要让「只有选中 App 走 Tailscale」必须由 MDM 下发。
- iOS 原生客户端目前只有 VPN On Demand，没有按 App 选路；需要按 App 控制时走 MDM 的 per-app VPN，或在第三方网络工具里做策略。
- 旧的「通告 `0.0.0.0/0` 子网路由」做法与 connector 语义不同，别把两者混用。
- **官方四件套缺一不可**：`tagOwners` 授权 tag、`autoApprovers.routes` 允许该 tag 自动批准、`grants` 放行 `autogroup:member → autogroup:internet`、以及 `grants` 里**给每个 connector tag 单独开 TCP/UDP 53**（app connector 靠 PeerAPI 做 DoH 域名发现，缺这条发现链路直接断）。
- 新增 connector tag 时，凡是引用 tag 列表的位置都要同步改：后台 app 的 connectors 列表、`autoApprovers.routes`、`grants.dst`、port-53 grant 的 dst。漏其中任意一处，后台只在 Apps 页报笼统的「connector 配置不当 / Needs action」，不会指出是哪一条（2026-11 在 HIG 就漏了 port-53 那条）。
- 控制台状态与「功能是否真生效」要分开验证：`journalctl -u tailscaled | grep appc` 能看到 `handling domains` / `advertising new app connector routes` / `routeInfo write rate`，才说明域名发现与路由宣告在工作；控制台红字不必然等于不通。
- 用 API 核对设备路由**必须带 `?fields=all`**：`GET /api/v2/device/<id>` 默认不返回 `advertisedRoutes`/`enabledRoutes`，字段缺失很容易被误读成「0 条路由」。
- 打 tag 的设备 `keyExpiryDisabled=true`，key 不再过期，等于一台无人值守设备，ACL 要按最小权限收紧。
- connector 会按域名的 AAAA 记录自动宣告 IPv6 路由，即使本机没有 v6 上游；没有 v6 出口时这些宣告只让客户端先失败再回退 v4，详见 `tailscale-03-subnet-exit.md`。
- 验证端口映射是否真的生效，不要看 `netcheck`：从**另一台**节点 `tailscale ping <connector>`，第一次走 DERP、第二次起变成 `via <公网IP>:41641` 就说明入向已通；`netcheck` 报的是出向 STUN 映射端口（DNAT+SNAT 下常是随机端口），显示随机端口不代表没做转发。
- 控制台「connector 配置不当」的判定**会受节点是否开启 IPv6 转发影响**：2026-11 HIG 实测，节点无 v6 上游但 `net.ipv6.conf.all.forwarding` 为 0 时 Apps 页持续标 Needs action、改 `/api/v2/device/<id>?fields=all` 的 `advertisedRoutes`/`clientSupports.ipv6` 均无变化；把该内核参数置 1 后控制台转绿。判定口径与实际 v6 连通性是两件事，转绿不代表 v6 可通（此例容器只有 fe80、无 v6 默认路由）。
- 给 connector 换 DNS（例如换成过滤 AAAA 的解析）后，已宣告的 v6 路由**不会立刻消失**：appc 的 routeInfo 是带 TTL 的缓存，旧条目要等过期，控制面按节点上报逐步收敛。看 `/api/v2/device/<id>?fields=all` 的 `advertisedRoutes` 逐分钟变化，别把 `systemctl restart tailscaled` 当成立即清空的开关。

## 高危操作 ⚠️

- ⚠️ connector 必须把端口映射到公网，映射范围过宽等于把 tailnet 入口暴露在互联网上，务必只开必要端口。
- ⚠️ 域名通配写得过宽（如 `*` 或整段 `.com`）会把大量无关流量绕行到 connector，既慢又放大出口风险。
- ⚠️ ACL 的 `app` 段写错会导致「全员可用」或「全员不可用」，改动后先用小号身份验证再推广。
- ⚠️ 关闭 `--advertise-connector` 会让依赖该域名的业务立即回落到直连，如果直连被防火墙拦，表现为「突然不通」。
- ⚠️ 把 connector 与出口节点混在同一节点上，排障时无法区分流量走了哪条路径，建议分机部署。

## 参考来源

1. [App connectors setup（官方）](https://tailscale.com/docs/features/app-connectors/how-to/setup)
2. [App-based split tunneling on Android（官方）](https://tailscale.com/docs/features/client/android-app-split-tunneling)
3. [VPN On Demand for iOS and macOS（官方）](https://tailscale.com/docs/features/client/ios-vpn-on-demand)
