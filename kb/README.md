# 网络工程师知识库（随 @kinggkl/dsh-network-engineer 插件分发）

供「网络工程师助手」Agent 及各类 RAG 平台使用的**十二厂商**交换机/路由器/防火墙命令知识库。
资料来源为各厂商官方手册与高可信社区页面（每篇文档末尾附来源链接）：首批 4 厂商整理于 2026-10-15，
Cisco IOS/IOS-XE、Cisco NX-OS、Juniper Junos、Arista EOS、Fortinet FortiOS、中兴 ZXR10 于 2026-10-30 补全，
VyOS 与 MikroTik RouterOS 于 2026-10-31 补全，合计 **12 厂商 / 96 篇**。

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
└── README.md
```

| 目录 | 厂商 | OS | 篇数 | `verified` | 说明 |
|---|---|---|---|---|---|
| `huawei/` | 华为 | VRP | 8 | high | S 系列交换机、AR/NE 路由器 |
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

每厂商 8 篇，按主题编号：

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

完整文件名格式：`<厂商>-<两位序号>-<主题>.md`，如 `kb/huawei/huawei-06-ospf.md`、
`kb/cisco-nxos/cisco-nxos-06-ospf.md`、`kb/vyos/vyos-05-static-route.md`、`kb/mikrotik/mikrotik-07-acl.md`。

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

## 文档格式

每篇文档含 YAML frontmatter，供 RAG 检索与元数据过滤：

| 字段 | 说明 |
|---|---|
| `vendor` / `os` | 厂商与操作系统，检索时可做过滤条件 |
| `topic` / `devices` | 主题与适用设备系列 |
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

## 导入 RAG 平台

- **通用**：直接导入 Markdown；建议按标题（`##`）分块，chunk 长度 500–1000 字，保留来源链接与 frontmatter 元数据。
- **Dify**：知识库 → 导入 Markdown，分段标识符选 `##`，检索时可用 metadata 过滤 `vendor`。
- **Coze / 扣子**：知识库 → 上传文档（.md）；表格内容建议保留原表格，检索命中率更好。
- **RAGFlow**：支持 Markdown 解析，开启表格解析与标题分块。
- **无文件检索能力的平台**：将本目录整体上传为知识附件，或在系统提示词中声明"优先引用知识库文档内容"。

## 检索与使用建议

1. Agent 回答前先按「厂商 + 主题」定位文件，再按关键词跨文件检索。
2. 跨厂商对照类问题，同时召回 2–4 篇同名主题文档（如 `huawei-05`/`ruijie-05`/`cisco-ios-05`/`juniper-05`/`vyos-05`）。
3. `verified: medium` 的文档（dptech/ 全部、zte/ 全部、cisco-ios-03）仅作参考方向，关键配置务必引导用户以官方手册为准。
4. 同一厂商存在多 CLI 体系时先确认平台：Cisco IOS-XE 与 NX-OS、Juniper EX（交换）与 MX/SRX（路由/安全）、
   VyOS 1.3 与 1.4+（firewall 语法分水岭）、RouterOS v6 与 v7（路由菜单重构）差异都写在对应篇目的「陷阱与版本差异」里。

## 校验与维护

- 结构校验：`plugins/dsh-network-engineer/tools/kb-validate.sh`（12 厂商 / 96 篇：frontmatter、固定五节、
  速查表行数与列数、高危 ⚠️ 条目、来源链接、篇幅、主题齐全性）。
- 插件测试：`cd plugins/dsh-network-engineer && npm test`（含知识库结构、跨厂商一致性、预设组合、打包清单）。
- 新增主题：按 `<厂商>-<两位序号>-<主题>.md` 命名并在本 README 补充索引；修订文档后更新 `updated` 字段。
- 新增厂商：先建目录骨架与 8 个主题文件，再补 frontmatter 与来源链接，最后在本 README 的厂商表里登记。

## 已知限制

- 迪普、中兴公开资料有限：dptech/、zte/ 各篇不确定处均标注「以官方手册/售后确认」，`verified` 恒为 medium。
- 各厂商不同型号/版本存在命令差异（如 NX-OS 的 `feature` 集合、Junos EX 与 MX 的二层语法、FortiOS 6.x/7.x、
  VyOS 1.3/1.4、RouterOS v6/v7），文档已标注主要差异点，但无法覆盖全部型号。
