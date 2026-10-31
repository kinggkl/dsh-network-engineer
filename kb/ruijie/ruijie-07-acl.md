---
vendor: 锐捷（Ruijie）
os: RGOS
topic: ACL
devices: RG-S 系列交换机、RG-R 系列路由器等 RGOS 设备
keywords: [锐捷, RGOS, ACL, access-list, 标准 ACL, 扩展 ACL, 命名 ACL, MAC ACL, ip access-group, 隐含 deny]
sources:
  - https://www.ruijie.com.cn/fw/wt/37269
  - https://www.cnblogs.com/rkit/articles/8081534.html
verified: high
updated: 2026-10-31
---

# 锐捷 · ACL

> 适用于 RGOS 设备标准/扩展/命名/MAC 扩展 ACL 的配置与接口应用。核心规则：每个 ACL 末尾默认隐含 deny any，放行类 ACL 必须显式 permit any 收尾。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 标准 ACL（编号式） | access-list 1 permit 192.168.2.0 0.0.0.255 | 全局配置 | 编号 1-99 和 1300-1999，只匹配源 IP |
| 标准 ACL 匹配单主机 | access-list 1 permit host 192.168.1.1 | 全局配置 | host 等价于 192.168.1.1 0.0.0.0 |
| 扩展 ACL（编号式） | access-list 100 permit tcp any any eq 80 | 全局配置 | 编号 100-199 和 2000-2699，可匹配源/目的/协议/端口 |
| 创建命名标准 ACL | ip access-list standard 1 | 全局配置 | 扩展命名 ACL 写作 ip access-list extended <名>（以官方手册为准） |
| 命名 ACL 加条目 | 10 permit 192.168.2.0 0.0.0.255 | 标准 ACL 配置 | 序号 10 便于后续按序插入 |
| 命名 ACL 显式拒绝 | 20 deny any | 标准 ACL 配置 | 隐含 deny 已存在，写出来便于阅读 |
| MAC 扩展 ACL | access-list 700 deny host 0001.1111.1111 any | 全局配置 | 按源 MAC 过滤，编号范围以官方手册为准 |
| 接口/SVI 应用 ACL | ip access-group 1 in | 接口配置 | in=入方向，out=出方向；物理口与 SVI（interface vlan 10）下均可用 |
| 查看 ACL 配置 | show access-lists | 特权模式 | 含条目与命中情况 |
| 查看 ACL 应用 | show ip access-group | 特权模式 | 显示应用接口与方向 |

## 典型示例

```text
! 需求：只允许 192.168.2.0/24 访问，其余拒绝（隐含 deny any 生效）
Ruijie> enable
Ruijie# configure terminal
Ruijie(config)# access-list 1 permit 192.168.2.0 0.0.0.255
Ruijie(config)# interface gigabitEthernet 0/24
Ruijie(config-if-GigabitEthernet 0/24)# ip access-group 1 in
Ruijie(config-if-GigabitEthernet 0/24)# exit
! 命名式标准 ACL：可按序号插入/删除条目（子视图提示符随版本可能不同）
Ruijie(config)# ip access-list standard 1
Ruijie(config-std-nacl)# 10 permit 192.168.2.0 0.0.0.255
Ruijie(config-std-nacl)# 20 deny any
Ruijie(config-std-nacl)# exit
Ruijie(config)# end
Ruijie# write
Ruijie# show access-lists 1        ← 查看 ACL 1 的配置
Ruijie# show ip access-group       ← 查看 ACL 在接口下的应用
```

## 陷阱与版本差异

- ⚠️ 默认隐含 deny any：每个 ACL 末尾自动拒绝所有未匹配流量。只限制部分 IP 时必须补 permit 放行其余流量；只放行某网段、禁止其余时末尾必须显式 permit any，否则等于全拒。
- 匹配自上而下、命中即停：先写精确条目再写宽泛条目；deny 写在前面会把后面的 permit 全部短路。
- 反掩码（通配符）方向与子网掩码相反：0.0.0.0 精确匹配单主机（可用 host 代替），0.0.0.255 匹配一个 /24 网段，any 等价于全部。
- 扩展 ACL 操作符：lt（小于）、eq（等于）、gt（大于）、neg（不等于）、range（包含），端口可写名称或编号，具体可用值以 CLI ？查询为准。
- 应用位置经验法则（Cisco 风格）：标准 ACL 靠近目的端应用，扩展 ACL 靠近源端应用，避免过度拦截。
- 编号式 ACL 无法按条目删除/插入，改动需整条重写；命名式 ACL 支持序号精确维护，生产优先用命名式。
- 与华为差异：华为 ACL 编号为 2000-2999（基本）/3000-3999（高级），接口下用 traffic-filter inbound acl 应用（华为 VRP 写法，锐捷不适用）；锐捷/Cisco 用 access-list + ip access-group in 或 out。

## 高危操作 ⚠️

- ⚠️ 在远程管理路径（管理 SVI、VTY 关联接口）应用含隐含 deny 的 ACL：可能把所有管理员锁在设备外，变更前确保 Console 可达。
- ⚠️ no access-list 100：整条删除 ACL，已应用的接口瞬间失去过滤策略；重写编号式 ACL 前先备份 show access-lists 输出。
- ⚠️ 生产接口上直接调整条目顺序：误序可能放行敏感流量或拒绝关键业务，先在测试环境验证。

## 参考来源

1. [锐捷RGOS交换机常用的ACL（访问控制列表）类型有哪些？每种类型的ACL如何配置 - 锐捷官方知识库](https://www.ruijie.com.cn/fw/wt/37269)
2. [锐捷网络交换机的配置命令集 - 博客园](https://www.cnblogs.com/rkit/articles/8081534.html)
