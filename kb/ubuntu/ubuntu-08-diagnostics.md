---
vendor: Ubuntu（Canonical）
os: Ubuntu 24.04 LTS（noble）
topic: 系统诊断与性能排障（CPU / 内存 / IO / 网络 / 日志）
devices: Ubuntu 24.04 LTS 服务器（x86_64、ARM64；物理机、云主机、虚拟机）
keywords: [Ubuntu 24.04 LTS, 性能诊断, top, vmstat, iostat, ss, tcpdump, mtr, journalctl, dmesg, sysctl, PSI]
sources:
  - https://ubuntu.com/server/docs/reference/cli-cheatsheet/
  - https://manpages.ubuntu.com/manpages/noble/man1/top.1.html
  - https://manpages.ubuntu.com/manpages/noble/man8/vmstat.8.html
  - https://manpages.ubuntu.com/manpages/noble/man1/free.1.html
  - https://manpages.ubuntu.com/manpages/noble/man8/ss.8.html
  - https://manpages.ubuntu.com/manpages/noble/man8/tcpdump.8.html
  - https://manpages.ubuntu.com/manpages/noble/man1/iostat.1.html
verified: high
updated: 2026-11-11
---

# Ubuntu · 系统诊断与性能排障

> 建议顺序：先看整体负载与内存（uptime / free / vmstat / PSI）→ 定位单进程（top）→ IO 慢查 iostat/iotop → 网络问题用 ss/ip/tcpdump/mtr → 最后看 dmesg/journalctl 与启动状态。本页按 noble 软件包手册核对，PSI 等未逐项核实处已就地标注。

## 命令速查

| 功能 | 命令 | 权限 | 说明 |
|---|---|---|---|
| 运行时长与负载 | `uptime` | 任意 | 1/5/15 分钟 load average，高值可能是 CPU 也可能是 IO 等待 |
| 进程实时视图 | `top` | 任意 | 交互式；批处理用 `top -b -n 1`，按内存排序 `-o %MEM` |
| 内存与交换 | `free -h` | 任意 | used = total − available，available 才是可用余量 |
| 虚拟内存与 CPU 采样 | `vmstat 1 5` | 任意 | r=可运行、b=等 IO；第一行是自开机以来平均值 |
| 内存/IO 压力 PSI | `cat /proc/pressure/memory` | 任意 | some/full 与 avg10/avg60/avg300，需内核启用（以官方文档为准） |
| 磁盘 IO 扩展指标 | `iostat -xz 1 5` | 任意 | await、aqu-sz、%util；第一条为自开机均值，`-y` 可跳过 |
| 进程级 IO | `sudo iotop -oPa` | root | 只显示有 IO 的进程；需安装 iotop（以官方文档为准） |
| 监听与连接 | `ss -tuln` | 任意 | TCP/UDP 监听套接字，`-n` 不解析端口名 |
| 连接内部指标 | `ss -tinp` | root 看进程 | `-i` 看 RTT、重传、cwnd、字节数 |
| 套接字汇总 | `ss -s` | 任意 | 各 TCP 状态计数，快速看连接堆积 |
| 接口错误/丢包 | `ip -s link show <if>` | 任意 | 看 RX/TX errors、dropped、overrun 是否增长 |
| 抓包定位 | `tcpdump -i any -nn -c 100 port 443` | root | 结束会报 captured / received / dropped by kernel |
| 路径质量 | `mtr -rwzbc 20 <host>` | 任意 | 报告模式，合并 ping 与 traceroute 的逐跳统计 |
| 内核环形日志 | `dmesg -T -l err,warn` | 任意 | `-T` 时间戳在 suspend/resume 后可能不准 |
| 系统与服务日志 | `journalctl -b -p err` | adm 组 | `-u <unit>` 看单服务，`-b -1` 看上次启动 |
| 启动耗时 | `systemd-analyze blame` | 任意 | systemd 自带，按耗时排序启动单元 |
| 服务失败项 | `systemctl --failed` | 任意 | 启动/运行排障第一步 |
| 内核参数 | `sysctl -a --pattern forward` | 任意 | 临时改 `sysctl -w`；持久化写 `/etc/sysctl.d/*.conf` 后 `sysctl --system` |

## 典型示例

先看整体负载与内存，判断压力来自 CPU、内存还是 IO 等待。

```bash
uptime
free -h
vmstat 1 5
top -b -n 1 | head -20
cat /proc/pressure/cpu /proc/pressure/memory /proc/pressure/io   # 需内核启用 PSI
```

IO 慢时先看设备级指标，再看是哪个进程在读写。

```bash
iostat -xz 1 5
sudo iotop -oPa
findmnt -T /var/log
```

网络与连通性：监听、连接内部指标、接口错误，再抓包或测路径。

```bash
ss -tuln
ss -tinp
ss -s
ip -s link show ens18
tcpdump -i any -nn -c 100 port 443
mtr -rwzbc 20 203.0.113.10
```

日志、内核、启动与内核参数：先确认服务状态，再回溯本次/上次启动。

```bash
dmesg -T -l err,warn
journalctl -b -p err --since "1 hour ago"
journalctl -b -1                          # 上次启动，需日志持久化
systemctl --failed
systemd-analyze blame | head
sysctl -a --pattern forward
# 起不来时在 GRUB 内核行追加 systemd.unit=rescue.target（或 emergency.target）
```

## 陷阱与版本差异

- **load average 高不等于 CPU 忙**：`vmstat` 的 `b` 列高、`wa` 高说明进程在等磁盘/IO，`r` 高才是 CPU 排队；先分清再动手扩容。
- **`free` 的 free 字段很小不是内存泄漏**：`used = total − available`，页缓存和可回收 slab 都算在里面；真正压力看 `available`、PSI 与 `si/so` 是否持续非零。
- **`vmstat`/`iostat` 的第一条报告是自开机以来均值**：只有后续采样行反映当前状态；`vmstat 1 5` 看第 2–5 行，`iostat -y` 直接跳过首条。
- **`iostat` 的 `%util` 对 SSD/RAID 不代表饱和**：手册明确说明串行设备接近 100% 才算饱和，并行设备要看 `await`、`aqu-sz` 与 `r/s`+`w/s` 组合判断。
- **`dmesg -T` 的时间戳在 suspend/resume 后可能失准**：手册说明时间源在恢复后未同步、仅对最近一次 resume 后的消息做校正；长期归档用 `journalctl`。
- **`journalctl` 没有持久化就没有历史**：若 `/var/log/journal` 不存在，日志只在内存，重启后 `journalctl -b -1` 无数据；需要留档时配置 journald 持久化（以 `journald.conf(5)` 官方文档为准）。
- **抓包/路径测试的统计要会读**：`tcpdump` 结束统计中的 dropped by kernel 表示内核缓冲不足丢包，需加 `-B` 或减少 `-s`/`-c`；`mtr` 的 ICMP 丢包可能被路由器降优先级放大，末端节点丢包才更可信，可用 `-T` 换 TCP 模式复核。

## 高危操作 ⚠️

- ⚠️ `echo 3 > /proc/sys/vm/drop_caches`：清空页缓存，看似"释放内存"却立刻引发 IO 抖动和性能下降，不是内存不足的解决办法；生产环境不要执行，内存问题按 PSI/si-so 定位后处理。
- ⚠️ `kill -9 <pid>`：SIGKILL 不给进程清理机会，数据库、日志和文件写入可能损坏；先 `kill <pid>`（SIGTERM）等待退出，确认卡死再强制，并记录进程用途。
- ⚠️ 运行中改 `sysctl -w`（如 `net.ipv4.ip_forward`、`vm.swappiness`）：立即影响全局网络/内存策略，已建立的转发与连接可能中断；先写 `/etc/sysctl.d/*.conf` 留档，维护窗口执行并准备好回退值。
- ⚠️ 生产机长时间 `tcpdump` 或 `mtr -r` 高频探测：抓包占 CPU/磁盘并可能暴露业务流量，`-w` 文件写满分区会拖垮服务；限制 `-c`/`-s`、抓完即停，先确认目标目录空间。

## 参考来源

- [Command line cheat sheet — Ubuntu Server documentation](https://ubuntu.com/server/docs/reference/cli-cheatsheet/)
- [top(1) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man1/top.1.html)
- [vmstat(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/vmstat.8.html)
- [free(1) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man1/free.1.html)
- [ss(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/ss.8.html)
- [tcpdump(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/tcpdump.8.html)
- [iostat(1) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man1/iostat.1.html)
- [dmesg(1) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man1/dmesg.1.html)
- [mtr(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/mtr.8.html)
- [sysctl(8) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man8/sysctl.8.html)
- [journalctl(1) — Ubuntu 24.04 manpage](https://manpages.ubuntu.com/manpages/noble/man1/journalctl.1.html)
