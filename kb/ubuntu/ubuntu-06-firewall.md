---
vendor: Ubuntu（Canonical）
os: Ubuntu 24.04 LTS（noble）
topic: 防火墙（ufw / nftables）
devices: Ubuntu 24.04 LTS 服务器（x86_64、ARM64；物理机、云主机、虚拟机）
keywords: [Ubuntu 24.04 LTS, ufw, nftables, netfilter, iptables, 防火墙, 默认策略, NAT 伪装, 规则持久化, IPv6]
sources:
  - https://ubuntu.com/server/docs/how-to/security/firewalls/
  - https://manpages.ubuntu.com/manpages/noble/man8/ufw.8.html
  - https://manpages.ubuntu.com/manpages/noble/man8/nft.8.html
verified: high
updated: 2026-11-11
---

# Ubuntu · 防火墙

> Ubuntu 的包过滤由内核 **netfilter** 子系统完成，默认管理工具是 **ufw**（Uncomplicated Firewall，noble 为 0.36.2-6），它在 `iptables-restore` 之上生成规则；更底层可直接用 **nftables**（`nft`，noble 为 1.0.9）。ufw 安装后**默认是停用状态**，一旦启用即采用「incoming deny、forward deny、outgoing allow」的默认策略并做连接状态跟踪。本页命令按 noble 软件包版本核对，跨版本差异以官方文档为准。

## 命令速查

| 功能 | 命令 | 权限 | 说明 |
|---|---|---|---|
| 查看状态 | `sudo ufw status verbose` | root | 显示默认策略与规则，加 `numbered` 带编号 |
| 启用/停用 | `sudo ufw enable`、`sudo ufw disable` | root | enable 会先 flush 自身链 |
| 设默认策略 | `sudo ufw default deny incoming` | root | 方向：incoming/outgoing/routed |
| 放行端口 | `sudo ufw allow 22/tcp` | root | 不写协议则 tcp+udp 同时放行 |
| 限来源放行 | `sudo ufw allow proto tcp from 192.168.0.0/24 to any port 22` | root | 完整语法，可加 in/out 方向与 on 接口 |
| 限速防爆破 | `sudo ufw limit ssh/tcp` | root | 同一 IP 30 秒内 6 次以上连接被拒 |
| 删除规则 | `sudo ufw delete allow 80`、`sudo ufw delete 3` | root | 按规则原文或 `status numbered` 编号删 |
| 插入/置顶 | `sudo ufw insert 1 allow 80`、`sudo ufw prepend deny from 1.2.3.4` | root | 规则 first match wins，顺序敏感 |
| 开日志 | `sudo ufw logging on`、`sudo ufw logging low` | root | 级别 off/low/medium/high/full，默认 low |
| 看原始规则 | `sudo ufw show raw` | root | status 不含 /etc/ufw/*.rules 手写规则 |
| 看规则集 | `sudo nft list ruleset` | root | nftables 全量导出，可作 `nft -f` 输入 |
| 校验规则文件 | `sudo nft -c -f /etc/nftables.conf` | root | 只检查语法，不应用 |
| 预演命令 | `sudo ufw --dry-run allow http` | root | 打印将生成的 iptables 规则，不修改 |
| 应用 profile | `sudo ufw app list`、`sudo ufw app info Samba` | root | profile 在 /etc/ufw/applications.d |
| 重置 | `sudo ufw reset` | root | 停用并恢复安装默认，清空全部 ufw 规则 |

## 典型示例

远程主机安全启用：先放行 SSH，再启用，最后核对。

```bash
sudo ufw allow proto tcp from any to any port 22 comment 'ssh'
sudo ufw --dry-run enable          # 先看将生成的规则
sudo ufw enable                    # SSH 会话下默认会二次确认
sudo ufw status verbose
```

常见主机防火墙：默认拒绝入站、只放行明确服务。

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw limit ssh/tcp
sudo ufw logging low
sudo ufw status numbered
```

把 Ubuntu 网关做成 NAT 路由器（ufw 规则文件是 iptables-restore 格式）。

```bash
# /etc/default/ufw: DEFAULT_FORWARD_POLICY="ACCEPT"
# /etc/ufw/sysctl.conf: net/ipv4/ip_forward=1
# /etc/ufw/before.rules 顶部追加：
#   *nat
#   :POSTROUTING ACCEPT [0:0]
#   -A POSTROUTING -s 192.168.0.0/24 -o eth0 -j MASQUERADE
#   COMMIT
sudo ufw disable && sudo ufw enable   # 改 rules 文件后必须重载
sudo ufw show raw
```

直接用 nftables 管理规则集（`list ruleset` 输出可直接回灌）。

```bash
sudo nft list ruleset > /root/nft-backup-$(date +%F).nft
sudo nft -c -f /etc/nftables.conf
sudo nft list ruleset | grep -E 'table|chain'
```

## 陷阱与版本差异

- **ufw 装好不等于生效**：noble 安装后默认 disabled，必须 `ufw enable` 才加载策略；误以为「装了防火墙就安全」是常见缺口。
- **`enable` 会 flush 自身链，可能断 SSH**：启用前先 `ufw allow proto tcp from any to any port 22`；SSH 下启用默认会提示确认，可 `--force enable` 跳过——但跳过确认前必须已放行 SSH。
- **`ufw status` 看不全**：它只显示 ufw 命令行管理的规则，不显示 `/etc/ufw/*.rules` 中手写的规则；排障用 `ufw show raw` 看内核视角的 filter/nat/mangle/raw 全表。
- **规则顺序敏感（first match wins）**：具体规则放前面，通用放后面；要插队用 `insert N`/`prepend`，不要指望后加的规则自动优先。
- **简单语法会同时放行 tcp 和 udp**：`ufw allow 22` 等于 22/tcp + 22/udp，只想放 TCP 写 `ufw allow 22/tcp`；端口名会查 `/etc/services`（如 `ssh`）。
- **日志规则必须放在终止规则之前**：ACCEPT/DROP/REJECT 之后的 LOG 永远不会命中；`high`/`full` 级别不限速，繁忙主机可能刷爆磁盘。
- **IPv6 默认启用**：`ufw allow 22` 同时管 IPv4/IPv6；只需环回 IPv6 时在 `/etc/default/ufw` 设 `IPV6=no` 再重载。
- **版本差异**：本页按 noble 的 ufw 0.36.2-6 与 nftables 1.0.9 核对；`route` 方向规则、`show REPORT` 等子命令随版本演进，旧版本或更新版本的语法以 `man ufw`／官方文档为准。

## 高危操作 ⚠️

- ⚠️ 远程执行 `ufw enable`、`ufw default deny incoming` 或改规则后重载：会 flush 链并立即生效，未预先放行 SSH 会当场失联，只能靠云控制台/带外救援恢复；先在维护窗口预演并确认回退通道。
- ⚠️ `ufw reset` / `ufw --force reset`：停用防火墙并恢复安装默认，清空全部 ufw 规则；远程执行相当于撤掉现有防护且可能断连，执行前用 `ufw show raw` 或备份 `/etc/ufw/*.rules`。
- ⚠️ `nft flush ruleset`：清空所有 table/chain/rule，之后内核**不再过滤任何包**（放行一切），同时删除 ufw 等工具下发的规则；只在本地维护窗口使用。
- ⚠️ `ufw logging high/full` 或带 `-j LOG` 且不限速的 iptables 规则：高流量下生成海量日志，可能写满 `/var/log` 并影响业务；日常用 `low`/`medium` 并配置 logrotate。

## 参考来源

- [Firewall — Ubuntu Server documentation](https://ubuntu.com/server/docs/how-to/security/firewalls/)
- [ufw(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/ufw.8.html)
- [nft(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/nft.8.html)
