---
vendor: Tailscale
os: Tailscale 1.104（客户端 1.104.6 实测；命令以官方 CLI 参考为准）
topic: 系统管理与安装
devices: Linux 节点（Debian 12 / Ubuntu 24.04 / CentOS Stream 9）、macOS（App Store 与 standalone）、Windows、iOS / Android 客户端、容器与云主机
keywords: [tailscale up, tailscale down, tailscale status, tailscaled, 系统服务, 自动更新, 状态文件, operator]
sources:
  - https://tailscale.com/docs/install/linux
  - https://tailscale.com/docs/reference/tailscale-cli
  - https://tailscale.com/docs/install/mac
verified: high
updated: 2026-11-16
---

# Tailscale · 系统管理与安装

> Tailscale 客户端由常驻守护进程 `tailscaled` 和命令行 `tailscale` 组成：入网、断网、改设置都是 CLI 把请求交给 `tailscaled`，再由它落盘到状态文件。因此「装好」不等于「已入网」——`tailscale ip -4` 能拿到 `100.64.0.0/10` 地址才算真正进了 tailnet。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| Linux 一键安装 | `curl -fsSL https://tailscale.com/install.sh \| sh` | 主机 shell | 自动识别发行版并装好 tailscaled |
| apt 源安装 | `sudo apt-get install tailscale`（先按官方文档加 pkgs.tailscale.com 源） | 主机 shell | Debian / Ubuntu 推荐走源 |
| 启用守护进程 | `sudo systemctl enable --now tailscaled` | 服务 | Linux 常驻服务 |
| 登录并入网 | `tailscale up` | 客户端 | 打印登录 URL，浏览器授权 |
| 用 auth key 入网 | `tailscale up --auth-key=tskey-auth-…` | 客户端 | 自动化、容器、无人值守 |
| 断开但保留登录 | `tailscale down` | 客户端 | 节点身份与偏好都还在 |
| 注销并作废 node key | `tailscale logout` | 客户端 | 下次使用要重新认证 |
| 查看状态 | `tailscale status` | 客户端 | `--json` 供脚本解析 |
| 查看版本 | `tailscale version` | 客户端 | 输出 long version 与 go 版本 |
| 升级客户端 | `tailscale update` | 客户端 | Linux 需 root，`--yes` 免交互 |
| 开启自动升级 | `tailscale set --auto-update` | 客户端 | 关闭用 `--auto-update=false` |
| 授权普通用户操作 | `tailscale up --operator=$USER` | 客户端 | 免 sudo 跑 tailscale |
| 恢复默认偏好 | `tailscale up --reset` | 客户端 | 清空路由、exit node 等设置 |
| 查看服务日志 | `journalctl -u tailscaled -f` | 服务 | Linux 排查启动失败 |

## 典型示例

```bash
# Debian/Ubuntu：装好、起服务、入网、确认拿到地址
curl -fsSL https://tailscale.com/install.sh | sh
sudo systemctl enable --now tailscaled
tailscale up
tailscale ip -4
```

```bash
# 用 auth key 全自动入网，并允许本机用户免 sudo 操作
sudo mkdir -p /etc/tailscale
sudo install -m 600 /dev/null /etc/tailscale/authkey
sudo tailscale up --auth-key=file:/etc/tailscale/authkey \
  --advertise-tags=tag:server --operator=$USER
tailscale status | head
```

## 陷阱与版本差异

- `tailscale up` 的 flag 是**全量设置**：只要带了任意一个 flag，没写出来的设置会被默认值覆盖；只改单项请用 `tailscale set`，或加 `--reset` 重新给全量。
- macOS App Store 版本由 App Store 更新，`tailscale update` 不适用；CLI 在 `/Applications/Tailscale.app/Contents/MacOS/tailscale`，没做软链时不要以为命令缺失。
- Linux 上 `tailscale up/status` 默认要 root；容器里通常先 `tailscale up --auth-key`，再让进程常驻，且状态目录必须挂持久卷。
- 较新版本默认开启更新检查（`--update-check`），企业镜像可关；`--accept-risk` 一类 flag 只有新版本才有。
- 状态文件默认 `/var/lib/tailscale/tailscaled.state`，它保存节点身份与偏好；换机迁移时连身份一起搬会与新设备冲突。
- Proxmox **unprivileged LXC** 里跑 tailscale 需要 `/dev/net/tun`：`lxc.cgroup2.devices.allow: c 10:200 rwm` 与 `lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file` 两行必须写在 `/etc/pve/lxc/<id>.conf` 的**主配置段**；用 `>>` 追加容易落进快照段（`[snapname]`）而静默失效，改用 `sed -i '/^\[snapname\]/i …'` 插入，容器内用 `ls -l /dev/net/tun` 验证是 `crw-rw-rw- 10,200`。
- 改容器网络/设备前先 `pct snapshot <id> pre-ts` 并 `cp -a /etc/pve/lxc/<id>.conf /root/`，回退只要 `pct rollback <id> pre-ts`。
- Debian 13（trixie）装官方包要加 pkgs.tailscale.com 源；apt 安装可能超时/抢锁，放后台 `nohup … &` 跑并回看日志更稳。

## 高危操作 ⚠️

- ⚠️ `tailscale logout` 会作废当前 node key，远程节点掉线后无法自恢复，无人值守机器要谨慎。
- ⚠️ `tailscale down` 立即断开 tailnet，依赖 Tailscale IP 的 SSH/RDP 会话会当场中断。
- ⚠️ 删除 `/var/lib/tailscale/tailscaled.state` 等于换了一台新节点，后台会留下旧设备记录，ACL 与密钥绑定需重配。
- ⚠️ `tailscale update` 期间 `tailscaled` 会重启，承载 serve/funnel 或子网路由的节点会短暂不可用。
- ⚠️ `tailscale up --reset` 会清空路由通告、exit node、SSH 服务开关，恢复需要逐项重配。

## 参考来源

1. [Install Tailscale on Linux（官方）](https://tailscale.com/docs/install/linux)
2. [Tailscale CLI reference（官方命令参考）](https://tailscale.com/docs/reference/tailscale-cli)
3. [Install Tailscale on macOS（官方）](https://tailscale.com/docs/install/mac)
