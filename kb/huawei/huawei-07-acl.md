---
vendor: 华为（Huawei）
os: VRP
topic: ACL 与 NAT 出口
devices: S 系列交换机、AR/NE 路由器等 VRP 设备
keywords: [ACL, acl number 2000, acl 3000 高级, rule permit source 反掩码, traffic-filter, display acl all, NAT, nat outbound Easy-IP, 规则步长]
sources:
  - https://www.cnblogs.com/qzqdy/p/8962516.html
  - https://support.huawei.com/hedex/api/pages/EDOC1100414296/AZN1024P/06/resources/dc/traffic-filter_vlan_view_dc.html
  - https://support.huawei.com/enterprise/zh/doc/EDOC1000075592/38fc9cfd
verified: high
updated: 2026-10-31
---

# 华为 · ACL 与 NAT 出口

> ACL 分基本（2000~2999，仅匹配源地址）与高级（3000~3999，五元组）两类，用于 `traffic-filter` 接口流量过滤，也是路由器 NAT 出口匹配内网网段的前提。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建基本 ACL | `acl number 2000` | 系统视图 | 2000~2999，仅匹配源 IP；靠近目的侧部署 |
| 创建高级 ACL | `acl number 3000` | 系统视图 | 3000~3999，可匹配五元组；靠近源侧部署 |
| 匹配源网段 | `rule 5 permit source 192.168.1.0 0.0.0.255` | ACL 视图 | 反掩码；规则号缺省步长 5 |
| 拒绝规则 | `rule 100 deny` | ACL 视图 | 作为显式兜底（未匹配默认动作见陷阱） |
| 任意源匹配 | `rule 5 permit source any` | ACL 视图 | any 等价于 0.0.0.0 255.255.255.255 |
| 匹配五元组 | `rule 5 deny tcp source 192.168.1.0 0.0.0.255 destination 10.1.1.100 0 destination-port eq 445` | 高级 ACL 视图 | 协议+源目地址+端口组合匹配 |
| 接口入向过滤 | `traffic-filter inbound acl 3000` | 接口视图 | 匹配 permit 转发、deny 丢弃（各形态支持度以官方手册为准） |
| 接口出向过滤 | `traffic-filter outbound acl 3000` | 接口视图 | 注意对经过及本机发出流量的影响（以官方手册为准） |
| 查看 ACL | `display acl 3000` / `display acl all` | 用户视图 | 查看规则序号、步长与命中计数 |
| 删除单条规则 | `undo rule 5` | ACL 视图 | 按规则号删除；先 `display acl` 核对再删 |
| NAT 出口（Easy-IP） | `nat outbound 2000` | 出接口（WAN）视图 | ACL permit 的源地址用本接口 IP 做转换，deny 不转换 |
| NAT 公网地址池 | `nat address-group 1 202.100.1.10 202.100.1.20` + `nat outbound 2000 address-group 1` | 系统视图/出接口视图 | 地址池 NAPT 模式（以官方手册为准） |

## 典型示例

```text
<Huawei> system-view
[Huawei] sysname R1
[R1] acl number 2000                          // 匹配内网网段，供 NAT 使用
[R1-acl-basic-2000] rule 5 permit source 192.168.1.0 0.0.0.255
[R1-acl-basic-2000] quit
[R1] acl number 3000                          // 高级 ACL：先拒绝、再放行
[R1-acl-adv-3000] rule 5 deny tcp source 192.168.1.0 0.0.0.255 destination 10.1.1.100 0 destination-port eq 445
[R1-acl-adv-3000] rule 100 permit ip
[R1-acl-adv-3000] quit
[R1] interface GigabitEthernet0/0/0
[R1-GigabitEthernet0/0/0] traffic-filter inbound acl 3000
[R1-GigabitEthernet0/0/0] quit
[R1] interface GigabitEthernet0/0/1           // 出口 WAN 接口
[R1-GigabitEthernet0/0/1] ip address 202.100.1.2 255.255.255.0
[R1-GigabitEthernet0/0/1] nat outbound 2000   // Easy-IP：用出接口地址做转换
[R1-GigabitEthernet0/0/1] quit
<R1> display acl all
```

## 陷阱与版本差异

- 规则按编号从小到大匹配、命中即停；缺省步长 5，插入用中间编号（如 7），`undo rule <编号>` 删除单条。
- 未匹配任何规则的报文，默认动作由引用该 ACL 的业务决定：`traffic-filter` 缺省转发未匹配报文（与 Cisco 隐式 deny all 相反）；需要「拒绝一切未匹配」时必须显式加 `rule deny` 兜底。各业务默认动作以官方手册为准。
- 反掩码用于 ACL 与 OSPF `network`；正掩码用于接口 IP 与静态路由，两者混用是最常见配置错误。
- 基本 ACL 只看源地址，靠近目的部署；高级 ACL 匹配精确，靠近源部署，减少误伤。
- 同一接口同一方向通常只能应用一条 traffic-filter ACL（以官方手册为准）。
- `nat outbound` 引用的 ACL 匹配内网「源」地址：permit 的流被转换，deny 的流原样转发不做 NAT。
- `display acl` 的 matches 计数为 0 不一定代表规则错误，先核对应用的接口与方向是否正确。

## 高危操作 ⚠️

- ⚠️ 在在用接口应用含 `rule deny` 的 ACL 前，先确保放行管理网段与 SSH/Telnet，否则可能远程掉线锁死。
- ⚠️ `undo acl number <n>` 前先解除 traffic-filter、NAT 等业务引用，否则引用关系残留导致业务异常。
- ⚠️ NAT 出接口的 ACL 网段写错，会把不该转换的流量转换或漏转换，建议先在测试口验证。

## 参考来源

1. [华为交换机常用命令行操作总结 - 方面盘 - 博客园](https://www.cnblogs.com/qzqdy/p/8962516.html)
2. [华为产品文档 · traffic-filter（VLAN 视图）命令（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100414296/AZN1024P/06/resources/dc/traffic-filter_vlan_view_dc.html)
3. [华为企业支持中心 · 配置指南（EDOC1000075592）](https://support.huawei.com/enterprise/zh/doc/EDOC1000075592/38fc9cfd)
