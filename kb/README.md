# 网络工程师知识库（随 @kinggkl/dsh-network-engineer 插件分发）

供「网络工程师助手」Agent 及各类 RAG 平台使用的**十七平台**命令与运维知识库。
资料来源为各厂商/项目官方手册与高可信社区页面（每篇文档末尾附来源链接）：首批 4 厂商整理于 2026-10-15，
Cisco IOS/IOS-XE、Cisco NX-OS、Juniper Junos、Arista EOS、Fortinet FortiOS、中兴 ZXR10 于 2026-10-30 补全，
VyOS 与 MikroTik RouterOS 于 2026-10-31 补全；Proxmox VE 宿主于 2026-11-11 补 2 篇，v0.1.5 扩至 8 篇，
并新增 Ubuntu 24.04、Debian 12、CentOS Stream 9 / Rocky 9 各 8 篇与 RosZ MCP 平台 2 篇，合计 **17 平台 / 130 篇**；
2026-11-04（v0.1.2）起华为 8 篇均含「平台差异（交换机 vs 路由器）」节，区分 S/CE 交换机与 AR/NE 路由器。

## 目录结构

```
kb/
├── huawei/     华为（VRP）
├── h3c/        新华三（Comware V5/V7）
├── ruijie/     锐捷（RGOS，Cisco 风格）
├── dptech/     迪普（DPtech 自有 CLI，verified: medium）
├── cisco-ios/  思科（IOS / IOS-XE）
├── cisco-nxos/ 思科（NX-OS）
├── juniper/    瞻博（Junos）
├── arista/     Arista（EOS）
├── fortinet/   飞塔（FortiOS，防火墙）
├── zte/        中兴（ZXR10 ROSNG / ZROS，verified: medium）
├── vyos/       VyOS（1.4 LTS / 1.5 rolling，Debian + FRR）
├── mikrotik/   MikroTik（RouterOS v7）
├── ubuntu/     Ubuntu 24.04 LTS（noble）
├── debian/     Debian 12 bookworm（对照 13 trixie）
├── centos/     CentOS Stream 9 / Rocky Linux 9（同源 dnf 生态）
├── proxmox/    Proxmox VE 8/9 宿主（8 篇）
├── rosz/       RosZ MCP 平台（2 篇，平台侧只读查询）
└── README.md
```

| 目录 | 平台 | OS / 版本 | 篇数 | `verified` | 说明 |
|---|---|---|---|---|---|
| `huawei/` | 华为 | VRP | 8 | high | S/CE 系列交换机、AR/NE 路由器（平台差异见下方矩阵） |
| `h3c/` | 新华三 | Comware V5/V7 | 8 | high | S/CR 系列 |
| `ruijie/` | 锐捷 | RGOS | 8 | high | RG-S 系列，CLI 近似 Cisco |
| `dptech/` | 迪普 | 自有 CLI | 8 | medium | 公开资料有限，关键配置须以官方手册为准 |
| `cisco-ios/` | 思科 | IOS / IOS-XE | 8 | 7 high + 1 medium | Catalyst 9200/9300、ISR、ASR；`cisco-ios-03` 为 medium |
| `cisco-nxos/` | 思科 | NX-OS | 8 | high | Nexus 3000/5000/7000/9000，注意 `feature` 前置 |
| `juniper/` | 瞻博 | Junos | 8 | high | EX/MX/SRX，候选配置 + `commit` 模型 |
| `arista/` | Arista | EOS | 8 | high | vEOS、DCS 系列，需显式保存与 `ip routing` |
| `fortinet/` | 飞塔 | FortiOS | 8 | high | FortiGate 防火墙视角，策略隐含拒绝 |
| `zte/` | 中兴 | ZXR10 ROSNG / ZROS | 8 | medium | 官方手册获取受限处已逐条标注 |
| `vyos/` | VyOS | 1.4 LTS / 1.5 rolling | 8 | high | configure/set/commit/save 模型；FRR 承载路由 |
| `mikrotik/` | MikroTik | RouterOS v7 | 8 | high | 菜单/路径式 CLI；v6/v7 命令树差异已标注 |
| `ubuntu/` | Ubuntu | 24.04 LTS（noble） | 8 | high | 系统与包管理、netplan、LVM、systemd、ufw、容器、排障 |
| `debian/` | Debian | 12 bookworm | 8 | high | apt、interfaces/NetworkManager、nftables、systemd、LVM、排障 |
| `centos/` | CentOS Stream / Rocky | Stream 9 / Rocky 9 | 8 | high | dnf、NetworkManager、firewalld、SELinux、Podman、排障 |
| `proxmox/` | Proxmox VE | 8.x / 9.x | 8 | high | 01 系统升级、02 备份恢复、03 集群、04 存储、05 VM、06 LXC、07 宿主网络、08 HA 与排障 |
| `rosz/` | RosZ MCP 平台 | 平台侧只读接口 | 2 | high | 01 平台与只读 MCP 接入、02 只读运维与排障；设备命令仍查 `mikrotik/` |

## 主题编号

### 网络设备（12 家厂商 × 8 篇）

| 编号 | 文件后缀 | 主题 |
|---|---|---|
| 01 | -system | 系统管理与视图（视图切换、保存/回滚、AAA、NTP） |
| 02 | -vlan-l2 | VLAN 与二层（Access/Trunk/Hybrid、Bridge、MAC 表、STP） |
| 03 | -interface | 接口配置（IP、速率双工、VLANIF/SVI/VLAN 子接口） |
| 04 | -link-aggregation | 链路聚合（手工/LACP/Bonding） |
| 05 | -static-route | 静态路由（默认路由、浮动静态、黑洞、distance/preference） |
| 06 | -ospf | OSPF |
| 07 | -acl | ACL / 防火墙规则（与 NAT，视厂商） |
| 08 | -remote-diagnostics | 远程管理与诊断（Telnet/SSH、show/display/tool 排障） |

### Linux 服务器（Ubuntu / Debian / CentOS 各 8 篇）

| 编号 | 文件后缀 | 主题 |
|---|---|---|
| 01 | -system | 系统与包管理（发行版/仓库、apt 与 dnf、升级与回滚） |
| 02 | -network | 网络配置（netplan、NetworkManager、interfaces、路由、DNS、bond/VLAN） |
| 03 | -storage | 磁盘与 LVM（分区、LVM、ext4/xfs、扩容、fstab） |
| 04 | -services | systemd 服务（unit、日志 journald、定时器、启动排障） |
| 05 | -users-ssh | 用户与 SSH（用户/组、sudoers、SSH 加固、密钥） |
| 06 | -firewall | 防火墙（ufw、nftables、firewalld、端口放行与排错） |
| 07 | -containers | 容器与虚拟化（Docker、Podman、LXD/KVM 要点） |
| 08 | -diagnostics | 排障诊断（负载、内存、IO、网络、dmesg/journalctl） |

### Proxmox VE（8 篇）

| 编号 | 文件后缀 | 主题 |
|---|---|---|
| 01 | -system | 系统升级与版本管理（`pve8to9` 预检、Debian 12→13、网卡改名、回退） |
| 02 | -backup | 备份恢复与存储（`vzdump`、恢复演练、`/etc/pve` 备份） |
| 03 | -cluster | 集群与节点（`pvecm`、quorum、节点加入/隔离） |
| 04 | -storage | 存储管理（`pvesm`、content 类型、LVM-thin/ZFS/Ceph） |
| 05 | -vm | 虚拟机 QM（创建、迁移、快照、cloud-init） |
| 06 | -lxc | LXC 容器（模板、unprivileged、`pct` 生命周期） |
| 07 | -network | 宿主网络（`vmbr`、bond、VLAN-aware、SDN） |
| 08 | -ha-diagnostics | 高可用与排障（HA/CRM/LRM、锁、日志定位） |

### RosZ MCP 平台（2 篇）

| 编号 | 文件后缀 | 主题 |
|---|---|---|
| 01 | -platform | RosZ 平台与 MCP 接入（只读密钥、工具清单、权限档） |
| 02 | -diagnostics | 只读运维与排障（设备/指标/备份/组网/日志查询流程） |

完整文件名格式：`<平台>-<两位序号>-<主题>.md`，如 `kb/huawei/huawei-06-ospf.md`、
`kb/ubuntu/ubuntu-02-network.md`、`kb/proxmox/proxmox-08-ha-diagnostics.md`、`kb/rosz/rosz-02-diagnostics.md`。

## 华为平台差异速查（S/CE 交换机 vs AR/NE 路由器）

华为 S/CE 交换机与 AR/NE 路由器同属 VRP，但二层能力、接口模型与特性集不同；以下矩阵摘自主题文档的「平台差异」节，命令细节以对应篇目与官方产品文档为准。

| 主题 | S/CE 系列交换机 | AR/NE 路由器 | 关键差异 |
|---|---|---|---|
| 01 系统管理 | 经典 S V200R 即时生效；CE 数据中心系列与 CloudEngine S V600 支持两阶段/配置回退（缺省以文档为准）；支持 iStack/CSS 堆叠 | NE（VRP V8）两阶段、需 `commit`（可切立即生效）；经典 AR 即时生效；无堆叠概念 | 是否需 `commit` 取决于平台与版本；所有平台都要 `save` 持久化 |
| 02 VLAN 与二层 | 完整二层模型：`port link-type access/trunk/hybrid`、`port trunk allow-pass vlan`、STP、`display mac-address`；三层网关用 `Vlanif` | 常规路由口无 `port link-type`/`port default vlan` 等二层命令，VLAN 互联用三层子接口 `dot1q termination vid` + `arp broadcast enable`；带交换能力的 AR 款型（如 AR300/AR700）支持 VLAN/STP/MAC 表 | 交换机做二层交换，路由器做 802.1Q 终结；带交换能力款型另当别论，两套命令不能混用 |
| 03 接口 | 以太口默认二层，配 IP 前需 `undo portswitch` 切三层口，或建 `Vlanif` 作网关；接口命名随系列不同 | WAN/三层口默认三层，可直接 `ip address`；AR 交换口/支持 `portswitch` 的口默认二层，配 IP 前需 `undo portswitch`；支持子接口、PPP/PPPoE 等广域接口 | 「交换机口默认二层」基本成立，但路由器并非所有口都默认三层，AR 交换口同样要 `undo portswitch` |
| 04 链路聚合 | Eth-Trunk 以二层聚合为主（绑 VLAN）；跨设备冗余靠 iStack/CSS 或 M-LAG | Eth-Trunk 以三层聚合为主，但缺省二层，需先 `undo portswitch` 再配 IP（AR161/161W/169/161G-L 不支持该三层聚合示例）；跨设备冗余另行设计 | 堆叠/M-LAG 链路不是 Eth-Trunk，不要混配；路由器三层聚合别忘了 `undo portswitch` |
| 05 静态路由 | 仅三层型号支持；出接口/下一跳多用 `Vlanif`；部分型号支持 `ip route-static vpn-instance` | 主流 AR/NE 型号支持三层口/子接口静态路由；VPN 实例、PBR、路由策略能力更完整（IPv6 等能力随型号/版本，以产品文档为准） | 命令字面量一致，差异在三层出口与高级特性 |
| 06 OSPF | 必须先有 `Vlanif` 三层接口并在 `network` 中宣告；以基础 OSPF 为主 | 物理三层口/子接口或已切三层的 Eth-Trunk 即可参与；主流型号支持多进程/多区域及较完整高级特性（以产品文档为准） | 低端/纯二层型号可能不支持 OSPF，以产品文档为准 |
| 07 ACL | `traffic-filter` 挂物理口/Eth-Trunk（接口视图 `traffic-filter inbound acl 3000`）；CE 的 VLAN 视图为 `traffic-filter acl 3000 inbound`；Vlanif 是否支持以产品文档为准；一般不做 NAT | 除 `traffic-filter` 外，ACL 常被 NAT、PBR、路由策略引用 | 规则通用，差异在应用点（挂到哪里）与视图语法 |
| 08 远程与诊断 | SSH/Telnet/AAA 一致；诊断侧重二层：`display mac-address`、`display stp`、`display vlan` | SSH/Telnet/AAA 一致；诊断侧重路由：`display ip routing-table`、`display ospf peer`、`display bgp peer`；带交换能力的 AR 款型同样支持 `display mac-address`/`display stp`/`display vlan` | 命令可用性随型号/BUG 版本不同，以产品文档为准 |

> 两阶段配置（候选配置 + `commit`）是 VRP V8 平台特性（CE 交换机、NE VRP V8 路由器、CloudEngine S V600 新平台），经典 S V200R 盒式与经典 AR 为即时生效；NE 可切换为立即生效模式。无论哪种模式，`save` 才是写入下次启动配置的动作；具体缺省行为以对应平台产品文档为准。

## 跨厂商差异速查（选路数值，务必按厂商体系读）

| 厂商 | 静态路由缺省优先级 | OSPF 缺省优先级 | 备注 |
|---|---|---|---|
| 华为 VRP | preference 60 | preference 10 | 数值越小越优；OSPF 胜 |
| 新华三 Comware | preference 60 | preference 10 | 数值越小越优；OSPF 胜 |
| 锐捷 RGOS | AD 1 | AD 110 | Cisco AD 体系；静态胜 |
| 思科 IOS/IOS-XE、NX-OS | AD 1 | AD 110 | Cisco AD 体系；静态胜 |
| Arista EOS | AD 1 | AD 110 | 同 Cisco 体系；静态胜 |
| Juniper Junos | preference 5 | preference 10（外部 150） | 数值越小越优 |
| 飞塔 FortiOS | distance 10 | distance 110 | 直连 0、静态 10；`distance 255` 为无效路由不进 FIB |
| VyOS（FRR） | distance 1 | distance 110 | 直连 0、静态 1；`distance 255` 等效禁用 |
| MikroTik RouterOS | distance 1 | distance 110 | 直连 0、静态 1；结果可用 `/routing route` 核对 |
| 迪普 / 中兴 | 以各篇 05 文档为准 | 同左 | 资料受限，配置前核对官方手册 |

> 华为/新华三的 preference 与 Cisco 系 AD 是两套数值体系，不能直接比大小；跨厂商迁移时先换算再讨论“谁更优”。

## Linux 三系差异速查

| 项目 | Ubuntu 24.04 LTS | Debian 12 bookworm | CentOS Stream 9 / Rocky 9 |
|---|---|---|---|
| 包管理 | `apt`（main/universe/restricted 组件） | `apt`（main/contrib/non-free） | `dnf`（+ EPEL、CRB） |
| 网络后端 | netplan YAML → systemd-networkd 或 NetworkManager | `/etc/network/interfaces` 或 NetworkManager | NetworkManager（`nmcli`） |
| 防火墙 | `ufw`（前端），底层 nftables | `nftables`/`iptables`（无强制前端） | `firewalld`（zone 模型） |
| 安全模块 | AppArmor | AppArmor | SELinux（默认 enforcing） |
| 服务管理 | systemd + journald | systemd + journald | systemd + journald |
| 容器/虚拟化 | Docker、Podman、LXD、KVM | Docker、Podman、KVM | Podman（首选）、Docker、KVM |
| 典型陷阱 | netplan 缩进/YAML 空格、云镜像 `50-cloud-init.yaml` 覆盖；改网络前先确认 SSH 链路 | 手改 `interfaces` 与 NetworkManager 并存冲突；`/etc/resolv.conf` 被覆写 | `firewalld` zone/`--add-port` 与 SELinux 布尔值；`nmcli` 连接配置与 `ifcfg` 并存 |

## Proxmox VE 与 Debian 宿主对照

- 底座：PVE 8.x = Debian 12 bookworm，PVE 9.x = Debian 13 trixie；升级前先 `pve8to9 --full` 预检。
- 集群配置：`/etc/pve` 是 pmxcfs 集群文件系统，节点间共享；不要当成普通目录手改。
- 工具分工：`qm` 管 VM、`pct` 管 LXC、`pvesm` 管存储、`pvecm` 管集群、`vzdump`/PBS 管备份。
- 网络：`vmbr` 网桥、bond、VLAN-aware bridge、SDN；改宿主网络可能导致管理面/迁移网络失联。
- 备份：`vzdump`（快照/暂停/停止模式）、备份作业、Proxmox Backup Server；恢复演练优于“有备份文件”。
- 排障：`pvecm status`、`pvesm status`、`qm status`、`pct status`、`journalctl -u pve*`、`/var/log/pveproxy`。

## RosZ MCP 平台要点（只读）

| 场景 | 要点 |
|---|---|
| 密钥与权限 | 当前为只读密钥：28 个只读工具可用，7 个写工具（下发命令、节点脚本、IP 规则、踢线、备份等）被 blocked；需读写要在控制台改权限档 |
| 列表结果 | `total` 是本次返回条数，`matched` 才是命中总数；被截断时调大 `limit` 或缩小关键词 |
| 离线设备 | `online=false` 时展示的是最后一次上报快照，`last_post` 是快照时间，不能当实时值 |
| 指标曲线 | `get_device_metrics` 已降采样（最多约 120 点），判断峰值看 `max`；磁盘占用无历史曲线 |
| 流量分析 | `get_netflow_stats` 只保留最近一轮采样快照（无历史、无时间范围参数）；未启用采样时为空不代表无流量 |
| 日志/NAT | `search_device_log`、`search_nat_log` 必须给时间窗口（`hours` ≤168）；日志 `keyword` 少于 3 字符会退化全表扫描；NAT 查询必须带 IP |
| 云指令 | `run_command` 结果只保留 24h 且服务端内存保存；`超时` ≠ 取消，设备下次心跳仍可能执行 |
| NodeZ 节点 | 节点脚本与设备云指令是两套东西，id 不通用；节点心跳 30s，执行记录持久化 |
| 智能组网 | 通道状态 5s 上报，180s 未更新强制判「断开」；「未知」通常表示服务刚重启还没收到上报 |
| 账号/计费 | RADIUS 账号列表不返回密码；在线会话查询建议按 `account`/`device_id` 缩小范围 |
| 备份/配置 | `backups` 是 `.backup` 整机备份，`configs` 是 `.rsc` 文本配置；`get_config_diff` 显示 `+`/`-` 行，敏感值已遮蔽 |
| 安全 | 不把 Bearer token、账号口令、设备敏感信息写进命令/回答/日志；设备侧配置命令仍查 `kb/mikrotik/` |

## 文档格式

每篇文档含 YAML frontmatter，供 RAG 检索与元数据过滤：

| 字段 | 说明 |
|---|---|
| `vendor` / `os` | 厂商/平台与操作系统，检索时可做过滤条件 |
| `topic` / `devices` | 主题与适用设备/平台 |
| `keywords` | 检索关键词（中文为主，含易混词） |
| `sources` | 整理时实际抓取/核对的参考来源 URL |
| `verified` | `high` = 有官方手册来源佐证；`medium` = 公开资料有限，仅作方向参考（dptech/ 全部、zte/ 全部、cisco-ios-03） |
| `updated` | 最后整理日期 |

正文结构：命令速查表（功能/命令/视图/说明）→ 典型示例 → 陷阱与版本差异 → 高危操作 ⚠️ → 参考来源。

## 平台语义差异（摘要，细节见各篇「陷阱与版本差异」）

- **Cisco IOS-XE vs NX-OS**：NX-OS 所有特性需先 `feature ...`；OSPF 用接口级 `ip router ospf 1 area 0`（无 `network ... area`）。
- **Junos**：候选配置 + `commit`；远程改动先 `commit confirmed N`；ACL 是无状态 `family inet filter`。
- **Arista EOS**：不会自动保存（必须 `copy running-config startup-config`）；三层转发需全局 `ip routing`；默认 MSTP。
- **FortiGate**：策略默认隐含拒绝；接口管理访问 `set allowaccess` 是覆盖式（追加用 `append`）。
- **中兴 ZXR10**：Cisco 风格但有差异：`gei_1/1` 命名、`switchport trunk vlan`、LAG 用 `smartgroup`、ACL 两套语法。
- **VyOS**：`configure` → `set/delete`（候选配置）→ `commit`（生效）→ `save`（落盘，不 save 重启即丢）；
  VLAN 用 `vif`/`vif-s`/`vif-c`；防火墙 1.4+ 为 `set firewall ipv4 name/forward filter`（1.3 旧语法不同）。
- **MikroTik RouterOS**：菜单/路径式命令；v7 的 OSPF 走 `/routing ospf instance` + `area` + `interface-template`
  （v6 的 `/routing ospf network` 已不存在）；路由结果汇总在 `/routing route`。
- **Linux 三系**：Ubuntu 用 netplan + ufw + apt；Debian 用 interfaces/NetworkManager + nftables + apt；
  CentOS Stream 9 / Rocky 9 用 NetworkManager + firewalld + dnf + SELinux（enforcing）；三系命令不要互换。
- **Proxmox VE**：宿主是 Debian；集群配置在 `/etc/pve`（pmxcfs）；VM/LXC 用 `qm`/`pct`；网络用 `vmbr`/bond/
  VLAN-aware；备份用 `vzdump`/PBS；升级走 `pve8to9` 预检，改动前先备份 guest 与 `/etc/pve`。
- **RosZ 平台**：MCP 是平台侧只读查询接口，与设备侧配置命令是两层；注意 `total` vs `matched`、离线快照、
  指标降采样、日志/NAT 时间窗口、云指令 24h 保留与超时语义；不泄露任何凭据。

## 导入 RAG 平台

- **通用**：直接导入 Markdown；建议按标题（`##`）分块，chunk 长度 500–1000 字，保留来源链接与 frontmatter 元数据。
- **Dify**：知识库 → 导入 Markdown，分段标识符选 `##`，检索时可用 metadata 过滤 `vendor`。
- **Coze / 扣子**：知识库 → 上传文档（.md）；表格内容建议保留原表格，检索命中率更好。
- **RAGFlow**：支持 Markdown 解析，开启表格解析与标题分块。
- **无文件检索能力的平台**：将本目录整体上传为知识附件，或在系统提示词中声明"优先引用知识库文档内容"。

## 检索与使用建议

1. Agent 回答前先按「平台 + 主题」定位文件，再按关键词跨文件检索。
2. 跨平台对照类问题，同时召回 2–4 篇同名主题文档（如 `huawei-05`/`ruijie-05`/`cisco-ios-05`/`juniper-05`/`vyos-05`；
   Linux 三系的 02/06 篇；PVE 与 Debian 的对应主题）。
3. `verified: medium` 的文档（dptech/ 全部、zte/ 全部、cisco-ios-03）仅作参考方向，关键配置务必引导用户以官方手册为准。
4. 同一厂商存在多 CLI 体系时先确认平台：Cisco IOS-XE 与 NX-OS、Juniper EX（交换）与 MX/SRX（路由/安全）、
   VyOS 1.3 与 1.4+（firewall 语法分水岭）、RouterOS v6 与 v7（路由菜单重构）、Ubuntu/Debian/CentOS 三系、
   PVE 8.x 与 9.x（Debian 底座与网卡命名）差异都写在对应篇目的「陷阱与版本差异」里。
5. 设备只开放 WinBox（TCP 8291）时用插件原生工具 `mt_winbox_exec` 只读取证；平台侧查询用 RosZ MCP 只读工具，
   两者都禁止把凭据写进命令/日志/回答。

## 校验与维护

- 结构校验：`plugins/dsh-network-engineer/tools/kb-validate.sh`（17 平台 / 130 篇：frontmatter、固定五节、
  速查表行数与列数、高危 ⚠️ 条目、来源链接、篇幅、主题齐全性）。
- 插件测试：`cd plugins/dsh-network-engineer && npm test`（含知识库结构、跨平台一致性、预设组合、打包清单）。
- 新增主题：按 `<平台>-<两位序号>-<主题>.md` 命名并在本 README 补充索引；修订文档后更新 `updated` 字段。
- 新增平台：先建目录骨架与主题文件，再补 frontmatter 与来源链接，最后在本 README 的平台表里登记，
  并同步校验器 `EXPECTED_VENDORS`、测试 `VENDORS`/`VENDOR_TOPICS`、`SKILL.md` 与 persona。

## 已知限制

- 迪普、中兴公开资料有限：dptech/、zte/ 各篇不确定处均标注「以官方手册/售后确认」，`verified` 恒为 medium。
- 各厂商不同型号/版本存在命令差异（如 NX-OS 的 `feature` 集合、Junos EX 与 MX 的二层语法、FortiOS 6.x/7.x、
  VyOS 1.3/1.4、RouterOS v6/v7），文档已标注主要差异点，但无法覆盖全部型号。
- Linux 三系以 Ubuntu 24.04、Debian 12、CentOS Stream 9 / Rocky 9 为基线；更老/更新版本（22.04、Debian 13、
  Rocky 10 等）的差异以各项目官方文档为准。
- Proxmox VE 内容按 8.x/9.x 官方文档整理；集群/存储/HA 的实际行为受硬件与网络环境影响，变更前仍需备份与演练。
- RosZ 2 篇按 MCP 服务器（只读密钥）语义整理；平台接口、权限档与返回字段以 RosZ 控制台/官方说明为准。
