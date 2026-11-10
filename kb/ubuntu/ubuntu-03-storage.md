---
vendor: Ubuntu（Canonical）
os: Ubuntu 24.04 LTS（noble）
topic: 磁盘与存储（LVM / ext4 / XFS / fstab）
devices: Ubuntu 24.04 LTS 服务器（x86_64、ARM64；物理机、云主机、虚拟机）
keywords: [Ubuntu 24.04 LTS, LVM, lvextend, resize2fs, xfs_growfs, fstab, UUID, ext4, XFS, 快照, 磁盘满]
sources:
  - https://ubuntu.com/server/docs/how-to/storage/manage-logical-volumes/
  - https://manpages.ubuntu.com/manpages/noble/man8/lvextend.8.html
  - https://manpages.ubuntu.com/manpages/noble/man8/resize2fs.8.html
  - https://manpages.ubuntu.com/manpages/noble/man8/xfs_growfs.8.html
verified: high
updated: 2026-11-11
---

# Ubuntu · 磁盘与存储

> Ubuntu Server 安装器官方支持的磁盘布局就是 **LVM**：先 `pvcreate` 初始化物理卷，再 `vgcreate` 建卷组，`lvcreate` 切逻辑卷；扩容用 `lvextend --resizefs` 一步完成 LV + 文件系统。最容易踩的坑：用 `/dev/sdX` 而不是 UUID 写 `/etc/fstab`（设备名漂移导致开不了机）、把 `lvreduce`/`mkfs` 用错设备、以及忘了 LVM 快照的空间只用于存「变化块」，写满即失效。

## 命令速查

| 功能 | 命令 | 权限 | 说明 |
|---|---|---|---|
| 列块设备 | `lsblk -f` | 任意用户 | 树形显示设备、文件系统、UUID、挂载点 |
| 查 UUID | `blkid` | root | 写 `/etc/fstab` 用 UUID 而不是设备名 |
| 查空间 | `df -hT` | 任意用户 | 按文件系统类型看使用率 |
| 查挂载来源 | `findmnt` | 任意用户 | 确认某目录来自哪个设备/分区 |
| 列 PV/VG/LV | `pvs`、`vgs`、`lvs` | root | 看剩余空间与快照已用比例 |
| 初始化物理卷 | `sudo pvcreate /dev/sda1` | root | 分区类型需为 LVM（fdisk code 8e） |
| 建卷组 | `sudo vgcreate foo /dev/sda1` | root | 卷组名 `foo` 可自定义 |
| 建逻辑卷 | `sudo lvcreate --name bar --size 5g foo` | root | 设备为 `/dev/foo/bar` 或 `/dev/mapper/foo-bar` |
| 扩容 LV+文件系统 | `sudo lvextend --resizefs --size +5g foo/bar` | root | `+` 为增量；省略 `+` 为绝对大小 |
| 扩 ext4 | `sudo resize2fs /dev/foo/bar` | root | 已挂载可在线扩；缩容必须卸载 |
| 扩 XFS | `sudo xfs_growfs /mnt/data` | root | 必须已挂载，参数是挂载点 |
| 迁移 PV 数据 | `sudo pvmove --name bar /dev/sda1` | root | 中断后可安全续跑 |
| 建快照 | `sudo lvcreate --snapshot --name lv_snapshot --size 5g foo/bar` | root | 快照写满即失效 |
| 回滚快照 | `sudo lvconvert --merge foo/lv_snapshot` | root | origin 在用则下次激活/重启时合并 |
| 查 swap | `swapon --show`、`free -h` | 任意用户 | 确认 swap 设备与余量 |

## 典型示例

巡检现状（只读，先看清再动）：

```bash
lsblk -f
blkid
df -hT
pvs; vgs; lvs
findmnt -T /var
```

新建 LVM 逻辑卷、扩容并做变更前快照：

```bash
sudo pvcreate /dev/sdb1
sudo vgcreate data /dev/sdb1
sudo lvcreate --name app --size 20g data
sudo mkfs.ext4 /dev/data/app            # 只在确认设备为空时执行
echo 'UUID='"$(blkid -s UUID -o value /dev/data/app)"' /srv/app ext4 defaults 0 2' | sudo tee -a /etc/fstab
sudo mkdir -p /srv/app && sudo mount -a
sudo lvcreate --snapshot --name app_snap --size 10g data/app   # 变更前快照
sudo lvextend --resizefs --size +10g data/app                 # 扩容 LV 与 ext4
```

回滚快照后验证：`lvs` 看快照是否还在、`df -hT` 看容量、`findmnt /srv/app` 看挂载正常。XFS 文件系统扩容用：

```bash
sudo lvextend --size +10g data/app
sudo xfs_growfs /srv/app
```

写 `/etc/fstab` 的原则：**用 UUID 或 LABEL，别用 `/dev/sdX`**；改完先 `sudo mount -a` 验证没有报错再退出（否则重启可能进 emergency mode），并在维护窗口内安排重启确认。

## 陷阱与版本差异

- **`/etc/fstab` 写错会导致启动失败**：设备不存在或 UUID 写错时系统进入 emergency mode，远程机器需控制台恢复；改前备份 `cp /etc/fstab /etc/fstab.bak`，改后 `mount -a` 全量验证。
- **LVM 快照不是「备份」**：快照空间只记录 origin 的变化块，写满后快照失效；用 `lvs` 看 `Data%`，快满时提前 `lvextend` 扩容或尽快用完即删。
- **ext4 缩容必须先卸载**：`resize2fs` 对已挂载 ext4 只支持在线**扩**，缩容要先卸载文件系统；且必须先缩文件系统再缩 LV/分区，顺序反了会丢数据。
- **XFS 只能扩不能缩**：`xfs_growfs` 必须在已挂载状态下对挂载点执行，没有缩容能力；需要缩小容量只能备份重建，规划时留足余量。
- **`df` 与 `lsblk` 不一致很常见**：文件被删除但进程仍持有句柄时空间不释放，用 `sudo lsof +L1` 找 deleted 文件，重启对应服务即可回收。
- **多路径/云盘设备名会变**：云主机挂盘或 SAN 环境下 `/dev/sdX` 顺序不固定，fstab 一律用 `blkid` 输出的 UUID。

## 高危操作 ⚠️

- ⚠️ `mkfs.ext4` / `mkfs.xfs` / `wipefs -a`：直接覆盖设备上的文件系统签名，误对数据盘或系统盘执行会瞬间清空数据且无法用 fsck 恢复。执行前用 `lsblk -f` 确认设备为空、已备份，并在维护窗口操作。
- ⚠️ 修改 `/etc/fstab`（尤其根分区/`/boot` 条目）：写错会导致下次启动进入 emergency mode，远程机器可能失联。改前备份，改后 `sudo mount -a` 验证，重启验证安排在维护窗口并保留控制台通道。
- ⚠️ `lvreduce` / `lvresize --size -…`（缩小逻辑卷）：会截断文件系统，必须先卸载并先缩文件系统；顺序错误或空间估算不足会丢数据，生产环境优先「备份+重建」而不是在线缩容。
- ⚠️ `pvmove`（迁移物理卷数据）与 `lvconvert --merge`（快照回滚）：都涉及在线数据搬移，中断虽可恢复（pvmove 可续跑），但快照回滚会丢弃快照创建后的所有写入；执行前确认备份与业务窗口。

## 参考来源

- [Ubuntu Server docs — How to manage logical volumes](https://ubuntu.com/server/docs/how-to/storage/manage-logical-volumes/)
- [lvextend(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/lvextend.8.html)
- [resize2fs(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/resize2fs.8.html)
- [xfs_growfs(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/xfs_growfs.8.html)
