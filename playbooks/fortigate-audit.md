# FortiGate 巡检剧本 v1（配置合理性审计）

> 适用：FortiGate / FortiWiFi 单机或 HA（NAT 模式），FortiOS 7.2–7.6。
> 目的：把「换一台设备、换一个人」时容易漏看的东西固化成可重复的检查项，让每次审计的结论**可横向比较、可回归复检**。
> 配套：`playbooks/fortigate-audit.checks.json`（机器可读判据，回归测试用）、`tools/forti-trim.sh`（输出裁剪）、
> 知识库 `kb/fortinet/fortinet-01-system.md`、`-03-interface.md`、`-05-static-route.md`、`-07-acl.md`、`-08-remote-diagnostics.md`。

## 0. 使用前提（不可跳过）

1. **只读**：本剧本全部是 `show` / `show full-configuration` / `get`。任何 `config` 段都不进。
2. **先备份**：`execute backup config tftp|ftp|usb ...`，或至少 `show full-configuration` 原文落盘（见第 2 节）。
3. **串行登录**：FortiGate 只容忍 1 个并发未认证 SSH 会话，并行会被 `Connection reset by peer`；相邻命令间隔 ≥25s。
4. **原文先落盘再裁剪**：`logs/raw/fortinet/<host>-<ts>.txt`，AI 只读裁剪版；裁剪不可逆（`forti-trim` 红线 2）。
5. `diagnose ...` 需要非只读权限；只读门禁下拿不到的信息（UTM 订阅、会话明细）在报告里写「未核实」，不要推断。

## 1. 采集命令集（按批，一批一次登录跑完）

**批 A · 身份与版本**
```text
get system status
get system performance status
show system global
show full-configuration system admin
```

**批 B · 接口与管理面（红线 4 证据点所在）**
```text
show system interface
show full-configuration system interface
show system snmp community
show firewall local-in-policy
show system ntp
show system dns
show log setting
```

**批 C · 策略与对象（体量最大，先裁剪再看）**
```text
show firewall policy
show firewall address
show firewall vip
show firewall ssl-ssh-profile
show application list
```

**批 D · 选路与 SD-WAN**
```text
show router static
show system sdwan
get router info routing-table details 0.0.0.0
```

**批 E · 无线**
```text
show full-configuration wireless-controller vap
show wireless-controller setting
show wireless-controller wtp-profile
show user radius
show user group
show system dhcp server
```

## 2. 采集产物与裁剪

```bash
# 原文落盘 + 裁剪（报告走 stderr）
tools/forti-trim.sh --host <fw> --raw-archive logs/raw/fortinet < raw.txt > logs/audit/<fw>-audit.txt
```
裁剪只做三件事（删 `set uuid`/`snmp-index`/`color`、掩码 `ENC`/PEM、折叠 `system replacemsg`/`vpn certificate`/
`ips sensor`/`application list`），其余 fail-open。**四个证据点绝不删**：`allowaccess`、VAP `security`+`pmf`、
`router static distance`、策略 `action`+`utm-status`（删了会把"没配"误判成"安全"）。

## 3. 判据表

> 「判据」一列是**命中即问题**的条件；命令是对应采集项。ID 与 `checks.json` 一一对应，
> `manual: true` 的条目无法机械判定，必须人工看回显或查官方生命周期页。

### P0 · 安全边界（本周内）

| ID | 检查点 | 判据（命中即问题） | KB |
|---|---|---|---|
| F-01 | 日志是否可持久 | `get system status` 含 `Log hard disk: Not available` 且无 syslog/FAZ 配置 | `-01`、`-08` |
| F-02 | 管理员权限与来源 | 任一 `config system admin` 条目 `accprofile "super_admin"` 且无 `trusthost`；或账号数 > 人数 | `-01`、`-08` |
| F-03 | 管理面协议 | 任一 non-WAN 接口 `allowaccess` 含 `http`/`telnet`/`snmp`/`fabric`/`speed-test`；或终端网段接口含 `https`/`ssh` | `-03`、`-07` |
| F-04 | 第二道门 | `show firewall local-in-policy` 为空 | `-07` |
| F-05 | 公网暴露的明文管理/主机端口 | 任一 VIP 服务为 `ALL` 或 `22`/`23`/`3389` 且对应策略 `status enable` | `-07` |
| F-06 | SNMP 弱口令/不限源 | `snmp community` 名为 `public`/`private`，或 query host 未配 `ip` | `-01`、`-08` |

### P1 · 策略与无线设计

| ID | 检查点 | 判据（命中即问题） | KB |
|---|---|---|---|
| F-07 | 访客到内网 | `Guest`/隔离类策略的 `dstintf` 含内网接口（`lan`/`inside*`） | `-07` |
| F-08 | "深度检测"名不副实 | ssl-ssh-profile 的 `https` 为 `certificate-inspection` 或 `quic` 为 `bypass`，而策略自称 deep-inspection | `-07` |
| F-09 | 应用控制空转 | 策略引用 `application-list`，但该 list 无 `block` 条目 | `-07` |
| F-10 | UTM 库陈旧 | `get system status` 的 AV/IPS DB 日期落后当前 >180 天 | `-01`（manual） |
| F-11 | 内网互访开 NAT | 双方 `intf` 都是内网接口的策略带 `set nat enable` | `-07` |
| F-12 | 策略无日志/无名/残留 | `logtraffic disable` 且属关键路径；或 `status disable` 残留；或 `edit` 后无 `set name` | `-07` |
| F-13 | 无线⇄访客全通 | 办公 SSID 接口 → 访客接口 `all/all/ALL` 且无日志 | `-07` |
| F-14 | 服务器段全通 | 服务器段 ⇄ 办公段 `all/all/ALL`，无 UTM、无日志 | `-07` |
| F-15 | 无线加密与 PMF | VAP `pmf disable`；或仅 `wpa2-only-*`；或 `vlanid 0` 却按 VLAN 分隔业务 | `-08` |
| F-16 | 企业级 SSID 无 RADIUS | VAP 为 `wpa2-only-enterprise` 且 `config user radius` 为空 | `-08` |
| F-17 | 临时/迁移 SSID 未清理 | `MIG-*`/`TMP`/`TEST` 命名的 VAP 或接口仍 `status enable` | `-08` |
| F-18 | 无 WIDS/无访客限速 | `wtp-profile` 未挂 `wids-profile`；Guest 策略无 `traffic-shaper` | `-08` |
| F-19 | DNS 代理被关 | `dns-cache-limit 0` 或 `timeout 1`，而 DHCP 用 `dns-service local` | `-01` |
| F-20 | NTP 依赖 FortiGuard/无认证 | `set type fortiguard` 或 `authentication disable` | `-01` |

### P2 · 结构与技术债

| ID | 检查点 | 判据（命中即问题） | KB |
|---|---|---|---|
| F-21 | SD-WAN zone 取名与成员不符 | 装 WAN 成员的 zone 名为 `LocalNet`/`LAN`/`Internal` 之类；或作默认路由目的 zone 无成员 | `-05` |
| F-22 | 策略引用空 zone | `set dstintf` 含成员为 0 的 SD-WAN zone | `-07` |
| F-23 | 手工 /32 分流路由 | `router static` 中 /32 且 `distance 1` 的条目 >10 条 | `-05` |
| F-24 | 健康检查探测境外站点 | `system sdwan health-check` 的 server 为 google/gmail/office365 | `-05` |
| F-25 | fortilink/聚合口无成员 | `fortilink` aggregate 无 `member`，其下仍挂 VLAN 子接口 | `-03` |
| F-26 | switch-controller 开启但无受管设备 | `system global` 含 `switch-controller enable` 且无 managed-switch | `-01` |
| F-27 | 死对象残留 | VIP/地址对象无任何策略引用（尤其 `vpn ipsec`/`ssl` 未启用的历史对象） | `-07` |
| F-28 | 冗余 VIP 改写入径 | VIP extip = 设备自身接口 IP（DNAT 掉本机流量） | `-07` |
| F-29 | 策略 ID 乱序 | `edit` 的 ID 存在跳跃后被 `move` 打乱，或新策略插在通配策略之前 | `-07` |
| F-30 | 关硬件加速 | 策略含 `auto-asic-offload disable` | `-07` |
| F-31 | DHCP 保留地址落在池外 | `iprange` 与 `reserved-address` 不重叠 | `-03` |
| F-32 | 空置接口/未命名 | `internal*`/`aplink` 无引用；接口 `status down` 但 VAP 仍广播 | `-03` |
| F-33 | 固件版本 | `get system status` 版本不在厂商当前支持分支（查 Product Lifecycle，manual） | `-01`（manual） |

## 4. 输出模板

```markdown
# <站点> <型号> 配置合理性审计（<日期>）
> 设备/版本/序列号/管理面/采集方式（只读）/运行态摘要
**一句话结论**：<边界策略 + 安全能力的一句话定性>

## P0 高风险（本周内，可逐条回退）
| # | 问题 | 现状证据 | 风险 | 建议（含命令） |

## P1 中风险 …（同上）
## P2 技术债 …（同上）

## 与知识库的核对结果
| 审计点 | KB 结论 | 本机实际 | 判定 |

## 整改顺序（每步可单独上线/回退）
### 第 0 步 备份 → 第 1 步 … → 验证 → 回退

## 需要业务方确认的前提
```

证据列必须能对上裁剪版里的某一行或某个计数；对不上的写「未核实」。

## 5. 版本注意

- **7.4.6 / 7.6.1 起**：属于 SD-WAN zone 的接口，`local-in-policy` 的 `intf` 只能引用 zone 名，不能写物理接口（`-07`）。
- **7.6 起**：UTM profile 名称与 `application-list` 默认值有调整，判据以实机 `show` 为准，不按旧版记忆推断。
- `set allowaccess` 是**覆盖式**（`-03`）；整改时整条重写，并先在 Console 或另一接口留入口，避免自锁。

## 6. 维护方式

- 新增检查项：先在本文件加一行（含 KB 引用），再在 `checks.json` 加可机械判定的条目，最后在
  `test/forti-baseline.test.mjs` 的夹具里补证据行——**三者缺一不可**，否则该检查项无法回归。
- 本剧本 v1 由 2026-11-16 深圳 FortiWiFi-80F-2R 审计（33 条）提炼；实测基线见工作区
  `verify/fortigate-baseline-SZ-20261116.md`。
