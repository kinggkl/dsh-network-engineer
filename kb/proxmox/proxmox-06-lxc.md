---
vendor: Proxmox VE
os: Proxmox VE 8.x / 9.x
topic: 容器（LXC）
devices: PVE LXC 容器（privileged/unprivileged；模板存储需支持 vztmpl/rootdir）
keywords: [pct, LXC, 容器, pveam, unprivileged, 模板, nesting, cgroupv2]
sources:
  - https://pve.proxmox.com/pve-docs/chapter-pct.html
  - https://pve.proxmox.com/pve-docs/pct.1.html
  - https://pve.proxmox.com/pve-docs/pveam.1.html
  - https://pve.proxmox.com/wiki/Linux_Container
verified: high
updated: 2026-11-11
---

# Proxmox VE · 容器（LXC）

> PVE 容器是系统级容器（LXC），生命周期由 `pct` 管理、模板由 `pveam` 管理。创建时默认 `unprivileged=1`，容器 root 映射到宿主的非特权用户；能改的只有模板、资源、挂载与少数 features，不要按「虚拟机」的思路去换内核或改引导。

升级见 `proxmox-01-system.md`，备份与恢复演练见 `proxmox-02-backup.md`（容器与 VM 共用 vzdump 机制），本篇不重复备份命令。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 更新模板索引 | `pveam update` | root | 从官方仓库拉取可用模板列表 |
| 可用模板 | `pveam available [--section system]` | root | 列出可下载模板 |
| 已下载模板 | `pveam list <存储ID>` | root | 看本存储内已有模板 |
| 下载模板 | `pveam download <存储ID> <模板文件名>` | root | 模板存到 content=vztmpl 的存储 |
| 删除模板 | `pveam remove <存储ID>:vztmpl/<文件名>` | root | 删除前确认无容器引用 |
| 创建容器 | `pct create <vmid> <存储ID>:vztmpl/<模板> --hostname <名> --rootfs <存储:大小> --net0 <网卡>` | root | 默认 unprivileged=1 |
| 容器列表 | `pct list` | root | 含状态、锁、名称 |
| 查看配置 | `pct config <vmid>` | root | 完整配置，含 features/unprivileged |
| 启动/停止 | `pct start <vmid>`、`pct stop <vmid>` | root | stop 直接杀，shutdown 优雅 |
| 状态 | `pct status <vmid>` | root | running/stopped |
| 进入 shell | `pct enter <vmid>` | root | 交互式登录容器 |
| 执行命令 | `pct exec <vmid> -- <命令>` | root | 不进入 shell 直接执行 |
| 修改配置 | `pct set <vmid> --cores 2 --memory 1024` | root | 也可改 net/mp 挂载 |
| 扩盘 | `pct resize <vmid> rootfs +5G` | root | 只扩不缩 |
| 快照/回滚 | `pct snapshot <vmid> <名>`、`pct rollback <vmid> <名>` | root | 容器快照依赖存储与卷格式 |
| 克隆 | `pct clone <vmid> <newid> --hostname <名>` | root | 可指定目标节点与存储 |
| 迁移 | `pct migrate <vmid> <target> [--online]` | root | 跨节点迁移 |
| 磁盘用量 | `pct df <vmid>` | root | 容器内已用空间 |
| 删除容器 | `pct destroy <vmid> [--purge]` | root | 删容器及全部文件 |

## 典型示例

下载模板并创建容器（模板名以 `pveam available` 实际列表为准）：

```bash
pveam update
pveam available --section system
pveam download local debian-10.0-standard_10.0-1_amd64.tar.gz

pct create 101 local:vztmpl/debian-10.0-standard_10.0-1_amd64.tar.gz \
  --hostname app01 --unprivileged 1 --cores 2 --memory 1024 \
  --rootfs local-lvm:8 --net0 name=eth0,bridge=vmbr0,ip=dhcp
pct enter 101
```

容器内操作与配置调整：

```bash
# 免登录执行命令
pct exec 101 -- systemctl status

# 改网络与资源
pct set 101 -net0 name=eth0,bridge=vmbr1,ip=192.168.15.147/24,gw=192.168.15.1
pct set 101 --cores 4 --memory 2048

# 变更前快照
pct snapshot 101 before-upgrade
pct rollback 101 before-upgrade
```

## 陷阱与版本差异

- **unprivileged 缺省值随场景不同**：创建时缺省 `1`，恢复时取备份中的值；官方字段注明「不应手工修改」。unprivileged 把容器 root 映射到宿主非特权用户，是默认安全边界。
- **PVE 9.0 起彻底移除 cgroup v1/混合层级**：旧的 `systemd.unified_cgroup_hierarchy=0` 内核参数失效；容器内 systemd 需 ≥231 才支持 cgroupv2（官方说明）。
- **PVE 9.0 起创建特权容器需要 `Sys.Modify` 权限**（官方 breaking change）；特权容器缺少隔离，只应在受信环境使用。
- **`nesting=1` 会把宿主 procfs/sysfs 暴露给容器**（官方原文），同时它是容器内 systemd 做服务隔离所需；unprivileged 容器默认看不到 `mknod/mount/fuse/keyctl`，跑 Docker 等要在 features 中逐项开启（官方注明 keyctl 与 systemd-networkd 需要取舍）。
- **不要手工加 `lxc.apparmor.profile: unconfined` + `lxc.cgroup2.devices.allow` 放行设备**：这是把容器特权化的高风险组合（实测环境曾有 CT 同时开 unconfined 与 devices.allow 并挂 `/dev/net/tun`），不属于官方推荐配置；确需设备时按 features 最小化开启。
- **模板与根卷的内容类型不同**：模板存 `vztmpl`，容器根卷用 `rootdir`；存储未启用对应 content 时创建会直接失败。
- **容器快照不是备份**：快照与容器卷共存，存储故障一起丢；备份见 `proxmox-02-backup.md`。

## 高危操作 ⚠️

- ⚠️ `pct destroy <vmid>`：删除容器及全部文件；`--force` 会直接杀运行中的容器，`--purge` 会清掉备份/复制/HA 引用。
- ⚠️ 特权容器（`--privileged 1`）叠加 AppArmor unconfined / 放开 devices：容器内 root 接近宿主 root，逃逸风险高，生产环境禁用。
- ⚠️ `pct stop <vmid>`：直接终止容器，未落盘数据可能丢失；优先 `pct shutdown`。
- ⚠️ 容器内挂载宿主目录或设备（bind mount、`/dev/*` 直通）：误写会破坏宿主或影响整机，需最小权限并加只读约束。

## 参考来源

- [Proxmox VE Administration Guide — Linux Container](https://pve.proxmox.com/pve-docs/chapter-pct.html)
- [pct(1) — Proxmox VE Container Toolkit CLI](https://pve.proxmox.com/pve-docs/pct.1.html)
- [pveam(1) — Proxmox VE Appliance Manager](https://pve.proxmox.com/pve-docs/pveam.1.html)
- [Proxmox VE Wiki — Linux Container](https://pve.proxmox.com/wiki/Linux_Container)
