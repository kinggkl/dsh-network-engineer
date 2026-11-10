---
vendor: CentOS|Rocky（CentOS Stream 9 / Rocky Linux 9 同源 dnf 生态）
os: CentOS Stream 9 / Rocky Linux 9（RHEL 9 系，默认 XFS）
topic: 磁盘与 LVM / 文件系统（lsblk / LVM / XFS）
devices: CentOS Stream 9 / Rocky Linux 9 服务器（本地盘、云盘、SAN/NAS 挂载点）
keywords: [CentOS Stream 9, Rocky Linux 9, LVM, XFS, fstab, 扩容, swap, 磁盘满]
sources:
  - https://docs.rockylinux.org/9/books/admin_guide/00-toc/
  - https://www.centos.org/centos-stream/
  - https://man7.org/linux/man-pages/man5/fstab.5.html
  - https://man7.org/linux/man-pages/man8/xfs_growfs.8.html
verified: high
updated: 2026-11-11
---

# CentOS / Rocky · 磁盘与 LVM / 文件系统

> RHEL 9 默认根文件系统是 **XFS**，XFS **只能扩不能缩**；扩容顺序固定：先扩底层（云盘/分区 → PV → LV），再执行 `xfs_growfs <挂载点>`（ext4 用 `resize2fs <设备>`）。最容易踩的坑：把 `xfs_growfs` 用在设备路径上、扩完 `df` 还是旧值（因为只扩了 LV 没扩文件系统）、`/etc/fstab` 写错导致下次开机进 emergency。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 看盘与分区 | `lsblk -f` | 任意 shell | 盘、分区表、文件系统类型、UUID 一屏看全 |
| 文件系统用量 | `df -hT`；`df -i` | 任意 shell | 空间与 inode 都要看 |
| 挂载来源 | `findmnt` | 任意 shell | 与 fstab 对照排查 |
| 取 UUID | `blkid` | root | fstab 推荐用 UUID 或 LABEL |
| 创建 PV | `pvcreate /dev/vdb` | root | 先确认该盘无数据 |
| 创建 VG | `vgcreate vg_data /dev/vdb` | root | 卷组名可自定义 |
| 创建 LV | `lvcreate -n lv_data -L 500G vg_data` | root | 大小单位 G/M |
| 查看 LVM | `pvs`；`vgs`；`lvs` | root | 快速看剩余空间 |
| 格式化 XFS | `mkfs.xfs /dev/vg_data/lv_data` | root | RHEL 9 默认 XFS |
| 挂载 | `mount /dev/vg_data/lv_data /data` | root | 先建挂载点 |
| 扩容 LV | `lvextend -L +100G /dev/vg_data/lv_data` | root | 只扩 LV，不扩文件系统 |
| 在线扩 XFS | `xfs_growfs /data` | root | 参数是**挂载点**；`lvextend -r` 可自动扩 |
| 扩 ext4 | `resize2fs /dev/vg_data/lv_data` | root | 参数是**设备** |
| 校验 fstab | `mount -a`；`findmnt --verify` | root | 改 fstab 后必须执行 |
| 查看 swap | `swapon --show`；`free -h` | 任意 shell | 确认 swap 是否生效 |
| 定位大目录 | `du -xh --max-depth=1 /` 配合 `sort -h` | root | 逐层收窄 |

## 典型示例

数据盘做 LVM 并写入 fstab（以 `/dev/vdb` 为例）：

```bash
lsblk -f
pvcreate /dev/vdb
vgcreate vg_data /dev/vdb
lvcreate -n lv_data -L 500G vg_data
mkfs.xfs /dev/vg_data/lv_data
mkdir -p /data
blkid /dev/vg_data/lv_data      # 取 UUID，写入 fstab
```

```bash
# /etc/fstab 追加（UUID 以 blkid 实际输出为准）
UUID=<uuid>  /data  xfs  defaults,nofail  0 0
mount -a && findmnt /data && df -hT /data
```

云盘扩容（控制台先扩云盘容量，再在系统内扩分区与文件系统，顺序不能反）：

```bash
growpart /dev/vda 2              # 由 cloud-utils-growpart 提供，分区号按实际
pvresize /dev/vda2
lvs                              # 确认 VG/LV 名，勿照抄示例
lvextend -l +100%FREE /dev/mapper/<vg>-root
xfs_growfs /                     # XFS 扩挂载点
df -h /
```

增加一个 swap 文件（XFS 上 `fallocate` 生成的未写区可能不被接受，用 `dd` 创建更稳妥；以官方文档为准）：

```bash
dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap defaults 0 0' >> /etc/fstab
```

## 陷阱与版本差异

- **XFS 不能缩容**：RHEL 9 根分区是 XFS，想缩只能备份 → 重建 → 恢复；`resize2fs` 缩容只适用于 ext4。
- **扩完 LV 还要扩文件系统**：`lvextend` 只动 LV，`df` 不会变；紧接着 `xfs_growfs <挂载点>`（ext4 用 `resize2fs <设备>`），或直接用 `lvextend -r` 自动扩文件系统。
- **`xfs_growfs` 与 `resize2fs` 参数不同**：前者要挂载点，后者要设备路径；参数传错只会报错，但容易误以为扩容失败。
- **fstab 写错会进 emergency**：设备名、UUID、类型任一错都可能在开机时卡住；数据盘加 `nofail`，改完先 `mount -a` 和 `findmnt --verify`，并保留 `/etc/fstab.bak`。
- **大于 2T 必须用 GPT**：MBR 分区表上限 2T；已有分区表的盘不要直接 `mkfs` 整盘，先 `lsblk -f` 看清。
- **磁盘满先查 inode 与已删除文件**：`df -i` 满、`lsof +L1` 找到 deleted 但被进程占用的文件；清日志/容器/镜像目录用 `du -xh --max-depth=2` 逐层定位。
- **云盘扩容是两段式**：控制台扩容块设备后，系统内还要 `growpart` 扩分区、`pvresize`、`lvextend`、`xfs_growfs`，缺一步 `df` 都不变。
- **swap 文件权限**：必须是 `600`，否则 `swapon` 拒绝；XFS 上部分版本对 `fallocate` 生成的 swap 文件不兼容，用 `dd` 创建更稳妥（以官方文档为准）。

## 高危操作 ⚠️

- ⚠️ `mkfs.xfs` / `mkfs.ext4` / `wipefs -a <设备>`：立即抹掉目标设备文件系统元数据，数据不可逆；执行前用 `lsblk -f` 确认目标未挂载、有快照/备份，维护窗口内做。
- ⚠️ 修改 `/etc/fstab`（尤其根/启动分区）后不验证就重启：可能进 emergency 甚至远程失联；改完先 `mount -a` 与 `findmnt --verify`，数据盘加 `nofail`，保留 `/etc/fstab.bak`。
- ⚠️ `dd if=/dev/zero of=/dev/sdX`、`parted mklabel`、`wipefs`：覆盖分区表或整盘数据，可能整机报废；云主机是 `vda`/`vdb`，别照抄 `sda` 示例。
- ⚠️ `lvremove` / `vgremove` / `pvremove`：删除逻辑卷/卷组/物理卷，其上文件系统与数据直接消失；先 `umount`、确认备份，维护窗口执行。

## 参考来源

- [Rocky Linux 9 Docs — Learning Linux With Rocky（存储与 LVM 章节入口）](https://docs.rockylinux.org/9/books/admin_guide/00-toc/)
- [fstab(5) — Linux man page](https://man7.org/linux/man-pages/man5/fstab.5.html)
- [xfs_growfs(8) — Linux man page](https://man7.org/linux/man-pages/man8/xfs_growfs.8.html)
- [CentOS Documentation](https://docs.centos.org/)
