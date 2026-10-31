---
vendor: 锐捷（Ruijie）
os: RGOS
topic: 接口配置
devices: RG-S 系列交换机、RG-R 系列路由器等 RGOS 设备
keywords: [锐捷, RGOS, 接口配置, interface gigabitEthernet, no shutdown, speed, duplex, description, show interface status, show interfaces counters]
sources:
  - https://www.ruijie.com.cn/fw/wt/37269
  - https://www.cnblogs.com/rkit/articles/8081534.html
verified: high
updated: 2026-10-31
---

# 锐捷 · 接口配置

> 适用于 RGOS 设备物理接口的启停、速率双工、描述与计数器查看。配置前务必先用 show interface status 确认接口名称，再进入对应接口视图。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入接口 | interface gigabitEthernet 0/1 | 全局配置 | 提示符如 config-if-GigabitEthernet 0/1 |
| 启用接口 | no shutdown | 接口配置 | 出厂状态因机型而异，先看 status |
| 关闭接口 | shutdown ⚠️ | 接口配置 | 立即断开该口业务与远程会话 |
| 强制速率 | speed 10/100/1000/auto | 接口配置 | 百兆口无 1000 可选，两端需一致 |
| 强制双工 | duplex full/half/auto | 接口配置 | 两端不一致会产生双工不匹配丢包 |
| 配置描述 | description To-Core-SW_Gi0/2 | 接口配置 | 标注对端，便于排障 |
| 接口三层化 | no switchport | 接口配置 | 交换机二层口转三层路由口（以官方手册为准） |
| 接口配置 IP | ip address 192.168.4.2 255.255.255.0 | 接口配置 | 三层口/三层化口配置互联或网关地址 |
| 接口状态总览 | show interface status | 特权模式 | 先看接口名/状态/速率再进配置 |
| 全机收发计数 | show interfaces counters | 特权模式 | 查看各口收发包量 |
| 单口收发计数 | show interfaces gigabitEthernet 4/1 counters | 特权模式 | 核对指定口收发与错包增长 |
| 接口详细信息 | show interfaces gigabitEthernet 0/1 | 特权模式 | 含速率/双工/错包/CRC 详情 |

## 典型示例

```text
Ruijie> enable
Ruijie# show interface status          ← 第一步：确认接口名与当前状态
Ruijie# configure terminal
Ruijie(config)# interface gigabitEthernet 0/1
Ruijie(config-if-GigabitEthernet 0/1)# description To-Core-SW_Gi0/2
Ruijie(config-if-GigabitEthernet 0/1)# speed auto
Ruijie(config-if-GigabitEthernet 0/1)# duplex auto
Ruijie(config-if-GigabitEthernet 0/1)# no shutdown
Ruijie(config-if-GigabitEthernet 0/1)# end
Ruijie# write
Ruijie# show interfaces gigabitEthernet 0/1 counters    ← 观察收发与错包计数
```

## 陷阱与版本差异

- 接口命名惯例：FastEthernet（百兆）、GigabitEthernet（千兆）、TenGigabitEthernet（万兆）；编号一般为「槽位/端口」（如 0/1、4/1），不同机型槽位编排不同，配置前先 show interface status。
- speed/duplex 手工强制时两端必须匹配，否则双工不匹配（duplex mismatch）造成丢包、错包剧增；无特殊需求保持 auto 自协商。
- 排障顺序建议：show interface status 看状态 → show interfaces counters 看收发与错包 → show interfaces <接口名> 看详情；错包/CRC 持续增长优先查线路、光模块与对端。
- 计数器清零方式因版本而异（以官方手册为准），排查前注意记录计数基线。
- 批量进入多接口可用 interface range 语法（以官方手册为准），Cisco 风格写法如 interface range gigabitEthernet 0/1-2。
- 光口速率由所插光模块决定，千兆/万兆模块不可互换混用（以官方手册为准）。
- 与华为/华三差异：华为接口编号为三段式（如 GigabitEthernet0/0/1），启停用 undo shutdown/shutdown（华为 VRP 写法，锐捷不适用）；锐捷/Cisco 为两段式编号 + no shutdown。

## 高危操作 ⚠️

- ⚠️ shutdown：在上联口、级联口或管理 SVI 关联的物理口执行会立即中断业务与远程登录会话；变更前确认 Console/带外通道可达。
- ⚠️ 对在用接口强制 speed/duplex：与对端不匹配会瞬间大量丢包，等同于链路故障。

## 参考来源

1. [锐捷RGOS交换机常用的ACL类型与配置 - 锐捷官方知识库](https://www.ruijie.com.cn/fw/wt/37269)
2. [锐捷网络交换机的配置命令集 - 博客园](https://www.cnblogs.com/rkit/articles/8081534.html)
