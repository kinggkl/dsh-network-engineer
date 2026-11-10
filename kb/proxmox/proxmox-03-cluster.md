---
vendor: Proxmox VE
os: Proxmox VE 8.x / 9.x
topic: 集群与节点
devices: PVE 集群节点（3 节点及以上为可靠 quorum，2 节点需 QDevice）
keywords: [pvecm, 集群, quorum, corosync, pmxcfs, QDevice, 节点加入, 节点移除]
sources:
  - https://pve.proxmox.com/pve-docs/chapter-pvecm.html
  - https://pve.proxmox.com/pve-docs/pvecm.1.html
  - https://pve.proxmox.com/wiki/Cluster_Manager
verified: high
updated: 2026-11-11
---

# Proxmox VE · 集群与节点

> PVE 集群的成员管理全部走 `pvecm`，底层是 corosync 投票 + pmxcfs（`/etc/pve` 的 FUSE 集群文件系统）。`pvecm status` 的 `Quorate` 与 `Expected/Total votes` 是判断集群是否健康的唯一入口；2 节点没有 QDevice 时没有容错，3 节点以上才有可靠 quorum。

升级与回退见 `proxmox-01-system.md`，备份与恢复见 `proxmox-02-backup.md`，本篇不重复。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 集群概况 | `pvecm status` | 任一节点 root | 看 Quorate、Expected/Total votes、Membership |
| 成员列表 | `pvecm nodes` | root | 本地视图，本机带 `(local)` |
| 创建集群 | `pvecm create <集群名>` | 首节点 root | 先定好 hostname 与 IP 再建 |
| 加入集群 | `pvecm add <已有节点IP>` | 新节点 root | 9.x 默认 API 认证 + SHA-256 指纹确认 |
| 指定集群网 | `pvecm add <ClusterIP> --link0 <本地IP>` | 新节点 root | 专用集群网；link1 可再加一条冗余 |
| 移除节点 | `pvecm delnode <节点名>` | 其余节点 root | 先迁走 guest、清复制/HA/Ceph |
| 临时降仲裁 | `pvecm expected 1` | 剩余节点 root | 仅供 delnode 因失 quorum 报错时应急 |
| 集群配置 | `cat /etc/pve/corosync.conf` | root | 改动须复制→改→递增 config_version→mv |
| corosync 状态 | `systemctl status corosync` | root | 配合 `journalctl -b -u corosync` |
| 集群文件系统 | `systemctl status pve-cluster` | root | `/etc/pve` 由 pmxcfs 提供 |
| 更新节点证书 | `pvecm updatecerts` | root | 换节点 IP/证书后执行 |
| 配 QDevice | `pvecm qdevice setup <外部地址>` | root | 给 2 节点集群提供第三票 |
| 移除 QDevice | `pvecm qdevice remove` | root | 删节点前先移除 |
| 集群网连通性 | `ip -br addr`、`ping <对端>` | root | 集群网 UDP 5405–5412 必须互通 |

## 典型示例

创建 3 节点集群（hostname/IP 必须在创建前固定）：

```bash
# 首节点
pvecm create prod-central

# 其余节点：按提示输入现有节点 root@pam 密码并核对 SHA-256 指纹
pvecm add 10.10.10.11
pvecm add 10.10.10.12

# 验证
pvecm status
pvecm nodes
```

移除节点（在仍 quorate 的节点执行；前置迁移步骤见「陷阱」）：

```bash
# 若剩余节点因失 quorum 导致 delnode 报错，临时降期望票数
pvecm expected 1
pvecm delnode node4

# 恢复为实际节点数，并清理对端残留（确认节点名无误再删）
pvecm expected 3
rm -r /etc/pve/nodes/node4
```

## 陷阱与版本差异

- **PVE 9.x 的 `pvecm add` 默认走 API 认证**：按提示输入现有节点 `root@pam` 密码并校验 SHA-256 证书指纹，不要求 root SSH 密码；需要旧流程时加 `--use_ssh`。PVE 8.x 的加入流程以对应版本文档为准。
- **PVE 9.2 起新集群显式写入 `token_coefficient 125`（毫秒）**；未显式设置时 corosync 缺省为 650 毫秒（官方 chapter-pvecm）。老集群或手写配置保留较长超时，故障重建成员更慢，排查超时要按实际值计算。
- **hostname 与 IP 创建后不可改**：官方要求先定 hostname/IP 再建集群，创建后改名/改 IP 只能重装并重新加入。
- **手工编辑 `/etc/pve/corosync.conf` 会实时生效**：官方最佳实践是先 `cp` 成 `.new` 修改、递增 `config_version` 后再 `mv` 回去；直接保存可能在编辑中途把半成品推给全集群，导致失联。
- **2 节点集群没有 QDevice 就没有容错**：3 节点以上才有可靠 quorum；加入前置还包括节点同版本、时间同步、UDP 5405–5412 与 SSH 22 互通。
- **删除节点不是一条命令**：顺序是迁走 VM/CT → 备份本地数据 → 清复制/HA/Ceph/QDevice → 停 `pve-cluster` 与 `corosync` → `pmxcfs -l` → 删 corosync 配置 → `pvecm delnode`；残留的公钥在 `/etc/pve/priv/authorized_keys` 中要手工清理。

## 高危操作 ⚠️

- ⚠️ `pvecm delnode <节点>`：把节点从集群配置删除，误删或漏迁数据只能重装该节点并重新加入；执行前完成 guest 与存储迁移。
- ⚠️ `pvecm expected 1`：临时把期望票数降到 1，失去 quorum 保护，期间可能双主写入；恢复 quorum 后必须改回实际节点数。
- ⚠️ 手工修改 `/etc/pve/corosync.conf`：配置错误会让整个集群失联，改前备份、改后 `journalctl -b -u corosync` 验证。
- ⚠️ `systemctl stop pve-cluster`：`/etc/pve` 是集群 FUSE 文件系统，停掉后所有 guest 配置不可写；仅按官方节点分离流程在维护窗口执行。

## 参考来源

- [Proxmox VE Administration Guide — Cluster Manager](https://pve.proxmox.com/pve-docs/chapter-pvecm.html)
- [pvecm(1) — Proxmox VE Cluster Manager CLI](https://pve.proxmox.com/pve-docs/pvecm.1.html)
- [Proxmox VE Wiki — Cluster Manager](https://pve.proxmox.com/wiki/Cluster_Manager)
