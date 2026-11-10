---
vendor: CentOS|Rocky（CentOS Stream 9 / Rocky Linux 9 同源 dnf 生态）
os: CentOS Stream 9 / Rocky Linux 9（RHEL 9 系，firewalld，nftables 后端）
topic: 防火墙（firewalld / firewall-cmd）
devices: CentOS Stream 9 / Rocky Linux 9 服务器（物理机、云主机、虚拟机；单网卡与双网卡网关）
keywords: [CentOS Stream 9, Rocky Linux 9, firewalld, firewall-cmd, zone, rich rule, nftables, SELinux]
sources:
  - https://docs.rockylinux.org/9/guides/security/firewalld/
  - https://firewalld.org/documentation/
  - https://www.centos.org/centos-stream/
  - https://docs.centos.org/
verified: high
updated: 2026-11-11
---

# CentOS / Rocky · 防火墙（firewalld）

> RHEL 9 默认 firewalld（nftables 后端）+ SELinux：**运行时规则与永久规则是两套，`--permanent` 改完必须 `--reload` 才生效**，只改运行时重启即丢。远程改防火墙最容易把自己关在外面：动手前确认 `sshd` 所在 zone 放行、带外控制台可回滚；另外 SELinux 与防火墙是两层，端口放行不等于 SELinux 允许服务监听。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 服务状态 | `systemctl status firewalld` | 任意 shell | RHEL 9 默认启用 |
| 运行状态 | `firewall-cmd --state` | 任意 shell | running / not running |
| 默认 zone | `firewall-cmd --get-default-zone` | 任意 shell | 通常 public |
| 活动 zone | `firewall-cmd --get-active-zones` | 任意 shell | 看接口/源属于哪个 zone |
| 当前规则 | `firewall-cmd --list-all` | 任意 shell | 当前 zone 全量规则 |
| 所有 zone | `firewall-cmd --list-all-zones` | 任意 shell | 逐个 zone 核对 |
| 放行服务 | `firewall-cmd --permanent --add-service=http` | root | 之后 `--reload` |
| 放行端口 | `firewall-cmd --permanent --add-port=8080/tcp` | root | 去掉 `--permanent` 只改运行时 |
| 移除放行 | `firewall-cmd --permanent --remove-service=http` | root | `--reload` 后生效 |
| 重载永久规则 | `firewall-cmd --reload` | root | 会清掉仅运行时的改动 |
| 运行时转永久 | `firewall-cmd --runtime-to-permanent` | root | 把当前规则固化 |
| 改接口 zone | `firewall-cmd --permanent --zone=internal --change-interface=eth1` | root | 双网卡分区常用 |
| 限源放行 | `firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" service name="ssh" accept'` | root | rich rule 语法 |
| NAT 伪装 | `firewall-cmd --permanent --add-masquerade` | root | 出口网关用 |
| 校验配置 | `firewall-cmd --check-config` | root | reload 前先查语法 |
| 临时放行 | `firewall-cmd --add-service=http --timeout=600` | root | 600 秒后自动移除 |
| 服务清单 | `firewall-cmd --get-services` | 任意 shell | 可用 service 名 |

## 典型示例

放行 Web 服务，SSH 只允许运维网段：

```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.10.0/24" service name="ssh" accept'
firewall-cmd --check-config
firewall-cmd --reload
firewall-cmd --list-all
firewall-cmd --list-rich-rules
```

双网卡网关：内网口进 internal zone，外网口做 NAT：

```bash
firewall-cmd --permanent --zone=internal --change-interface=eth1
firewall-cmd --permanent --zone=public --add-masquerade
firewall-cmd --reload
firewall-cmd --get-active-zones
```

临时排障放行（不写永久配置，超时自动收回）：

```bash
firewall-cmd --add-service=ssh --timeout=300
firewall-cmd --list-services
firewall-cmd --runtime-to-permanent    # 确认无误后再决定是否固化
```

## 陷阱与版本差异

- **运行时 vs 永久是两套规则**：`--permanent` 只改配置文件，必须 `--reload`；不带 `--permanent` 的改动在 reload/重启后消失，`--runtime-to-permanent` 才是反向固化。
- **reload 会丢掉 runtime 改动**：排障时临时 `--add-port` 后一旦 reload 就没了，别把临时放行当永久配置。
- **默认 zone 与接口归属**：新网卡默认落在默认 zone（public），`--change-interface` 要配合 `--permanent` 才持久；改前先 `--get-active-zones` 确认。
- **SELinux 是独立一层**：`firewall-cmd --add-port=8080/tcp` 只放行网络层，httpd 监听 8080 仍会被 SELinux 拒绝，需要 `semanage port -a -t http_port_t -p tcp 8080`。
- **service 名要存在**：`--add-service` 只接受预定义服务（见 `--get-services`），自定义端口用 `--add-port`；自定义服务可 `--new-service` 并定义端口。
- **别与 iptables/nftables 手工规则混用**：RHEL 9 默认 firewalld 管 nftables，手工 `nft add rule` 或启 `iptables.service` 会和 firewalld 抢规则表，reload 后行为不可预期；`--direct` 已不推荐。
- **IPv4/IPv6 都要测**：firewalld 规则通常同时作用于 v4/v6，`family="ipv4"` 的 rich rule 只管 v4；只测一种协议会漏。
- **`--panic-on` 是全局断网**：它阻断所有进出流量（含 SSH），不是「只挡外网」，生产环境不要碰。

## 高危操作 ⚠️

- ⚠️ `firewall-cmd --panic-on` 或把默认 zone 改成 drop：立即阻断全部进出流量（含 SSH），只能带外/控制台执行 `--panic-off` 或改回 zone；严禁远程操作，先确认 `--query-panic`。
- ⚠️ 远程删 SSH 放行或换端口后 `--reload`：新端口没先放行就 reload 会立刻断连；顺序是先 `--add-port` + reload 验证新端口可连，再改 sshd 端口，全程保留现有会话与带外通道。
- ⚠️ `systemctl stop firewalld`、`systemctl disable firewalld`：机器短时暴露在无过滤网络，属安全风险（不一定断连）；需有替代 nftables 规则并限时，操作完立即恢复并核对 `--list-all`。
- ⚠️ 删除/覆盖 `/etc/firewalld/zones/*.xml` 或整体 `--complete-reload`：自定义规则丢失，可能断业务或失联；改前备份 `/etc/firewalld/`，`--complete-reload` 仅在维护窗口用。

## 参考来源

- [Rocky Linux 9 Docs — firewalld](https://docs.rockylinux.org/9/guides/security/firewalld/)
- [firewalld Documentation](https://firewalld.org/documentation/)
- [CentOS Project — CentOS Stream](https://www.centos.org/centos-stream/)
- [CentOS Documentation](https://docs.centos.org/)
