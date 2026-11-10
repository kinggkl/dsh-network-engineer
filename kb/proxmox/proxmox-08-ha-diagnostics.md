---
vendor: Proxmox VE
os: Proxmox VE 8.x / 9.x
topic: 高可用（HA）与排障诊断
devices: PVE HA 集群（pve-ha-crm/pve-ha-lrm/watchdog 与节点/guest 故障场景）
keywords: [HA, ha-manager, quorum, fencing, watchdog, pve-ha-crm, pve-ha-lrm, pveperf, 排障]
sources:
  - https://pve.proxmox.com/pve-docs/chapter-ha-manager.html
  - https://pve.proxmox.com/pve-docs/ha-manager.1.html
  - https://pve.proxmox.com/wiki/High_Availability
  - https://pve.proxmox.com/pve-docs/pveperf.1.html
verified: high
updated: 2026-11-11
---

# Proxmox VE · 高可用（HA）与排障诊断

> PVE HA 用 corosync 仲裁 + CRM（主节点）/LRM（各节点）调度，失 quorum 超过 60 秒会触发 watchdog 硬复位节点（fencing）——HA 的前提是集群本身健康。排障顺序：`ha-manager status` 看 quorum 与 service 状态 → 查 CRM/LRM 日志 → 再查存储、网络与锁。

升级见 `proxmox-01-system.md`（含升级前快照与回退），备份见 `proxmox-02-backup.md`；集群成员与 quorum 细节见 `proxmox-03-cluster.md`。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| HA 总览 | `ha-manager status` | 任一节点 root | 看 quorum、master、lrm、service 与 fencing/watchdog |
| 受管资源 | `ha-manager config` | root | 已纳入 HA 的 VM/CT 列表 |
| 加入 HA | `ha-manager add vm:100 --state started` | root | 资源格式 `vm:<id>` / `ct:<id>` |
| 改状态 | `ha-manager set vm:100 --state stopped\|started` | root | 与 `qm`/`pct` 启停的语义不同 |
| 手动迁移 | `ha-manager migrate vm:100 node2` | root | 触发受控迁移 |
| 重定位 | `ha-manager relocate vm:100 node2` | root | 迁移并尝试快速恢复 |
| 移除 HA | `ha-manager remove vm:100` | root | 只脱离 HA 管理，不停服务 |
| 节点维护 | `ha-manager crm-command node-maintenance enable\|disable <节点>` | root | 迁走该节点上的 HA 服务 |
| 解除 HA | `ha-manager crm-command disarm-ha freeze\|ignore` | root | 9.2 起，集群级维护用 |
| 恢复 HA | `ha-manager crm-command arm-ha` | root | 与 disarm 配对 |
| 亲和规则 | `ha-manager rules add node-affinity <规则名> --resources vm:100 --nodes node1` | root | 9.0 起替代 HA Groups |
| 集群仲裁 | `pvecm status` | root | 失 quorum 是 HA 异常的首要原因 |
| CRM 日志 | `journalctl -u pve-ha-crm -n 100` | master 节点 | 调度决策与错误 |
| LRM 日志 | `journalctl -u pve-ha-lrm -n 100` | 服务所在节点 | 实际启停/迁移失败原因 |
| 集群服务日志 | `journalctl -u pve-cluster -b`、`journalctl -u corosync -b` | root | pmxcfs/corosync 异常 |
| watchdog 配置 | `cat /etc/default/pve-ha-manager` | root | 默认 softdog，可指定硬件模块 |
| 性能基线 | `pveperf /var/lib/vz` | root | CPU/磁盘基线，不测网络 |
| 模拟 HA | `pve-ha-simulator <目录>` | root | 需 `apt install pve-ha-simulator` |

## 典型示例

纳管 VM 并查看 HA 状态：

```bash
ha-manager add vm:100 --state started
ha-manager status
ha-manager config
```

维护窗口内先解除 HA 自动调度，再逐个节点维护：

```bash
# 9.2 起：全局 disarm，避免维护期间触发 fencing/自动重启
ha-manager crm-command disarm-ha freeze

ha-manager crm-command node-maintenance enable node2
# …升级/改网络/重启 node2…
ha-manager crm-command node-maintenance disable node2

ha-manager crm-command arm-ha
```

## 陷阱与版本差异

- **至少 3 节点才有可靠 quorum**，2 节点需 QDevice；失去 quorum 60 秒后 watchdog 复位节点（fencing），其上所有 guest 一起断电。
- **watchdog 默认是 softdog**；要用硬件 watchdog 须在 `/etc/default/pve-ha-manager` 指定模块，由 `watchdog-mux` 加载；不要手工 kill `pve-ha-crm`/`pve-ha-lrm`/`watchdog-mux`。
- **PVE 9.0 起 HA Groups 弃用**，迁移为 node/resource affinity rules（`ha-manager rules add ...`）；旧配置升级后按新规则管理。
- **PVE 9.2 新增 `disarm-ha`/`arm-ha` CRM 命令**，但官方 Known Issue 明确「Transient upgrade issue with a disarmed HA stack」：从旧版本升级到 9.2 前确认 HA 已 arm，不要在 disarm 状态下跨版本升级。
- **`pvecm expected 1` 只是应急手段**：临时绕过 quorum 后可能脑裂，恢复后必须改回实际票数；故障节点的 fence/恢复操作要按官方顺序做。
- **`ha-manager remove` 不等于停服务或删 guest**：它只把资源移出 HA 管理；删 guest 仍用 `qm destroy`/`pct destroy`，且先确认没有其他节点在运行同一 guest。
- **迁移失败先看两台机器的日志**：LRM 日志在服务所在节点，CRM 日志在 master；再看存储是否可达、`/etc/pve/priv/lock` 是否有残留锁、`pvecm status` 是否 quorate。
- **`pveperf` 不是业务压测**：官方只用它看 CPU/磁盘基础指标（REGEX/SECOND、BUFFERED READS、FSYNCS/SECOND 等），不能代表真实业务 IO 与网络性能。

## 高危操作 ⚠️

- ⚠️ 触发 fencing：失 quorum 超 60 秒或 watchdog 超时，节点会被硬复位，其上 guest 全部断电，存在数据丢失风险。
- ⚠️ `pvecm expected 1`：临时绕过 quorum，期间可能双主写入；仅用于恢复操作，事后立即还原为实际节点数。
- ⚠️ `ha-manager remove <资源>` 后手工在别处启动 guest：可能两个节点同时运行同一 guest 导致磁盘损坏；先确认无其他节点在跑。
- ⚠️ 维护窗口外执行 `disarm-ha`：期间失去自动故障切换与 fencing，集群故障不会自动恢复，必须有明确回退计划。

## 参考来源

- [Proxmox VE Administration Guide — High Availability](https://pve.proxmox.com/pve-docs/chapter-ha-manager.html)
- [ha-manager(1) — Proxmox VE HA Manager CLI](https://pve.proxmox.com/pve-docs/ha-manager.1.html)
- [Proxmox VE Wiki — High Availability](https://pve.proxmox.com/wiki/High_Availability)
- [pveperf(1) — Proxmox VE Performance Analysis](https://pve.proxmox.com/pve-docs/pveperf.1.html)
