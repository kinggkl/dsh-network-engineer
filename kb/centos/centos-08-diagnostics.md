---
vendor: CentOS|Rocky（CentOS Stream 9 / Rocky Linux 9 同源 dnf 生态）
os: CentOS Stream 9 / Rocky Linux 9（RHEL 9 系，5.14 内核）
topic: 排障与性能诊断（CPU / 内存 / IO / 网络）
devices: CentOS Stream 9 / Rocky Linux 9 服务器（物理机、云主机、虚拟机、容器宿主）
keywords: [CentOS Stream 9, Rocky Linux 9, 排障, PSI, iostat, ss, tcpdump, journalctl]
sources:
  - https://docs.rockylinux.org/9/books/admin_guide/00-toc/
  - https://docs.rockylinux.org/9/guides/troubleshooting/kernel_panic/
  - https://www.centos.org/centos-stream/
  - https://man7.org/linux/man-pages/man8/ss.8.html
verified: high
updated: 2026-11-11
---

# CentOS / Rocky · 排障与性能诊断

> 排障先定性再上工具：**负载高≠CPU 高**（load average 含 D 状态 IO 等待）、**内存剩得少≠泄漏**（page cache 可回收，看 `available`）、**丢包要分层收窄**（`ip -s link` → `ss -s` → `tcpdump` → `mtr`）。RHEL 9 的 `/proc/pressure/*` 直接给 CPU/内存/IO 的 PSI 压力值；别顺手 `echo 3 > /proc/sys/vm/drop_caches` 或 `kill -9` 数据库进程。

## 命令速查

| 功能 | 命令 | 视图/位置 | 说明 |
|---|---|---|---|
| 负载与运行时长 | `uptime` | 任意 shell | load 1/5/15 分钟，含 D 状态进程 |
| 进程概览 | `top -b -n1` 配合 `head -20` | 任意 shell | 看 CPU/内存前几名 |
| 虚拟内存统计 | `vmstat 1 10` | 任意 shell | r/b、si/so、wa 是关键列 |
| 内存与 swap | `free -h` | 任意 shell | 重点看 `available` 列 |
| PSI 压力 | `cat /proc/pressure/cpu`、`memory`、`io` | 任意 shell | `some`/`full` 表示资源争抢 |
| 磁盘 IO | `iostat -x 1` | 任意 shell | 看 await、%util、r/s、w/s |
| 单进程 IO | `pidstat -d 1` | 任意 shell | 由 sysstat 提供 |
| IO 大户 | `iotop -oP` | root | 只显示有 IO 的进程 |
| 空间与 inode | `df -hT`；`df -i` | 任意 shell | inode 满同样写不进 |
| 网络连接统计 | `ss -s` | 任意 shell | TCP 状态汇总 |
| 监听与连接 | `ss -tulnp` | root | 端口与进程一起看 |
| 网卡计数 | `ip -s link` | 任意 shell | errors/dropped 是否增长 |
| 抓包 | `tcpdump -i eth0 -nn -c 100` | root | 限包数、加过滤器 |
| 链路质量 | `mtr -rw <目标IP>` | 任意 shell | 逐跳丢包与延迟（需装 mtr） |
| 内核日志 | `dmesg -T` 配合 `grep -Ei -e error -e fail -e oom` | root | 带人类可读时间 |
| 启动错误 | `journalctl -b -p err --no-pager` | 任意 shell | 本次启动错误 |
| OOM 记录 | `journalctl -k` 配合 `grep -i 'out of memory'` | root | 找 OOM killer 痕迹 |
| 启动耗时 | `systemd-analyze blame` | 任意 shell | 定位慢服务 |
| sysstat 历史 | `sar -u 1 5`；`systemctl status sysstat` | 任意 shell | 默认未启用，需 enable |

## 典型示例

负载高时的定性顺序（先分清 CPU、IO 还是内存）：

```bash
uptime
vmstat 1 10
top -b -n1 | head -20
iostat -x 1 5
cat /proc/pressure/io      # some/full 高说明 IO 争抢严重
```

网络问题分层收窄（从本机计数到逐跳链路）：

```bash
ip -s link show eth0
ss -s
ss -tulnp | head
tcpdump -i eth0 -nn -c 100 host <对端IP>
mtr -rw <目标IP>
```

日志侧确认是 OOM、驱动还是启动失败：

```bash
dmesg -T | grep -Ei 'error|fail|oom' | tail -50
journalctl -b -p err --no-pager | tail -50
journalctl -k | grep -i 'out of memory'
systemd-analyze blame | head
```

## 陷阱与版本差异

- **load average 含 IO 等待**：Linux 的 load 包含 `D`（不可中断睡眠）状态进程，高 load 但 CPU 空闲常见于磁盘/NFS 卡住；结合 `vmstat` 的 `r/b`、`wa` 和 PSI 判定。
- **free 的 `available` 才是可用内存**：`buff/cache` 可回收，剩余内存少不等于泄漏；swap 被用也不等于泄漏，看 `si/so` 是否持续非零。
- **PSI 的 `some` 与 `full` 含义不同**：`some` 表示至少部分任务受阻，`full` 表示全部任务都受阻（内存/IO）；CPU 只有 `some`，没有 `full`。
- **sysstat 默认不装/不启动**：`sar`、`pidstat`、`iostat` 都来自 sysstat，最小安装没有；要先 `dnf install sysstat` 并 `systemctl enable --now sysstat`，历史数据只从启用后开始。
- **journald 持久化前提**：`/var/log/journal` 不存在时日志只在内存，重启即丢；`journalctl -b -1` 看上次启动，但断电/崩溃可能缺尾部日志。
- **`drop_caches` 不是「释放内存」**：它清 page cache 让系统短时 IO 抖动，还会把指标清零、妨碍判断，且不释放进程占用的内存。
- **`kill -9` 有后果**：数据库、集群、存储进程被 SIGKILL 不会执行清理，可能丢事务、损坏数据、恢复时间更长；先 `kill -TERM` 并观察。
- **诊断工具不在最小安装里**：`mtr`、`iotop`、`sysstat`、`tcpdump` 都需单独装；容器里看 load/内存看到的是宿主数据，排容器要回宿主看 cgroup。

## 高危操作 ⚠️

- ⚠️ `echo 3 > /proc/sys/vm/drop_caches`：清空 page cache、dentries、inodes，系统短时 IO 抖动、性能下降，且指标归零妨碍排障；生产只在维护窗口做，绝不用它「释放内存」。
- ⚠️ `kill -9` 数据库/集群/存储进程：跳过优雅清理，可能丢事务、损坏数据、触发长时间恢复；先 `kill -TERM` 并等待，确认无响应再评估，生产需有备份。
- ⚠️ `sysctl -w` 直接调内核参数（`vm.swappiness`、`net.*`、`kernel.panic`）：写错可致宕机、丢连接或性能劣化；应写 `/etc/sysctl.d/` 后 `sysctl --system`，改前记录原值并备回退。
- ⚠️ `dmesg -c`、`journalctl --rotate --vacuum-time=1s`、`rm -rf /var/log/journal`：清掉排障与审计证据，故障复盘不可逆；需要空间请用 `--vacuum-time` 保留窗口，先 `journalctl --disk-usage`。
- ⚠️ 生产网口裸跑 `tcpdump` 不设限：高流量下占 CPU/磁盘，可能影响业务；用 `-c` 限包数、加 host/port 过滤器、短时抓取并指定 `-w` 文件。

## 参考来源

- [Rocky Linux 9 Docs — Learning Linux With Rocky（系统排障入口）](https://docs.rockylinux.org/9/books/admin_guide/00-toc/)
- [Rocky Linux 9 Docs — How to deal with a kernel panic](https://docs.rockylinux.org/9/guides/troubleshooting/kernel_panic/)
- [ss(8) — Linux man page](https://man7.org/linux/man-pages/man8/ss.8.html)
- [CentOS Project — CentOS Stream](https://www.centos.org/centos-stream/)
