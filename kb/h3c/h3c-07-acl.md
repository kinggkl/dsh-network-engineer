---
vendor: 新华三（H3C）
os: Comware V5/V7
topic: ACL 访问控制列表
devices: S 系列交换机、MSR 路由器等 Comware 设备
keywords: [acl number, acl advanced, 基本ACL 2000, 高级ACL 3000, rule permit source, packet-filter, traffic classifier, traffic behavior, qos policy, display acl all]
sources:
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Configure/Security_Hardening/H3C_SH(Comware_V7)-Long?CHID=1318843"
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command"
  - "https://www.cnblogs.com/PBDragon/p/18843131"
  - "https://cloud.tencent.com/developer/article/2514727"
verified: high
updated: 2026-10-15
---

# 新华三 · ACL 访问控制列表

> 适用于 H3C Comware V5/V7 的 ACL 定义与包过滤（packet-filter）及 QoS 策略两种应用方式。ACL 编号段：2000～2999 基本 ACL（仅源地址），3000～3999 高级 ACL（五元组）。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建基本 ACL | acl number 2000 | 系统视图 | 仅匹配源地址；V7 亦可用 `acl basic 2000` |
| 创建高级 ACL | acl number 3000 或 acl advanced 3000 | 系统视图 | 匹配协议/源目地址/端口等 |
| 基本 ACL 规则 | rule permit source 192.168.1.0 0.0.0.255 | 基本 ACL 视图 | 通配符（反掩码） |
| 高级 ACL 规则 | rule permit ip source 192.168.1.0 0.0.0.255 destination 10.1.1.0 0.0.0.255 | 高级 ACL 视图 | 协议关键字：ip/tcp/udp/icmp 等 |
| 指定规则编号 | rule 5 permit ... | ACL 视图 | 缺省步长 5，便于中间插规则（以版本手册为准） |
| 兜底拒绝 | rule deny | ACL 视图 | 未匹配任何规则的报文按缺省动作处理 |
| 接口应用包过滤 | packet-filter 3000 inbound | 接口视图 | outbound 方向二层口支持情况视机型（以版本手册为准） |
| 查看 ACL | display acl all | 用户/任意视图 | 核对规则编号与匹配计数 |
| 流分类 | traffic classifier C1 后 if-match acl 3000 | 系统视图/流分类视图 | QoS 方式第一步 |
| 流行为 | traffic behavior B1 后 filter deny | 系统视图/流行为视图 | filter deny 丢包，也可配限速/重标记 |
| QoS 策略 | qos policy P1 后 classifier C1 behavior B1 | 系统视图/QoS 策略视图 | 绑定类与行为 |
| 接口应用 QoS 策略 | qos apply policy P1 inbound | 接口视图 | QoS 方式第四步 |

## 典型示例

```
<Sysname> system-view
[Sysname] acl number 3000
[Sysname-acl-adv-3000] rule permit ip source 192.168.1.0 0.0.0.255 destination 10.1.1.0 0.0.0.255
[Sysname-acl-adv-3000] rule deny ip
[Sysname-acl-adv-3000] quit
[Sysname] interface Vlan-interface 10
[Sysname-Vlan-interface10] packet-filter 3000 inbound
[Sysname-Vlan-interface10] quit
[Sysname] traffic classifier C1
[Sysname-classifier-C1] if-match acl 3000
[Sysname-classifier-C1] quit
[Sysname] traffic behavior B1
[Sysname-behavior-B1] filter deny
[Sysname-behavior-B1] quit
[Sysname] qos policy P1
[Sysname-qospolicy-P1] classifier C1 behavior B1
[Sysname-qospolicy-P1] quit
[Sysname] quit
<Sysname> display acl all
```

## 陷阱与版本差异

- 通配符是反掩码（0 表示精确匹配、1 表示任意位），与华为一致；写成正掩码会直接配错语义。
- H3C 包过滤（packet-filter）缺省动作为 deny：报文未匹配 ACL 中任何规则即被丢弃；可通过 `packet-filter default permit` 调整（以版本手册为准）。华为部分场景缺省 permit，迁移配置务必核对。
- 规则按编号从小到大依次匹配，命中即停；插入新规则用中间编号（缺省步长 5），`undo rule <编号>` 删除指定规则。
- ACL 视图提示符 V5 为 `[Sysname-acl-adv-3000]`，V7 部分版本显示为 `[Sysname-acl-ipv4-adv-3000]`（以版本手册为准）。
- packet-filter 适合简单过滤；QoS 方式（classifier/behavior/policy）可组合限速、重标记、过滤等复杂动作，两者同接口同方向叠加时的处理顺序以版本手册为准。
- 时间段、二层 ACL（4000～4999）、用户自定义 ACL 等扩展本文不展开（以官方手册为准）。

## 高危操作 ⚠️

- ⚠️ 远程会话场景对管理口/VTY 方向误配 `packet-filter deny` 或漏放行管理网段：会话被锁在设备外；建议先放行管理地址段、保持当前会话并另开新会话验证后再退出。
- ⚠️ 在核心/上联口 inbound 方向应用含 `rule deny ip` 的 ACL：未放行的全部业务被丢，影响面大；先在边缘口或测试口验证。
- ⚠️ 修改已应用的 ACL 规则（undo/重配 rule）立即生效；先确认当前匹配计数（display acl all）再变更。
- ⚠️ QoS 策略中 `filter deny` 同样丢流量，且可与包过滤叠加，排查丢包时先 `display qos policy interface`（以版本手册为准）确认。

## 参考来源

1. [H3C 交换机安全加固配置指导（Comware V7）](<https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Configure/Security_Hardening/H3C_SH(Comware_V7)-Long?CHID=1318843>)
2. [H3C Comware V7 命令手册（官网命令参考入口）](https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command)
3. [H3C交换机常用命令 - PBDragon - 博客园](https://www.cnblogs.com/PBDragon/p/18843131)
4. [H3C华三2025最新交换机常用70条指令 - 腾讯云开发者社区](https://cloud.tencent.com/developer/article/2514727)
