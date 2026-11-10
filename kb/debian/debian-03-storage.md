---
vendor: Debian
os: Debian 12 bookworm（对照 Debian 13 trixie）
topic: 磁盘与 LVM 文件系统
devices: 物理服务器、虚拟机、云主机
keywords: [Debian, LVM, lvextend, resize2fs, xfs_growfs, fstab, UUID, ext4, XFS, 磁盘扩容]
sources:
  - https://manpages.debian.org/bookworm/lvm2/lvm.8.en.html
  - https://manpages.debian.org/bookworm/lvm2/lvextend.8.en.html
  - https://manpages.debian.org/bookworm/e2fsprogs/resize2fs.8.en.html
  - https://manpages.debian.org/bookworm/xfsprogs/xfs_growfs.8.en.html
  - https://manpages.debian.org/bookworm/mount/fstab.5.en.html
verified: high
updated: 2026-11-11
---

# Debian 12 磁盘、LVM 与文件系统

> bookworm 的 lvm2 为 2.03.16、e2fsprogs 1.47.0：扩容顺序固定为「先扩 LV/分区，再扩文件系统」；ext4 可在线扩、缩小需卸载，XFS 只能扩且必须挂载。改 fstab 前务必备份并确认回滚通道。

## 命令速查

| 功能 | 命令 | 说明 |
|---|---|---|
| 查看块设备与文件系统 | `lsblk -f` | 树形展示磁盘、分区、LVM、挂载点与 UUID |
| 查 UUID 与类型 | `blkid` | 写 fstab 前用它取 `UUID=` 值 |
| 查看容量使用 | `df -hT` | `-T` 显示文件系统类型；`df -i` 看 inode 是否耗尽 |
| 目录占用排序 | `du -xhd1 /var \| sort -h` | `-x` 不跨文件系统，避免统计到挂载点 |
| 查看 PV | `pvs` | 显示 PV 所属 VG 与剩余空间 |
| 查看 VG | `vgs` | 重点看 `VFree` 是否还有可用空间 |
| 查看 LV | `lvs` | 显示 LV 大小、所属 VG 与类型 |
| 创建 PV | `pvcreate /dev/sdb` | 会写 LVM 元数据，盘上原有数据将不可用 |
| 创建 VG | `vgcreate vgdata /dev/sdb` | 可一次加入多块 PV |
| 创建 LV | `lvcreate -L 100G -n lvdata vgdata` | `-l 100%FREE` 用尽 VG 剩余空间 |
| 扩展 LV | `lvextend -L +50G /dev/vgdata/lvdata` | 只扩 LV；`-r` 才同时扩文件系统 |
| 扩 LV 并扩文件系统 | `lvextend -l +100%FREE -r /dev/vgdata/lvdata` | `-r` 通过 fsadm 调 resize2fs/xfs_growfs |
| 扩展 ext4 | `resize2fs /dev/vgdata/lvdata` | 挂载中可在线扩；缩小需先卸载 |
| 扩展 XFS | `xfs_growfs /data` | 参数是挂载点；XFS 不支持缩小 |
| 格式化 ext4 | `mkfs.ext4 /dev/vgdata/lvdata` | 会清空目标设备，执行前核对设备名 |
| 格式化 XFS | `mkfs.xfs /dev/vgdata/lvdata` | 同样会清空目标设备 |
| 验证 fstab | `mount -a` | 挂载 fstab 中尚未挂载的条目，报错即配置有误 |
| 备份 LVM 元数据 | `vgcfgbackup vgdata` | 默认写到 `/etc/lvm/backup/<VG>.vg`，恢复用 vgcfgrestore；`/etc/lvm/archive` 是变更前自动归档目录 |

## 典型示例

从新盘创建 LVM 并挂载为 ext4（UUID 写入 fstab）：

```text
lsblk -f                                # 先确认 /dev/sdb 空闲、无重要数据
sudo pvcreate /dev/sdb
sudo vgcreate vgdata /dev/sdb
sudo lvcreate -L 100G -n lvdata vgdata
sudo mkfs.ext4 /dev/vgdata/lvdata
sudo mkdir -p /data
sudo mount /dev/vgdata/lvdata /data
blkid /dev/vgdata/lvdata                # 取 UUID
# /etc/fstab 追加（UUID 换成实际值）：
# UUID=xxxx-xxxx /data ext4 defaults,nofail 0 2
sudo mount -a && df -hT /data
```

扩容 ext4（LV 与文件系统一起扩）：

```text
sudo vgs vgdata                         # 确认 VFree > 0
sudo lvextend -L +50G /dev/vgdata/lvdata
sudo resize2fs /dev/vgdata/lvdata       # 已挂载也可在线扩
df -hT /data                            # 确认容量已变化
```

扩容 XFS（必须挂载状态，参数给挂载点）：

```text
sudo lvextend -l +100%FREE /dev/vgdata/lvdata
sudo xfs_growfs /data
df -hT /data
```

磁盘满排查顺序：

```text
df -hT                                  # 先定位是哪个文件系统满
df -i                                   # 容量没满但写入失败，先看 inode
du -xhd1 /var | sort -h                 # 逐层下钻找大目录
sudo lsof +L1 | grep deleted            # 找已删除但仍被进程占用的文件
journalctl --disk-usage                 # systemd 日志占用
```

## 陷阱与版本差异

- **fstab 用 UUID/LABEL 而不是 /dev/sdX**：设备名取决于硬件探测顺序，加盘/换槽位后可能变化；fstab(5) 明确推荐 `UUID=`、`LABEL=`、`PARTUUID=`。
- **lvextend 不等于扩容文件系统**：不加 `-r` 时只扩大 LV，`df` 仍显示旧容量，必须再跑 `resize2fs`（ext4）或 `xfs_growfs`（XFS）。
- **resize2fs 不改变分区/LV 大小**：ext4 扩容前必须先扩大底层分区或 LV；缩小则是先缩小文件系统、再缩小 LV，顺序反了会毁数据。
- **XFS 只能扩不能缩**：`xfs_growfs` 要求文件系统处于挂载状态，接受挂载点或块设备参数；若规划需要经常缩容，选 ext4 而非 XFS。
- **ext4 在线扩有前提**：resize2fs 在线扩容依赖内核支持，bookworm 的 6.1 内核满足；缩小必须先卸载。
- **fstab 的 passno 规则**：根文件系统 `passno=1`，其他文件系统通常 `2`，不写或 `0` 表示开机不检查；swap 条目的挂载点是 `none`、类型是 `swap`。
- **defaults 的真实含义**：等于 `rw,suid,dev,exec,auto,nouser,async`；非关键数据盘建议加 `nofail`，避免设备缺失时卡在启动阶段。
- **LVM 元数据有自动备份**：`/etc/lvm/archive` 保存历史版本，可用 `vgcfgrestore` 回滚 VG 元数据；但元数据回滚救不了被误格式化/误删的数据。
- **Debian 12 与 13 的版本差异**：bookworm 为 lvm2 2.03.16；trixie 版本更新，命令语义兼容但新特性以官方文档为准。

## 高危操作 ⚠️

- ⚠️ `mkfs.ext4`、`mkfs.xfs`、`wipefs`、`sgdisk` 直接作用于错误设备：会覆盖分区表或文件系统元数据，数据基本不可恢复；执行前必须 `lsblk -f` + `blkid` 双重核对设备名，卸载相关挂载点，并在维护窗口操作。
- ⚠️ 先 `lvreduce` 缩小 LV 再缩文件系统：LV 被缩小后文件系统尾部数据直接丢失，ext4/XFS 都可能无法挂载；正确顺序是卸载 → 缩文件系统 → 缩 LV（XFS 不能缩）。
- ⚠️ 修改 `/etc/fstab` 写错 UUID、挂载点或选项：重启可能进入 emergency mode 或关键目录未挂载；改前备份 `cp /etc/fstab /etc/fstab.bak`，用 `mount -a` 验证，并保留 console/带外或救援模式入口。
- ⚠️ `pvcreate`/`vgcreate` 误用于业务盘：会覆写盘上的 LVM 元数据并破坏原有分区或文件系统；只在确认空闲的新盘上执行，生产变更前做快照或完整备份。

## 参考来源

1. [lvm(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/lvm2/lvm.8.en.html)（PV/VG/LV 模型、pv/vg/lv 命令族与元数据备份）
2. [lvextend(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/lvm2/lvextend.8.en.html)（`-L/-l`、`-r/--resizefs` 与扩容示例）
3. [resize2fs(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/e2fsprogs/resize2fs.8.en.html)（ext4 在线扩、离线缩与不改变分区大小）
4. [xfs_growfs(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/xfsprogs/xfs_growfs.8.en.html)（XFS 必须挂载才能扩、不支持缩小的限制）
5. [fstab(5) — Debian bookworm manpages](https://manpages.debian.org/bookworm/mount/fstab.5.en.html)（六个字段、UUID/LABEL、defaults/nofail 与 passno）
