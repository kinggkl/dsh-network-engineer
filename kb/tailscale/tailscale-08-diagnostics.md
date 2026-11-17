---
vendor: Tailscale
os: Tailscale 1.104（客户端 1.104.6 实测；命令以官方 CLI 参考为准）
topic: 排障与诊断
devices: Linux / macOS / Windows 客户端、tailscaled 服务、tailnet 管理后台
keywords: [tailscale status, netcheck, tailscale ping, bugreport, DERP, 41641, 日志, 诊断]
sources:
  - https://tailscale.com/docs/reference/troubleshooting
  - https://tailscale.com/docs/reference/tailscale-cli
  - https://tailscale.com/docs/features/derp-servers
verified: high
updated: 2026-11-16
---

# Tailscale · 排障与诊断

> 排障按「控制面 → 打洞 → 业务」三层走：`tailscale status` 看控制面是否在线，`tailscale netcheck` 与 `tailscale ping` 看直连还是绕 DERP，最后才是业务端口与防火墙。最容易误判的一条：**控制面显示在线，不代表业务端口可达**。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 整体状态 | `tailscale status` | 客户端 | `--active` 只看活跃，`--json` 给脚本 |
| 网络环境体检 | `tailscale netcheck` | 客户端 | `--format=json` 可解析 |
| 分层连通性 | `tailscale ping <peer>` | 客户端 | 看是否经 DERP |
| 持续探测 | `tailscale ping --c 10 <peer>` | 客户端 | 统计丢包与路径 |
| 生成诊断包 | `tailscale bugreport` | 客户端 | 输出一个标识给官方支持 |
| 深度诊断 | `tailscale bugreport --diagnose` | 客户端 | 附带更多探针信息 |
| DERP 地图 | `tailscale debug derp-map` | 客户端 | 内部接口，字段随版本变 |
| 运行指标 | `tailscale debug metrics` | 客户端 | Prometheus 文本格式 |
| 守护进程日志 | `journalctl -u tailscaled -f` | 服务 | Linux |
| 客户端日志文件 | `/var/log/tailscaled.log` | 文件 | 路径随发行版/平台不同 |
| 直连端口探测 | `nc -zvu 100.125.160.47 41641` | 主机 | 直连候选端口 |
| DERP 连通性 | `curl -I https://controlplane.tailscale.com/derpmap/default` | 主机 | 走 TCP 443 |
| 重建连接 | `tailscale down && tailscale up` | 客户端 | 重新协商打洞 |
| 重绑网络接口 | `tailscale debug rebind` | 客户端 | 换网后恢复 |

## 典型示例

```bash
# 三层排障：控制面 → 网络路径 → 业务
tailscale status | head -20
tailscale netcheck
tailscale ping --c 5 100.125.160.47

# 需要给官方支持时收集诊断包
tailscale bugreport --diagnose
```

```bash
# Linux 侧确认服务与转发状态
systemctl status tailscaled --no-pager
journalctl -u tailscaled -n 100 --no-pager
sysctl net.ipv4.ip_forward
```

## 陷阱与版本差异

- 控制面显示在线 ≠ 可达：`status` 里的在线是控制面视角，业务端口被本机防火墙或安全组挡住照样不通。
- `lastSeen` 是控制面记录的快照，离线设备上显示的配置与指标不是当前值。
- `tailscale netcheck` 只说明打洞环境与 DERP 可达性，不验证业务端口；业务要用 `nc`/`curl` 单独测。
- `tailscale ping` 走 userspace 探测，不落 TUN，因此它通不代表业务网段也通。
- `debug` 子命令（`derp-map`、`metrics`、`rebind`）是内部接口，输出结构随版本变化，不要写进自动化脚本。
- 排障顺序固定：设备侧（服务/转发/路由）→ 控制平面 API（带 `?fields=all`）→ 客户端路由表（`netstat -rn` 是否指向 utun/tailscale0）→ 真实出口 IP（`curl https://www.cloudflare.com/cdn-cgi/trace` 看 `ip=`）。出口 IP 是分流是否生效的唯一硬证据。
- 控制面 UI 的告警文案通常很笼统（如「Needs action」「aren't configured properly」），不要据此直接改 ACL；先拿设备日志与 API 的确定性数据，再动策略。
- 客户端已装路由但流量没进隧道时，先排除本机其它代理/虚拟网卡抢流量（`route -n get <IP>`、`scutil --proxy`、`netstat -rn` 计数），再怀疑服务端。

## 高危操作 ⚠️

- ⚠️ `tailscale down` 会立即断开 tailnet，依赖 Tailscale IP 的 SSH 会话当场中断。
- ⚠️ `tailscale logout` 作废 node key，远程节点掉线后无法自恢复，重新认证只能走带外。
- ⚠️ `tailscale up --reset` 清空路由通告、exit node、SSH 开关，排障后容易忘了恢复。
- ⚠️ 删除 `/var/lib/tailscale/tailscaled.state` 等于换新节点，ACL 与密钥绑定需要重做。
- ⚠️ `tailscale debug rebind` / `restun` 会瞬时重建连接，正在传输的会话可能中断。

## 参考来源

1. [Troubleshooting（官方）](https://tailscale.com/docs/reference/troubleshooting)
2. [Tailscale CLI reference（官方）](https://tailscale.com/docs/reference/tailscale-cli)
3. [DERP servers（官方）](https://tailscale.com/docs/features/derp-servers)
