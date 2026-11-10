---
vendor: Proxmox VE
os: Proxmox VE 8.x / 9.x
topic: 虚拟机（QM）
devices: PVE QEMU/KVM 虚拟机（本地盘/共享存储；含 cloud-init 模板与直通场景）
keywords: [qm, 虚拟机, 迁移, 快照, cloud-init, qm clone, qm destroy, qm rescan]
sources:
  - https://pve.proxmox.com/pve-docs/chapter-qm.html
  - https://pve.proxmox.com/pve-docs/qm.1.html
  - https://pve.proxmox.com/wiki/Cloud-Init_Support
verified: high
updated: 2026-11-11
---

# Proxmox VE · 虚拟机（QM）

> VM 生命周期全部由 `qm` 管理：创建/克隆/启停/迁移/快照/扩盘/cloud-init。迁移与快照能否在线做，取决于「有没有本地绑定资源」和「存储的快照能力」，不是只看 VM 是否在运行。

升级与回退见 `proxmox-01-system.md`，备份/恢复与 vzdump 见 `proxmox-02-backup.md`，本篇不重复备份命令。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 列出 VM | `qm list` | root | 含状态、内存、磁盘、名称 |
| 查看配置 | `qm config <vmid>` | root | 完整生效配置（含快照后的当前值） |
| 运行状态 | `qm status <vmid>` | root | running/stopped，可加 `--verbose` |
| 创建 VM | `qm create <vmid> --memory <MB> --cores <N> --net0 virtio,bridge=vmbr0` | root | 新建空 VM |
| 启动 / 关机 | `qm start <vmid>`、`qm shutdown <vmid>` | root | shutdown 走 ACPI，可加超时 |
| 强制停止 | `qm stop <vmid>` | root | 等同拔电源，慎用 |
| 克隆 | `qm clone <vmid> <newid> --name <名称>` | root | 模板/VM 均可克隆 |
| 迁移 | `qm migrate <vmid> <target> [--online] [--with-local-disks]` | root | 在线迁移要求无本地绑定资源 |
| 建快照 | `qm snapshot <vmid> <快照名> [--vmstate 1]` | root | `--vmstate 1` 连内存状态一起存 |
| 快照列表 | `qm listsnapshot <vmid>` | root | 显示快照树与父快照 |
| 回滚 | `qm rollback <vmid> <快照名>` | root | 丢弃快照之后的写入 |
| 扩盘 | `qm disk resize <vmid> <磁盘> +<大小>` | root | 只扩不缩，如 `scsi0 +10G` |
| 重扫磁盘 | `qm disk rescan [--vmid <vmid>]` | root | 同步存储上磁盘大小与未使用磁盘 |
| cloud-init 更新 | `qm cloudinit update <vmid>` | root | 改完 ci 参数后生成 ISO |
| cloud-init 查看 | `qm cloudinit dump <vmid> user` | root | 导出生成的 user-data |
| 串口控制台 | `qm terminal <vmid>` | root | 需 VM 配置了串口 |
| 删除 VM | `qm destroy <vmid> [--purge]` | root | 删 VM 及全部卷，不可恢复 |

## 典型示例

从 cloud-init 模板创建 VM（官方流程）：

```bash
# 1) 准备模板 VM（9000）并导入云镜像
qm create 9000 --memory 2048 --net0 virtio,bridge=vmbr0 --scsihw virtio-scsi-pci
qm set 9000 --scsi0 local-lvm:0,import-from=/path/to/cloudimg-amd64.img
qm set 9000 --ide2 local-lvm:cloudinit
qm set 9000 --boot order=scsi0
qm set 9000 --serial0 socket --vga serial0

# 2) 克隆并注入 cloud-init 参数
qm clone 9000 123 --name ubuntu2
qm set 123 --sshkey ~/.ssh/id_rsa.pub --ipconfig0 ip=10.0.10.123/24,gw=10.0.10.1
qm cloudinit update 123
```

在线迁移与快照/回滚：

```bash
# 无 PCI/USB 直通等本地绑定资源时可在运行中迁移
qm migrate 123 node2 --online

# 升级前快照（带内存状态），出问题回滚
qm snapshot 123 before-upgrade --vmstate 1
qm listsnapshot 123
qm rollback 123 before-upgrade
```

## 陷阱与版本差异

- **带内存（`--vmstate`）的快照绑定 machine version**：官方明确无法修改快照的机器版本，换 machine 版本后旧快照只能回滚取数据；重要变更前另做一份不带内存的快照或备份。
- **PVE 8.x 与 9.x 的快照能力不同**：PVE 9.0 起厚置备 LVM 支持 snapshots-as-volume-chain（技术预览），PVE 9.1 起该类型存储可对带 TPM 状态的 VM 做离线快照；PVE 8.x 以 qcow2 internal snapshot 为主，大盘/网络存储上建删快照可能耗时数分钟至小时（官方警告），尽量关机做。
- **在线迁移的前提是「无本地绑定资源」**：PCI/USB 直通、宿主串口等设备会阻止在线迁移；本地磁盘可加 `--with-local-disks` 做在线存储迁移，否则只能关机离线迁移。
- **在线迁移仅限同 CPU 架构**：x86-64 与 arm64 之间不能迁移（PVE 9.2 起有 arm64 版本，官方说明仅同架构可迁移）。
- **cloud-init 有版本与格式要求**：guest 内 cloud-init 建议 ≥19.4；Linux 默认 nocloud、Windows 默认 configdrive2；`cipassword` 在旧 cloud-init 上不支持已哈希密码，优先用 SSH key。
- **`qm disk resize` 不支持缩小**，需要缩容只能新建小盘再迁数据；`qm rescan` 用于把存储侧磁盘大小/未使用磁盘同步回 VM 配置（官方：rescan all storages and update disk sizes and unused disk images）。
- **快照不是备份**：快照与卷在同一存储上，存储故障会一起丢；备份与恢复演练见 `proxmox-02-backup.md`。

## 高危操作 ⚠️

- ⚠️ `qm destroy <vmid>`：删除 VM 及全部磁盘卷，不可恢复；`--purge` 还会把它从备份/复制/HA 配置里清掉。
- ⚠️ `qm stop <vmid>`：等同拔电源，可能损坏 guest 文件系统；优先 `qm shutdown`，确需停止时先确认业务可中断。
- ⚠️ `qm rollback <vmid> <快照名>`：丢弃该快照之后的所有写入，回滚后旧快照链可能不可用；回滚前先做备份。
- ⚠️ `qm migrate --with-local-disks`：大量本地盘在线迁移会打满存储与迁移网络，需维护窗口并确认目标存储容量。

## 参考来源

- [Proxmox VE Administration Guide — QEMU/KVM Virtual Machines](https://pve.proxmox.com/pve-docs/chapter-qm.html)
- [qm(1) — Proxmox VE QEMU/KVM CLI](https://pve.proxmox.com/pve-docs/qm.1.html)
- [Proxmox VE Wiki — Cloud-Init Support](https://pve.proxmox.com/wiki/Cloud-Init_Support)
