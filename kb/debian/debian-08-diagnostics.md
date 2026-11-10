---
vendor: Debian
os: Debian 12 bookworm（procps 4.0.2、sysstat 12.6.1、iproute2 6.1.0、tcpdump 4.99.3）
topic: 排障与性能诊断（CPU/内存/IO/网络）
devices: Debian 12 服务器、云主机、虚机与物理机
keywords:
  - 排障
  - 性能
  - vmstat
  - iostat
  - ss
  - tcpdump
  - dmesg
  - journalctl
  - 负载
  - IO
sources:
  - https://manpages.debian.org/bookworm/procps/vmstat.8.en.html
  - https://manpages.debian.org/bookworm/sysstat/iostat.1.en.html
  - https://manpages.debian.org/bookworm/iproute2/ss.8.en.html
  - https://manpages.debian.org/bookworm/util-linux/dmesg.1.en.html
  - https://manpages.debian.org/bookworm/tcpdump/tcpdump.8.en.html
  - https://manpages.debian.org/bookworm/systemd/journalctl.1.en.html
verified: high
updated: 2026-11-11
---

# Debian 12 排障与性能诊断（CPU / 内存 / IO / 网络）

> 排障先分四层：负载与 CPU（vmstat）、内存与 swap（vmstat/free）、磁盘 IO（iostat）、网络与连接（ss/tcpdump），最后回到内核与 systemd 日志（dmesg/journalctl）。注意 vmstat/iostat 首份报告是"自启动以来平均"，不是当前值。

## 命令速查

| 功能 | 命令 | 说明 |
|---|---|---|
| 负载与运行时长 | `uptime` | 1/5/15 分钟平均负载，高于核数需排查 |
| 实时概览 | `vmstat -w 1 5` | 每秒采样 5 次，宽屏输出 |
| 进程与 IO 阻塞 | `vmstat -w 1` | r（可运行）/ b（IO 阻塞）是关键列 |
| 内存与事件计数 | `vmstat -s` | 内存统计 + 事件计数器，单次输出 |
| 磁盘统计 | `vmstat -d` | 块设备读写量/合并/耗时 |
| 单分区统计 | `vmstat -p sda1` | 指定分区的读写与写请求 |
| CPU 使用率 | `iostat -c 2 3` | %user/%system/%iowait/%idle |
| 设备 IO 扩展 | `iostat -x 2 3` | await、%util、aqu-sz 判断压力 |
| 指定设备 IO | `iostat -d -k 2 sda` | 只看 sda，kB/s 单位 |
| 套接字概览 | `ss -s` | 各协议 socket 数量与内存汇总 |
| TCP 监听端口 | `ss -tlnp` | 监听地址/端口/进程（需权限看进程） |
| 按状态筛选 | `ss -tan state established` | 配合 `-o` 看重传/定时器 |
| 按端口/地址过滤 | `ss -tn 'sport = :22'` | 表达式支持 sport/dport/dev |
| 内核日志 | `dmesg -T --level=err,warn` | 人类可读时间戳 + 级别过滤 |
| 跟踪新内核日志 | `dmesg -w` | 持续输出（需可读的 /dev/kmsg） |
| 抓包到文件 | `tcpdump -ni eth0 -c 1000 -w /tmp/cap.pcap` | -n 不解析名字，-c 限量 |
| 离线读包 | `tcpdump -nr /tmp/cap.pcap` | 先落盘再分析，避免线上长抓 |
| systemd 日志 | `journalctl -u ssh --since today` | 按单元/时间过滤，`-b -1` 看上次启动 |

## 典型示例

先分清 CPU、内存、IO 三类压力：

```text
uptime                    # 负载趋势（1/5/15 分钟）
vmstat -w 1 5             # r/b、si/so、us/sy/wa、bi/bo
iostat -x 2 3            # 每设备 await、%util、aqu-sz
free -h                   # 内存与 swap（procps free(1)，以官方文档为准）

# 判读要点：
# r 高、us/sy 高      → CPU 排队，找 top/pidstat 热点进程
# b 高、wa 高、await 高 → 磁盘 IO 瓶颈，定位慢盘与队列
# si/so 持续非零        → 内存不足在换页，先查内存泄漏或加内存
```

网络连接与抓包：

```bash
ss -s                                   # 连接总数概览
ss -tlnp                                # 本机监听端口与对应进程
ss -tan state established | head -50    # 已建立连接
ss -tn -o 'sport = :22'                 # 指定源端口的连接 + 定时器
sudo tcpdump -ni any -c 100 'port 443'  # 抓 100 个包，不解析名字
sudo tcpdump -ni eth0 -c 1000 -w /tmp/eth0.pcap
sudo tcpdump -nr /tmp/eth0.pcap 'tcp[tcpflags] & tcp-syn != 0'
```

日志定位（内核环缓冲 + systemd-journald）：

```bash
dmesg -T --level=err,warn | tail -50
dmesg -w                                 # 复现故障时实时观察
journalctl -xe --no-pager                # 最近错误与解释
journalctl -b -1 -p err --no-pager       # 上一次启动的错误
journalctl -u ssh --since '1 hour ago'   # 指定单元与时间窗
```

## 陷阱与版本差异

- **vmstat/iostat 首份报告是自启动以来平均**：不给 delay/count（如 `vmstat 1 5`）会误判当前负载；`iostat -y` 可跳过首份历史报告。
- **负载高不等于 CPU 忙**：`r` 高是 CPU 排队，`b` 高是进程等 IO，`wa` 高是磁盘慢；`si/so` 持续非零说明在换页，应优先查内存。
- **%util 与 await 要结合看**：%util 接近 100% 对串行设备表示饱和，但 RAID/SSD 并行设备该值不直接代表性能极限；单请求时延看 await。
- **ss 默认不显示监听套接字**：不带 `-l`/`-a` 时只列已建立连接；排查"端口在监听但连不上"必须 `ss -tlnp`，并确认监听地址是 0.0.0.0 而非 127.0.0.1。
- **dmesg 时间戳可能不准**：`-T` 基于 boottime/monotonic 换算，系统 suspend/resume 后可能偏差；读取还受 `kernel.dmesg_restrict` 权限限制，默认读 `/dev/kmsg`（kernel ≥ 3.5），`-S` 可强制走 syslog(2)。
- **tcpdump 过滤表达式要加单引号**：`&`、`|`、`>` 会被 shell 解释，必须 `'tcp[13] & 2 == 2'` 形式；抓包需 root 或 CAP_NET_RAW，`-Z` 默认降低权限。
- **journald 不一定持久化**：`Storage=auto` 时只有 `/var/log/journal` 存在才落盘，否则重启只保留当前 boot；`--vacuum-*` 只清归档日志（详见 debian-04-services.md）。
- **按层排查别跳步**：先 `dmesg` 看 OOM/硬件/驱动报错，再 vmstat/iostat 定位资源，最后 tcpdump 抓包；不要一上来就在生产长跑抓包。

## 高危操作 ⚠️

- ⚠️ 长时间全量 `tcpdump -w` 抓包：可能写满 `/tmp`/`/var` 分区、内核缓冲不足导致丢包，且 pcap 含明文凭据；必须限量（`-c`、`-s`）、输出到独立分区、抓完及时删除并限定权限，生产环境优先短时窗口。
- ⚠️ `dmesg -C` 或 `dmesg -c` 清空内核环形缓冲区：会丢失故障现场证据；先 `dmesg -T > /root/dmesg-$(date +%F).log` 保存再清，维护窗口执行。
- ⚠️ `echo 3 > /proc/sys/vm/drop_caches` 清页缓存：造成瞬时 IO 抖动、缓存优势消失且不可恢复，生产高峰禁止；仅测试或明确诊断场景使用。
- ⚠️ `kill -9` 数据库/集群进程：可能丢未提交事务、触发主从切换或脑裂；先用 SIGTERM 正常停止，确认无活动事务后再强杀，并提前备份。

## 参考来源

1. [vmstat(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/procps/vmstat.8.en.html)
2. [iostat(1) — Debian bookworm manpages](https://manpages.debian.org/bookworm/sysstat/iostat.1.en.html)
3. [ss(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/iproute2/ss.8.en.html)
4. [dmesg(1) — Debian bookworm manpages](https://manpages.debian.org/bookworm/util-linux/dmesg.1.en.html)
5. [tcpdump(8) — Debian bookworm manpages](https://manpages.debian.org/bookworm/tcpdump/tcpdump.8.en.html)
6. [journalctl(1) — Debian bookworm manpages](https://manpages.debian.org/bookworm/systemd/journalctl.1.en.html)
