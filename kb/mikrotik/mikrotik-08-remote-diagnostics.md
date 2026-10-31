---
vendor: MikroTik
os: RouterOS v7（v6 差异在文中标注）
topic: 远程管理与诊断
devices: CCR/CRS/RB 系列、CHR（RouterOS v7 全平台）
keywords: [ip service, ssh, winbox, 安全加固, tool ping, traceroute, torch, sniffer, log print, resource print]
sources:
  - https://help.mikrotik.com/docs/spaces/ROS/pages/103841820/Services
  - https://help.mikrotik.com/docs/spaces/ROS/pages/8323183/Ping
  - https://help.mikrotik.com/docs/spaces/ROS/pages/8323088/Packet+Sniffer
  - https://help.mikrotik.com/docs/spaces/ROS/pages/130220138/Traceroute
verified: high
updated: 2026-10-31
---

# MikroTik · 远程管理与诊断

> 管理面在 `/ip service`（ssh/winbox/telnet/www/api...）与 `/user`、`/ip ssh` 下加固；诊断面在 `/tool`（ping/traceroute/torch/sniffer）与 `/log`、`/system resource`、`/interface print stats`。RouterOS 的 `/ip service` 只改已有服务，且 `address=` 只在应用层限制。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 列出服务 | `/ip service print` | `[admin@MikroTik] >` | 看 port/address/certificate 列 |
| 关闭明文服务 | `/ip service disable telnet,ftp,www,api` | `[admin@MikroTik] >` | 只留 ssh/winbox，按需才开 |
| 改 SSH 端口 | `/ip service set ssh port=2200` | `[admin@MikroTik] >` | 降低自动化暴力破解 |
| 限制服务来源 | `/ip service set winbox address=192.168.88.0/24` | `[admin@MikroTik] >` | 应用层拒绝，非网络层丢包 |
| SSH 强加密 | `/ip ssh set strong-crypto=yes` | `[admin@MikroTik] >` | 官方安全加固建议 |
| 限制用户来源 | `/user set 0 address=10.0.0.0/24` | `[admin@MikroTik] >` | 限制 admin 可登录网段 |
| 关闭 MAC 访问 | `/tool mac-server set allowed-interface-list=none` | `[admin@MikroTik] >` | 另需关 mac-winbox 与 mac-ping |
| 关闭邻居发现 | `/ip neighbor discovery-settings set discover-interface-list=none` | `[admin@MikroTik] >` | 生产网建议关闭 |
| ping | `/tool ping 10.0.0.1 count=5 interval=200ms` | `[admin@MikroTik] >` | 也可简写 `/ping 10.0.0.1` |
| MAC ping | `/ping 00:0C:42:72:A1:B0%ether1` | `[admin@MikroTik] >` | 需先 `/tool mac-server ping set enabled=yes` |
| traceroute | `/tool traceroute 10.255.255.1` | `[admin@MikroTik] >` | 按 TTL 逐跳显示路径 |
| torch 实时流量 | `/tool torch interface=ether1` | `[admin@MikroTik] >` | 按源/目的/端口分类，显示过滤前流量（interface= 参数以设备 F1 帮助为准） |
| 抓包开始 | `/tool sniffer start interface=ether1` | `[admin@MikroTik] >` | 抓到内存或 streaming 服务器 |
| 抓包停止 | `/tool sniffer stop` | `[admin@MikroTik] >` | 停止后内存数据保留 10 分钟 |
| 保存抓包 | `/tool sniffer save file-name=/flash/test.pcap` | `[admin@MikroTik] >` | 下载后用 Wireshark 分析 |
| 快速抓包 | `/tool sniffer quick ip-protocol=icmp` | `[admin@MikroTik] >` | 命令行即时显示，不落盘 |
| 查看日志 | `/log print` | `[admin@MikroTik] /log>` | `follow where topics~".info"` 实时跟踪 |
| 系统资源 | `/system resource print` | `[admin@MikroTik] >` | 版本、uptime、内存、cpu-load |
| 接口计数 | `/interface print stats` | `[admin@MikroTik] >` | 含 tx-queue-drop，快速判断丢包 |
| 接口详细计数 | `/interface print stats-detail` | `[admin@MikroTik] >` | fp-* 为 fast path 计数 |
| 实时速率 | `/interface monitor-traffic [find]` | `[admin@MikroTik] >` | 每接口 rx/tx 实时速率 |

## 典型示例

```text
[admin@MikroTik] > /ip service print                              // 先看暴露了哪些服务
[admin@MikroTik] > /ip service disable telnet,ftp,www,api         // 关掉明文/不用的服务
[admin@MikroTik] > /ip service set ssh port=2200
[admin@MikroTik] > /ip service set winbox address=192.168.88.0/24
[admin@MikroTik] > /ip ssh set strong-crypto=yes
[admin@MikroTik] > /user set 0 address=10.0.0.0/24
[admin@MikroTik] > /tool mac-server set allowed-interface-list=none
[admin@MikroTik] > /tool ping 8.8.8.8 count=5 interval=200ms     // 先用 ping 确认连通
[admin@MikroTik] > /tool traceroute 8.8.8.8                      // 逐跳定位
[admin@MikroTik] > /tool torch interface=ether1                  // 实时看流量构成（按 q 退出）
[admin@MikroTik] > /tool sniffer start interface=ether1
[admin@MikroTik] > /tool sniffer stop
[admin@MikroTik] > /tool sniffer save file-name=/flash/test.pcap
[admin@MikroTik] > /log print follow where topics~".info"
[admin@MikroTik] > /system resource print
[admin@MikroTik] > /interface print stats
```

## 陷阱与版本差异

- **`/ip service address=` 不是网络层防护**：官方说明设置后**数据包不会在网络层被丢弃**，只是服务拒绝不匹配来源的连接；对外防护必须配合 `mikrotik-07-acl.md` 的防火墙规则。
- **关服务前先确认入口**：`/ip service disable ssh` 或改端口后，新的远程连接全部失败；当前已建立的会话可能保留到超时，但重连没门。远程操作先开 Safe Mode，并确认有带外/串口。
- **v7 不能新增服务**：官方说明 `/ip service` 只允许修改现有服务属性，不能 add 新服务；端口/证书/TLS 版本都在现有条目上改。
- **sniffer 有容量与时效限制**：内存缺省 100KiB、文件上限 1000KiB，抓到的包只在内存保留 10 分钟，需长期留存要 `file-name=` 或 `save`；硬件卸载桥/无线客户端间流量可能抓不到；v7.20 起保存为 PCAPNG 格式。
- **torch 看到的是过滤前流量**：被防火墙 drop 的包也能在 torch 中看到；硬件卸载桥的未知单播/广播/部分组播可见性有限。
- **ping 的域名解析归属**：CLI `/ping` 用路由器自身 DNS 解析，Winbox 的 Tools/Ping 用你电脑的 DNS；MAC ping 默认走所有活动接口，可用 `%ether1` 限定。
- **日志过滤按 topics**：`/log print follow where topics~".info"` 可实时跟踪；NTP 相关日志需 `/system logging add topics=ntp,debug` 后才更详细。

## 高危操作 ⚠️

- ⚠️ `/ip service disable ssh` 或改 SSH 端口会让新的远程管理全部失败；必须本地/带外操作，或先开 Safe Mode 并保留 winbox/另一入口。
- ⚠️ 关闭 MAC-Telnet/MAC-WinBox/邻居发现会让现场应急发现与 MAC 接入失效，之后只能串口恢复，生产网关闭前要记录维护通道。
- ⚠️ 长时间运行 `/tool sniffer`（尤其全接口 + 大 `memory-limit`）会占用内存/CPU 影响转发，生产排障要限定 `interface=` 与 `filter-*` 条件。
- ⚠️ 同时关闭 winbox/www 并让防火墙阻断管理网段后，只剩 Console/串口可恢复，变更前确认物理接入方式并做好配置备份。

## 参考来源

1. [Services · /ip service 属性、address 限制与默认端口（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/103841820/Services)
2. [Ping · /tool ping 参数与 MAC ping（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/8323183/Ping)
3. [Packet Sniffer · start/stop/save、quick 模式与容量限制（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/8323088/Packet+Sniffer)
4. [Traceroute · /tool traceroute 逐跳原理（help.mikrotik.com）](https://help.mikrotik.com/docs/spaces/ROS/pages/130220138/Traceroute)
