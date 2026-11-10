---
vendor: Proxmox VE
os: Proxmox VE 8.x / 9.x
topic: 存储
devices: PVE 宿主存储（dir/NFS/CIFS/iSCSI/LVM/LVM-thin/ZFS/Ceph RBD）
keywords: [pvesm, 存储, NFS, CIFS, iSCSI, LVM-thin, ZFS, Ceph, 内容类型]
sources:
  - https://pve.proxmox.com/pve-docs/chapter-pvesm.html
  - https://pve.proxmox.com/pve-docs/pvesm.1.html
  - https://pve.proxmox.com/wiki/Storage
  - https://pve.proxmox.com/pve-docs/chapter-pveceph.html
verified: high
updated: 2026-11-11
---

# Proxmox VE · 存储

> 存储不是「挂上就能用」：每种后端有固定的「内容类型」组合（`images`/`rootdir`/`vztmpl`/`iso`/`backup`/`snippets`），类型不对时 VM 或容器根本无法落到该存储。排障先看 `pvesm status`，再看后端自身健康（`zpool status`、`ceph -s`、`lvs`）。

升级与备份恢复分别见 `proxmox-01-system.md`、`proxmox-02-backup.md`；本篇只讲存储的增删改、内容类型与健康检查。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 存储概况 | `pvesm status` | root | 类型、容量、Active、Shared 一览 |
| 添加目录存储 | `pvesm add dir <ID> --path <路径>` | root | 本地目录，最通用的兜底后端 |
| 添加 NFS | `pvesm add nfs <ID> --server <地址> --export <导出路径>` | root | 先手工挂载验证 NFS 可用 |
| 添加 CIFS | `pvesm add cifs <ID> --server <地址> --share <共享名> --username <用户>` | root | 需 credentials 文件时可另配 |
| 添加 LVM | `pvesm add lvm <ID> --vgname <VG>` | root | 厚置备，容量一次分配 |
| 添加 LVM-thin | `pvesm add lvmthin <ID> --vgname <VG> --thinpool <池名>` | root | 超额分配，需监控池使用率 |
| 添加 iSCSI | `pvesm add iscsi <ID> --portal <IP[:端口]> --target <TGT>` | root | 共享块存储，集群靠 LVM 分卷 |
| 添加 ZFS 池 | `pvesm add zfspool <ID> --pool <池名>` | root | 本地 ZFS，支持快照/复制 |
| 添加 Ceph RBD | `pvesm add rbd <ID> --monhost <MON列表>` | root | 需先 `pveceph install/init` |
| 修改存储属性 | `pvesm set <ID> --content <类型列表> --shared 1 --disable 1` | root | `--shared` 只是标记已共享 |
| 删除存储配置 | `pvesm remove <ID>` | root | 只删配置，不删数据、不卸载 |
| 分配卷 | `pvesm alloc <ID> <VMID> <名称> <大小>` | root | 名称传空串则自动命名 |
| 列出卷 | `pvesm list <ID> [--content images]` | root | 查 VM 磁盘 / 模板 / 备份 |
| 扫描后端 | `pvesm scan lvm\|lvmthin\|nfs\|cifs\|zfs\|iscsi\|pbs` | root | 添加存储前发现可用资源 |
| ZFS 健康 | `zpool status -x`、`zfs list -o space` | root | `-x` 只显示异常池 |
| Ceph 健康 | `ceph -s`、`ceph osd df tree` | root | 看 HEALTH、OSD up/in、容量 |

## 典型示例

目录存储 + NFS 共享，并确认内容类型：

```bash
# 本地目录（backup 专用）
pvesm add dir backup-hdd --path /mnt/backup
pvesm set backup-hdd --content backup,vztmpl,iso

# NFS 共享（先 mount 验证网络与导出权限）
pvesm add nfs nfs-store --server 10.0.0.20 --export /exports/pve --content images,backup
pvesm status
```

后端健康检查：

```bash
# ZFS：池状态与空间
zpool status -x
zfs list -o name,used,avail,refer

# Ceph：集群健康（PVE 节点已完成 pveceph install/init，存储类型用 rbd）
ceph -s
ceph osd df tree
pvesm status
```

## 陷阱与版本差异

- **内容类型决定用途**：`images`=VM 磁盘、`rootdir`=LXC 根卷、`vztmpl`=容器模板、`iso`=安装镜像、`backup`=备份文件、`snippets`=片段；缺 `images` 时 VM 磁盘无法落到该存储，缺 `rootdir` 时 LXC 不可用。
- **PVE 8.x 与 9.x 的快照语义不同**：PVE 9.0 起厚置备 LVM 支持 snapshot-as-volume-chain（技术预览），PVE 9.1 起该类型存储可对带 TPM 状态的 VM 做离线快照；PVE 8.x 主要依赖 qcow2 internal snapshot，官方明确警告大盘/网络存储上建删快照可能耗时数分钟甚至小时，尽量关机做。
- **`pvesm remove` 只删配置**：官方原文是不删数据、不卸载，仅移除存储定义；数据要手工清理，且先确认没有 guest 卷引用该存储。
- **LVM-thin 是超额分配**：thin pool 写满会导致 guest I/O 阻塞，甚至「affected guests may crash if their I/O is blocked」（官方原文）；用 `lvs`/`vgs` 看 Data% 而不是只看 `pvesm status`。
- **`--shared 1` 只是标记**：官方说明它不会让本地存储自动对其他节点可见，只是把「已经是共享存储」这件事告诉集群。
- **PVE 9.0 移除 GlusterFS 支持**（官方 breaking change）：升级前把 GlusterFS 存储迁走，或手工挂载后改用 Directory 类型。
- **ZFS/Ceph 不能只看 PVE 用量**：ZFS 要看池与数据集（`zpool status`/`zfs list`），Ceph 要看 `ceph -s` 与 OSD 状态；容量/重建/scrub 行为与 LVM-thin 完全不同。

## 高危操作 ⚠️

- ⚠️ `pvesm remove <ID>`：配置删除后所有引用该存储的 VM/CT 立即无法启动或迁移；必须先迁盘/改配置再删。
- ⚠️ `zpool destroy <池>`、`lvremove`、`ceph osd destroy`：不可逆数据删除，执行前确认无卷引用并已有备份。
- ⚠️ 手工 `rm` 存储目录/卷文件：绕过 PVE 卷管理会产生孤儿卷、容量统计错乱，甚至误删其他 guest 数据。
- ⚠️ 修改 `--shared` / `--disable` / 内容类型：影响集群内所有节点对该存储的访问，需维护窗口逐节点验证。

## 参考来源

- [Proxmox VE Administration Guide — Storage](https://pve.proxmox.com/pve-docs/chapter-pvesm.html)
- [pvesm(1) — Proxmox VE Storage Manager CLI](https://pve.proxmox.com/pve-docs/pvesm.1.html)
- [Proxmox VE Wiki — Storage](https://pve.proxmox.com/wiki/Storage)
- [Proxmox VE Administration Guide — Ceph](https://pve.proxmox.com/pve-docs/chapter-pveceph.html)
