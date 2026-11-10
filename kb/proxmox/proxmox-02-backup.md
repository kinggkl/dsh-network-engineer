---
vendor: Proxmox VE
os: Proxmox VE 8.x / 9.x（vzdump + pct/qm 恢复）
topic: 备份恢复与存储
devices: PVE 单机与集群宿主（dir/NFS/CIFS/PBS；LVM-thin、ZFS、Ceph 后端）
keywords: [vzdump, 备份, 恢复, mode snapshot, zstd, pct restore, qmrestore, 恢复演练, /etc/pve, 存储容量]
sources:
  - https://pve.proxmox.com/pve-docs/chapter-vzdump.html
  - https://pve.proxmox.com/wiki/Backup_and_Restore
  - https://pve.proxmox.com/pve-docs/chapter-storage.html
verified: high
updated: 2026-11-11
---

# Proxmox VE · 备份恢复与存储

> PVE 的备份是**整机级**的：`vzdump` 把 VM/CT 的磁盘、配置一起打包成单个文件，恢复时带着原来的 `net0`、`hostname`、`unprivileged`、`onboot` 等全部配置回来。判断「有没有备份」只看两件事——存储上有没有备份文件、**有没有做过一次恢复演练**；只看目录里有文件，等于没验证。升级、改网络、动存储之前，全量 `vzdump` + `/etc/pve` 打包是最低要求。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 全量备份（不停机） | `vzdump --all --mode snapshot --compress zstd --storage local` | `root@pve:~#` | snapshot 模式靠存储快照，业务基本无感 |
| 单机备份 | `vzdump 102 --mode snapshot --compress zstd --storage local` | root shell | 参数与 `--all` 相同，只备份指定 vmid |
| 指定备份文件名注释 | `vzdump --all --notes-template 'pre-upgrade 2026-11-11'` | root shell | 注释写进备份索引，恢复时能认出用途 |
| 仅失败时发邮件 | `vzdump --all --mailnotification failure` | root shell | 8.x 只接受 `always`/`failure`，`never` 会报错 |
| 限制保留份数 | `vzdump --all --prune-backups 'keep-last=3'` | root shell | 配合存储级 retention，避免备份把盘塞满 |
| 查看备份目录 | `ls -lh /var/lib/vz/dump` | root shell | dir 型存储的默认 dump 路径 |
| 校验压缩包完整性 | `zstd -t vzdump-qemu-102-*.vma.zst` | root shell | 恢复前先验，损坏的包恢复必失败 |
| 生成校验清单 | `sha256sum /var/lib/vz/dump/*.zst > MANIFEST.sha256` | root shell | 异地副本落地后用它核对 |
| 核对校验清单 | `sha256sum -c MANIFEST.sha256` | root shell | 每个文件输出 OK/FAILED |
| 恢复容器（可换 vmid） | `pct restore 913 /var/lib/vz/dump/vzdump-lxc-100-*.tar.zst --storage local-lvm` | root shell | 恢复演练用新 vmid，不覆盖生产 |
| 恢复虚拟机 | `qmrestore /var/lib/vz/dump/vzdump-qemu-102-*.vma.zst 913 --storage local-lvm` | root shell | 同上，落到新 vmid |
| 启动并核对 | `pct start 913 && pct config 913` | root shell | 看 `net0`/`hostname` 是否原样还原 |
| 清理演练副本 | `pct destroy 913` | root shell | ⚠️ 连同磁盘一起删，先确认 vmid 没搞错 |
| 打包集群配置 | `tar czf /root/etc-pve-$(date +%F).tar.gz /etc/pve` | root shell | `/etc/pve` 是 guest 配置的唯一来源 |
| 查看存储与容量 | `pvesm status` | root shell | 备份前确认目标存储 `content` 含 `backup` |

## 典型示例

升级或改网络前的最小动作集（实测：8 台 guest 约 8.5 GB、2 分钟）：

```bash
tar czf /root/etc-pve-$(date +%F-%H%M).tar.gz /etc/pve /etc/network/interfaces /etc/apt
vzdump --all --mode snapshot --compress zstd --storage local \
        --mailnotification failure --notes-template 'pre-upgrade'
ls -lh /var/lib/vz/dump | tail -20        # 核对数量与大小
```

恢复演练（这一步不做，「已备份」就不成立）：

```bash
zstd -t /var/lib/vz/dump/vzdump-lxc-100-*.tar.zst     # 先验包
pct restore 913 /var/lib/vz/dump/vzdump-lxc-100-*.tar.zst --storage local-lvm
pct start 913 && pct config 913                       # 核对 net0 / hostname / unprivileged
pct destroy 913                                        # ⚠️ 演练完清理
```

集群里定时任务写在 `/etc/pve/jobs.cfg`，只在 Web 界面建、不写 cron；`/etc/cron.d/vzdump` 只剩 PATH 行是正常现象，别据此判断「没配置备份」。

## 陷阱与版本差异

- **`--mailnotification` 枚举只有 `always`/`failure`**，写 `never` 直接报 `value 'never' does not have a value in the enumeration`。
- **snapshot 模式依赖底层快照**：磁盘在 dir(qcow2)、lvmthin、zfs、rbd 上才可用；裸 LVM/直通盘会回落到 suspend 或 stop 模式，业务会短暂中断。
- **备份存储必须有 `backup` 内容类型**：dir/NFS/CIFS/PBS 可以，lvmthin 这类块存储不能直接放备份，选错存储 `vzdump` 会报 `storage does not support content type 'backup'`。
- **`/etc/cron.d/vzdump` 不能作为判据**：8.x 的定时备份在 `/etc/pve/jobs.cfg`，cron 文件常只剩环境变量行。
- **同名恢复会覆盖**：`pct restore`/`qmrestore` 指定已存在的 vmid 会先删原机，演练一律用空闲 vmid（如 9xx 段）。
- **空间双倍占用**：快照模式下备份期间 thin 池会短暂保留旧数据块，薄置备的宿主务必先看 `pvesm status` 余量。

## 高危操作 ⚠️

- ⚠️ `pct destroy <vmid>` / `qm destroy <vmid>`：磁盘与配置一起销毁，不可撤销；恢复演练结束清理时先 `pct config` 确认 vmid 是演练机。
- ⚠️ `vzdump --mode stop`：会先关机再备份，生产业务中断；能用 snapshot 就别用 stop。
- ⚠️ `rm -rf /var/lib/vz/dump/*`：删掉的是唯一的恢复来源，删除前先确认异地副本已完成校验。
- ⚠️ 恢复时误用生产 vmid（如 `pct restore 100`）：会覆盖生产容器的磁盘，务必换新 vmid 或先做二次确认。

## 参考来源

- [Proxmox VE Administration Guide — Backup and Restore](https://pve.proxmox.com/pve-docs/chapter-vzdump.html)
- [Proxmox VE Wiki — Backup and Restore](https://pve.proxmox.com/wiki/Backup_and_Restore)
- [Proxmox VE Administration Guide — Storage](https://pve.proxmox.com/pve-docs/chapter-storage.html)
