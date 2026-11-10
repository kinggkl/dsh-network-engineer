---
vendor: Proxmox VE
os: Proxmox VE 8.x（Debian 12 bookworm）→ 9.x（Debian 13 trixie）
topic: 系统升级与版本管理
devices: PVE 单机与集群宿主（x86_64，UEFI/Legacy，LVM-thin/ZFS/Ceph）
keywords: [pveversion, pve8to9, 大版本升级, apt dist-upgrade, Debian 12, trixie, 内核 6.14, 网卡改名, GRUB, 回退]
sources:
  - https://pve.proxmox.com/wiki/Upgrade_from_8_to_9
  - https://pve.proxmox.com/pve-docs/chapter-sysadmin.html
  - https://pve.proxmox.com/wiki/Proxmox_VE_FAQ
verified: high
updated: 2026-11-11
---

# Proxmox VE · 系统升级与版本管理

> PVE 大版本升级＝**Debian 大版本升级**（8→9 即 bookworm→trixie）＋ PVE 软件栈升级，两者必须一起完成。只改 apt 源不升级包，会留下「`/etc/debian_version` 已显示 13、几百个包仍是 deb12 构建」的混合态，`pveversion` 与 `pve-manager` 版本都对不上——这是最难排查的一类问题。升级前必须跑官方预检脚本 `pve8to9`，它把 WARN/FAIL 分得很清楚，别凭经验跳步。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 查看 PVE 版本 | `pveversion -v` | `root@pve:~#` | 同时列出 pve-manager、内核、qemu、lxc 版本 |
| 查看发行版状态 | `cat /etc/debian_version` | 任意 shell | 与 `grep PRETTY_NAME /etc/os-release` 交叉验证 |
| 大版本预检 | `pve8to9 --full` | root shell | 只读；输出 PASS/SKIP/WARN/FAIL，FAIL 必须先清零 |
| 查看可升级的 PVE 包 | `apt policy pve-manager` | root shell | 看 Installed 与 Candidate 是否跨大版本 |
| 统计待更新包数 | `apt list --upgradable \| wc -l` | root shell | 升级前几百个包属正常 |
| 检查包被 hold | `apt-mark showhold` | root shell | 有输出说明有人锁了包，升级会卡住 |
| 模拟升级 | `apt-get -s dist-upgrade` | root shell | 看是否会误删 proxmox-ve 等关键包 |
| 查混合态包 | `dpkg -l \| grep -c deb12u` | root shell | 与 `/etc/debian_version` 对照判断是否半升级 |
| 安装 UEFI 引导包 | `apt install grub-efi-amd64` | root shell | UEFI + LVM 根必装，否则重启不进系统 |
| 执行升级 | `apt update && apt dist-upgrade` | root shell | ⚠️ 交互式，遇 conffile 提示要人工判断 |
| 重启进新内核 | `reboot` | root shell | ⚠️ 断业务；升完必须重启才算完成 |
| 查已装内核 | `dpkg -l 'pve-kernel*' \| grep ^ii` | root shell | 保留旧内核作为回退手段 |
| 查引导方式 | `[ -d /sys/firmware/efi ] && echo UEFI \|\| echo Legacy` | root shell | 决定是否要补 grub-efi 包 |
| 升级后自检 | `systemctl --failed` | root shell | 配合 `pveversion -v`、`journalctl -b -p err` |

## 典型示例

升级前（只读预检 + 备份，务必先做完）：

```bash
pveversion -v > /root/pveversion-before.txt
pve8to9 --full | tee /root/pve8to9-precheck.log
apt list --upgradable > /root/upgradable-before.txt
tar czf /root/etc-pve-$(date +%F).tar.gz /etc/pve /etc/network/interfaces /etc/apt
```

维护窗口内（在 `tmux` 里执行，防止 SSH 断线中断升级）：

```bash
tmux new -s upgrade
pve8to9                # 二次确认，无 FAIL 再继续
[ -d /sys/firmware/efi ] && apt install -y grub-efi-amd64
apt update && apt dist-upgrade     # 全程盯输出，conffile 提示逐个判断
reboot
```

重启后验证：`pveversion -v` 显示 9.x、`uname -r` 为 6.14 系列、`systemctl --failed` 为空、`pvesm status` 各存储可用、`qm list`/`pct list` 与升级前一致、各 VM/CT 网络能通。

## 陷阱与版本差异

- **半升级混合态**：只 `apt upgrade` 不 `dist-upgrade` 时，`libc6` 等核心包会卡住 595 个包的升级，但 `base-files` 会先跳到新版本，于是系统「看起来」已是 trixie。判据：`dpkg -l | grep -c deb12u` 仍有大量结果。
- **`--mailnotification` 只有 `always|failure`**（PVE 8.x），写 `never` 会直接报 `value 'never' does not have a value in the enumeration`。
- **网卡名变更**：升级到 6.14 内核实测有网卡改名风险，`vmbr0` 的 `bridge-ports` 若仍写旧名，重启后管理面直接失联——必须能物理/IKVM 接触宿主。
- **UEFI + LVM 根**必须先装 `grub-efi-amd64`，官方 wiki 明确要求；老 `systemd-boot` 元包应移除。
- **LVM-thin 卷 autoactivation**：`pve8to9` 会给 NOTICE，可按提示跑 `/usr/share/pve-manager/migrations/pve-lvm-disable-autoactivation`。
- **升级窗口预留 30–60 分钟**：`dist-upgrade` 在低功耗平台（如 N305）上可能跑很久，`tmux` 是硬要求。

## 高危操作 ⚠️

- ⚠️ `apt dist-upgrade`：整机软件栈升级，中途失败可能进不了系统；执行前必须有 `vzdump` 全量备份 + `/etc/pve` 打包 + 维护窗口 + 控制台可达。
- ⚠️ `reboot`：所有 VM/CT 一起重启，业务中断；先 `pct shutdown`/`qm shutdown` 优雅停业务，再重启宿主。
- ⚠️ `rm -rf /etc/pve/*`、`systemctl stop pve-cluster`：`/etc/pve` 是 FUSE 挂载的集群文件系统，误删等于丢全部 guest 配置，回退只能靠备份包。
- ⚠️ 删除旧内核（`apt purge pve-kernel-6.8*`）：等于放弃「GRUB 选旧内核」这条最快的回退路径，新内核起不来时只能重装。

## 参考来源

- [Proxmox VE Wiki — Upgrade from 8 to 9](https://pve.proxmox.com/wiki/Upgrade_from_8_to_9)
- [Proxmox VE Administration Guide — System Administration](https://pve.proxmox.com/pve-docs/chapter-sysadmin.html)
- [Proxmox VE FAQ](https://pve.proxmox.com/wiki/Proxmox_VE_FAQ)
