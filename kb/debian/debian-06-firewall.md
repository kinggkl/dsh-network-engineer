---
vendor: Debian
os: Debian 12 bookworm（nftables 1.0.6，iptables 1.8.9 兼容层）
topic: 防火墙与 NAT（nftables/iptables）
devices: Debian 12 服务器、云主机、路由器/网关
keywords:
  - nftables
  - nft
  - iptables
  - iptables-nft
  - 防火墙
  - NAT
  - 规则持久化
  - firewalld
  - ufw
sources:
  - https://manpages.debian.org/bookworm/nftables/nft.8.en.html
  - https://wiki.debian.org/nftables
  - https://manpages.debian.org/bookworm/iptables/iptables.8.en.html
  - https://manpages.debian.org/bookworm/iptables/iptables-nft.8.en.html
  - https://manpages.debian.org/bookworm/iptables/iptables-save.8.en.html
verified: high
updated: 2026-11-11
---

# Debian 12 防火墙与 NAT（nftables / iptables）

> Debian 10 Buster 起默认防火墙框架是 **nftables**；`iptables` 命令仍可用，但实际走 iptables-nft 兼容层落到同一套 nftables 规则集。远程改防火墙前必须先放行 SSH 并准备回滚。

## 命令速查

| 功能 | 命令 | 说明 |
|---|---|---|
| 查看全部规则 | `nft list ruleset` | 一次列出所有 family 的 table/chain/rule |
| 带 handle 查看 | `nft -a list ruleset` | 删除/替换规则前先拿 handle |
| 创建 input 基链 | `nft add chain inet filter input '{ type filter hook input priority filter; policy drop; }'` | base chain 必须有 type/hook/priority |
| 放行已建连接 | `nft add rule inet filter input ct state established,related accept` | 状态过滤依赖 conntrack |
| 放行 SSH | `nft add rule inet filter input tcp dport 22 accept` | 远程操作前先加这条 |
| 应用规则文件 | `nft -f /etc/nftables.conf` | 原子加载整个规则集 |
| 备份规则集 | `nft list ruleset > /root/nft-$(date +%F).nft` | 输出可直接 `nft -f` 回灌 |
| 清空全部规则 | `nft flush ruleset` | ⚠️ 空规则集=不过滤 |
| 持久化生效 | `systemctl enable --now nftables.service` | 开机加载 `/etc/nftables.conf` |
| iptables 列表 | `iptables -L -n -v --line-numbers` | 实际读写 nftables 后端 |
| iptables 设默认策略 | `iptables -P INPUT DROP` | 只允许 ACCEPT/DROP |
| 保存 iptables 规则 | `iptables-save -f /root/iptables.rules` | 规则默认不持久，需 restore |

## 典型示例

最小可用的 nftables 规则集（`/etc/nftables.conf`，inet 双栈）：

```text
#!/usr/sbin/nft -f
flush ruleset

table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;
        ct state established,related accept
        iif lo accept
        ip protocol icmp accept
        tcp dport 22 accept
    }
    chain forward {
        type filter hook forward priority filter; policy drop;
    }
    chain output {
        type filter hook output priority filter; policy accept;
    }
}
```

检查并启用：

```bash
nft -c -f /etc/nftables.conf          # 先校验
nft -f /etc/nftables.conf             # 一次性加载
systemctl enable --now nftables.service
nft list ruleset                      # 确认结果
```

iptables 语法仍可用（Debian 12 默认是 nf_tables 后端，规则与 nft 共存于同一规则集）：

```bash
iptables -L -n -v --line-numbers
iptables -I INPUT 1 -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -P INPUT DROP
iptables -V                             # 版本串含 (nf_tables) 即 nft 兼容层
iptables-save -f /root/iptables.rules   # 备份；重启后需 iptables-restore 恢复
```

远程安全的变更顺序（先放行、后收紧、留自动回滚）：

```bash
nft list ruleset > /root/rollback.nft   # 1. 先备份现场
nft add rule inet filter input tcp dport 22 accept   # 2. 先确保管理面放行
```

## 陷阱与版本差异

- **nftables 没有默认 table/chain**：新装 Debian 12 的 `nft list ruleset` 为空，不代表有默认拒绝策略；需自建 table、base chain 并显式 `policy drop`。
- **`nft flush ruleset` 等于取消全部过滤**：它清空所有 table/chain/rule，空规则集下内核接受合法包；不是"清空日志"，远程执行会瞬间放开端口（Debian wiki 明确用它临时禁用 nftables）。
- **nft 与 iptables 不要混用**：Buster 起 `iptables` 默认指向 iptables-nft，规则写进同一套 nftables 规则集；用 nft 脚本维护策略时不要再同时用 iptables/ebtables/arptables 改同一套规则。
- **iptables 规则默认不持久**：重启即丢失，需 `iptables-save`/`iptables-restore` 或改用 nftables 服务加载 `/etc/nftables.conf`；Debian 12 推荐直接迁移到 nftables。
- **命令行写 base chain 要转义分号**：`{ ... \; }` 中的分号需转义，否则被 shell 当命令分隔符截断；写进文件时不需要转义。

## 高危操作 ⚠️

- ⚠️ `nft flush ruleset`：立即清空所有 table/chain/rule，空规则集=不再过滤，所有可达端口瞬间暴露；远程执行前必须备份 `nft list ruleset > 备份.nft`、保留另一条 SSH 会话，并安排维护窗口，回滚用 `nft -f 备份.nft`。
- ⚠️ 远程把默认策略改为 drop（`policy drop` 或 `iptables -P INPUT DROP`）：未先放行 SSH 时，现有会话断开后无法重连，只能带外/控制台恢复；必须先插入管理口/SSH 放行规则，并准备定时回滚任务。
- ⚠️ `systemctl mask nftables.service` 或 `apt purge nftables`：开机会不再加载 `/etc/nftables.conf`，等于撤掉主机防火墙；确认上游安全组/硬件防火墙兜底后再做，回滚用 `systemctl unmask nftables.service` 并重新安装。
- ⚠️ `iptables -F` / `iptables -X`：清空规则、删除自定义链同样导致不过滤；执行前 `iptables-save -f` 备份，并确认能通过控制台或 `iptables-restore` 恢复。

## 参考来源

1. [nft(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/nftables/nft.8.en.html)
2. [Debian Wiki: nftables](https://wiki.debian.org/nftables)
3. [iptables(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/iptables/iptables.8.en.html)
4. [iptables-nft(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/iptables/iptables-nft.8.en.html)
5. [iptables-save(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/iptables/iptables-save.8.en.html)
