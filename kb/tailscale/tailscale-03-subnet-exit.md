---
vendor: Tailscale
os: Tailscale 1.104（客户端 1.104.6 实测；命令以官方 CLI 参考为准）
topic: 子网路由与出口节点
devices: Linux 子网路由器、exit node、macOS / Windows / 移动端客户端、云主机
keywords: [advertise-routes, accept-routes, exit node, 子网路由, ip_forward, autoApprovers, relay, 路由批准]
sources:
  - https://tailscale.com/docs/features/subnet-routers
  - https://tailscale.com/docs/features/exit-nodes
  - https://tailscale.com/docs/reference/tailscale-cli
verified: high
updated: 2026-11-16
---

# Tailscale · 子网路由与出口节点

> 两个容易混淆的能力：**子网路由**让 tailnet 访问某台节点背后的内网段（`--advertise-routes`），**出口节点**让客户端把全部上网流量交给某台节点转发（`--exit-node`）。前者是「把内网接进来」，后者是「把出口换出去」，两者都要在管理后台批准后才生效。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 通告子网 | `tailscale up --advertise-routes=172.16.1.0/24` | 客户端 | 变更后需重新批准 |
| 通告多条路由 | `tailscale up --advertise-routes=10.0.0.0/8,192.168.0.0/24` | 客户端 | 逗号分隔 |
| 后台批准路由 | Machines → 设备 → ⋯ → Edit route settings | 管理后台 | 勾选前缀后才通告 |
| 自动批准路由 | 策略文件 `autoApprovers.routes` | 策略文件 | 按 tag 自动放行 |
| 接受他人路由 | `tailscale up --accept-routes` | 客户端 | 默认关闭 |
| 通告为出口节点 | `tailscale up --advertise-exit-node` | 客户端 | 后台批准后可用 |
| 使用出口节点 | `tailscale up --exit-node=100.125.160.47` | 客户端 | IP 或 MagicDNS 名 |
| 出口保留内网访问 | `tailscale up --exit-node=… --exit-node-allow-lan-access` | 客户端 | 允许访问本机所在 LAN |
| 取消出口节点 | `tailscale set --exit-node=` | 客户端 | 空值即清除 |
| 开启内核转发 | `sysctl -w net.ipv4.ip_forward=1` | 主机 | Linux 子网路由/出口节点必需 |
| 持久化转发 | `echo 'net.ipv4.ip_forward=1' >/etc/sysctl.d/90-tailscale.conf` | 主机 | 重启后仍生效 |
| 放通转发流量 | `iptables -A FORWARD -i tailscale0 -j ACCEPT` | 主机 | 发行版不同，nft/ufw 写等价规则 |
| 查看路由通告 | `tailscale status --json` | 客户端 | 看 `Self.PrimaryRoutes` |
| Peer Relay 端口 | `tailscale set --relay-server-port=40000` | 客户端 | 较新版本支持 |
| 静态中继端点 | `tailscale set --relay-server-static-endpoints=host:port` | 客户端 | 固定中继，绕过自动发现 |

## 典型示例

```bash
# 把 172.16.1.0/24（HIG 管理网）接进 tailnet
sudo sysctl -w net.ipv4.ip_forward=1
echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/90-tailscale.conf
sudo tailscale up --advertise-routes=172.16.1.0/24 --accept-routes
tailscale status --json | grep -i route
```

```bash
# 让这台机器当出口节点，客户端把全部流量交给它
sudo tailscale up --advertise-exit-node
# 客户端侧：
tailscale up --exit-node=100.125.160.47 --exit-node-allow-lan-access
```

## 陷阱与版本差异

- 路由前缀**改动就要重新批准**：在已有 `172.16.1.0/24` 上追加 `10.0.0.0/8`，新前缀默认未批准，直到后台再勾一次。
- 子网路由和 exit node 都要求内核转发；Linux 上还要放通 `FORWARD`，否则 `tailscale ping` 通、真实业务不通。
- `--accept-routes` 是客户端侧开关，服务端批准了前缀但客户端不接受，路由也进不了本机路由表。
- 目标网段与本机已有直连路由重叠时，各平台处理不一致，通常本地直连优先；不要把 `100.64.0.0/10` 放进通告。
- 1.8x 起提供 Peer Relay（`--relay-server-port`）与静态中继端点，旧版本只能靠 DERP，跨 NAT 场景表现不同。
- `tailscale set --advertise-routes=` 是**覆盖式**写入，不是追加：迁移大批量路由时先过滤掉 `0.0.0.0/0`、`::/0` 与私网/本地段，collapse 成去重后的 CIDR 逗号串，再一次性覆盖；重复执行不会累加。
- 宣告自己到不了的网段比不宣告更糟：没有 IPv6 上游时（`ip -6 route` 里没有 default）不要宣告 v6 段，否则客户端把流量丢进来再超时回退，表现为「偶发变慢」而不是「完全不通」。
- 查设备路由状态用 API 的 `?fields=all`，否则 `advertisedRoutes`/`enabledRoutes` 缺字段会被误读成 0；覆盖写入前先导出一份当前列表，改坏能回灌。
- 同一子网被多台节点同时通告时，客户端按路由优先级挑一台，排障要同时看两侧的 `status --json` 与出口 IP。

## 高危操作 ⚠️

- ⚠️ 把客户端 `--exit-node` 指向已下线节点会直接断掉全部上网流量，恢复只能改回本地出口。
- ⚠️ 在子网路由器上执行 `tailscale down` 会让整段内网从 tailnet 消失，依赖它的运维通道同时中断。
- ⚠️ 打开 `ip_forward` 并 `FORWARD ACCEPT` 而没有配套防火墙规则，会把节点变成开放路由器，扩大内网暴露面。
- ⚠️ 不要用 `0.0.0.0/0` 当子网路由来模拟出口节点，语义与审批都不同，容易放开整条链路。
- ⚠️ 移除已批准路由后 tailnet 内指向该网段的连接会立刻黑洞，变更前先确认没有关键业务在走。

## 参考来源

1. [Subnet routers（官方）](https://tailscale.com/docs/features/subnet-routers)
2. [Exit nodes（官方）](https://tailscale.com/docs/features/exit-nodes)
3. [Tailscale CLI reference（官方）](https://tailscale.com/docs/reference/tailscale-cli)
