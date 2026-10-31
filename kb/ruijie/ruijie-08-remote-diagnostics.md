---
vendor: 锐捷（Ruijie）
os: RGOS
topic: 远程管理与诊断
devices: RG-R 系列路由器、RG-S 系列交换机等 RGOS 设备
keywords: [锐捷, RGOS, 远程管理, line vty, show cpu, show logging, ping, traceroute, NAT, DHCP]
sources:
  - https://www.cnblogs.com/rkit/articles/8081534.html
  - https://zhuanlan.zhihu.com/p/1908554021154846073
  - https://www-file.ruijie.com.cn/Fu/Article/313740fb-d969-4304-a625-d84561fa8fbd/v13/%E5%AE%98%E7%BD%91%E5%8F%91%E5%B8%83/PDF/00-pdf/01-%E5%9F%BA%E7%A1%80%E9%85%8D%E7%BD%AE.pdf
  - https://www-file.ruijie.com.cn/Fu/Article/6c470414-e594-4277-98e3-40c11e3dc211/v0/20240913092259/PDF/00-pdf/01-%E7%B3%BB%E7%BB%9F%E7%AE%A1%E7%90%86.pdf
verified: high
updated: 2026-10-31
---

# 锐捷 · 远程管理与诊断

> 适用于 RGOS 设备 VTY 远程登录、常用诊断命令与路由器 NAT/DHCP 配置。诊断命令均为只读；NAT/DHCP 属生产变更，需按变更流程执行并备份配置。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入 VTY 线路 | line vty 0 4 | 全局配置 | 配置 0~4 共 5 个远程登录会话 |
| 设置登录密码 | password <密码> | line 配置 | |
| 启用密码认证 | login | line 配置 | 只配 password 不配 login 可能不生效（以官方手册为准） |
| 查看 CPU | show cpu | 特权模式 | CPU 持续偏高先查广播风暴/攻击 |
| 查看系统时间 | show clock | 特权模式 | 与日志时间对齐 |
| 查看日志 | show logging | 特权模式 | 排障第一入口 |
| 查看 ARP 表 | show arp | 特权模式 | 核对网关与终端映射 |
| 查看 MAC 地址表 | show mac-address-table dynamic | 特权模式 | 定位终端接入端口 |
| 查看当前配置 | show running-config | 特权模式 | 变更前后各备份一份 |
| 连通性测试 | ping <目标 IP> | 特权模式 | 逐段 ping 定位断点 |
| 路径跟踪 | traceroute <目标 IP> | 特权模式 | 查看逐跳转发路径 |
| NAT 地址池 | ip nat pool PUBLIC <起始 IP> <结束 IP> netmask <掩码> | 全局配置 | 路由器公网地址池（Cisco 风格） |
| NAT 匹配内网 | access-list 10 permit 192.168.10.0 0.0.0.255 | 全局配置 | 反掩码匹配内网网段 |
| NAT 转换关联 | ip nat inside source list 10 pool PUBLIC | 全局配置 | 内网网段复用地址池上网 |
| 标记内/外接口 | ip nat inside / ip nat outside | 接口配置 | 内外口都要标记，缺一不生效 |
| 开启 DHCP | service dhcp | 全局配置 | DHCP 总开关（以版本手册为准） |
| 创建地址池 | ip dhcp pool <名称> | 全局配置 | 进入 DHCP 池配置视图 |
| 池网段 | network 192.168.10.0 255.255.255.0 | DHCP 池配置 | 须与客户端所在网段一致 |
| 池网关 | default-router 192.168.10.1 | DHCP 池配置 | 下发给客户端的网关 |
| 池 DNS | dns-server <IP> | DHCP 池配置 | 可配置多个（以官方手册为准） |
| 租期 | lease <天数> | DHCP 池配置 | 单位与默认租期以版本手册为准 |

## 典型示例

```text
! 1) VTY 远程登录
Ruijie> enable
Ruijie# configure terminal
Ruijie(config)# line vty 0 4
Ruijie(config-line)# password Ruijie@123
Ruijie(config-line)# login
Ruijie(config-line)# exit
! 2) NAT：内网 192.168.10.0/24 经地址池 PUBLIC 上网（路由器）
Ruijie(config)# access-list 10 permit 192.168.10.0 0.0.0.255
Ruijie(config)# ip nat pool PUBLIC 202.100.1.10 202.100.1.20 netmask 255.255.255.0
Ruijie(config)# ip nat inside source list 10 pool PUBLIC
Ruijie(config)# interface gigabitEthernet 0/0
Ruijie(config-if-GigabitEthernet 0/0)# ip nat inside
Ruijie(config-if-GigabitEthernet 0/0)# exit
Ruijie(config)# interface gigabitEthernet 0/1
Ruijie(config-if-GigabitEthernet 0/1)# ip nat outside
Ruijie(config-if-GigabitEthernet 0/1)# exit
! 3) DHCP：为 VLAN10 用户分配地址
Ruijie(config)# service dhcp
Ruijie(config)# ip dhcp pool VLAN10
Ruijie(dhcp-config)# network 192.168.10.0 255.255.255.0
Ruijie(dhcp-config)# default-router 192.168.10.1
Ruijie(dhcp-config)# dns-server 114.114.114.114
Ruijie(dhcp-config)# lease 1
Ruijie(dhcp-config)# end
Ruijie# write
! 4) 常用诊断（只读）
Ruijie# show cpu
Ruijie# show logging
Ruijie# ping 192.168.10.100
Ruijie# traceroute 8.8.8.8
```

## 陷阱与版本差异

- VTY 认证：line vty 下 password + login 组合；锐捷还可配合 enable secret level 1 实现分级（见系统管理篇），具体认证组合以版本手册为准。
- NAT 排障三查：show running-config 确认 inside/outside 接口都已标记 → show access-lists 10 确认内网匹配 → show ip nat translation 查看转换表（以版本手册为准）。
- DHCP：service dhcp 为总开关；池 network 必须与客户端所在 VLAN/SVI 网段一致，default-router 即客户端网关；lease 的单位/默认租期以版本手册为准。
- 诊断顺序建议：show cpu → show logging → show arp / show mac-address-table dynamic → ping → traceroute → show running-config 核对配置。
- 网上部分「锐捷命令大全」类文章混入华为 VRP 写法冒充锐捷，如 port link-mode、port default vlan、port trunk permit vlan、vlan batch、interface vlanif（华为 VRP 写法，锐捷不适用）；锐捷对应写法为 switchport access vlan、switchport mode trunk、switchport trunk allowed vlan、interface vlan 1、vlan 10，检索时注意甄别。
- 与华为差异：华为 NAT 为地址池 + 接口下 nat outbound 关联 ACL，DHCP 为 dhcp enable + 接口下 dhcp select interface（华为 VRP 写法，锐捷不适用）；锐捷为 ip nat pool / ip nat inside source list 与 service dhcp / ip dhcp pool 体系。

## 高危操作 ⚠️

- ⚠️ 修改 NAT/DHCP 生产配置：直接影响在线用户上网与地址获取，变更前导出 show running-config 备份并准备回退。
- ⚠️ 删除 DHCP 池或关闭 service dhcp：客户端租期到期后无法续租，全网终端逐步断网。
- ⚠️ 误改 line vty 认证或关闭远程服务：可能中断所有远程管理会话，确保 Console 通道可用后再操作。

## 参考来源

1. [锐捷网络交换机的配置命令集 - 博客园](https://www.cnblogs.com/rkit/articles/8081534.html)
2. [锐捷网络设备（交换机、路由器、防火墙）常用命令整理 - 知乎](https://zhuanlan.zhihu.com/p/1908554021154846073)
3. [锐捷设备命令大全，网络工程师收藏！- 阿里云开发者社区](https://developer.aliyun.com/article/1573480)（注意：该文混入华为 VRP 写法，仅作检索甄别参考，锐捷命令表未采用）
4. [锐捷官方文档《基础配置》（设备登录 Console/Telnet/SSH、日志配置，PDF）（www-file.ruijie.com.cn）](https://www-file.ruijie.com.cn/Fu/Article/313740fb-d969-4304-a625-d84561fa8fbd/v13/%E5%AE%98%E7%BD%91%E5%8F%91%E5%B8%83/PDF/00-pdf/01-%E5%9F%BA%E7%A1%80%E9%85%8D%E7%BD%AE.pdf)
5. [锐捷官方文档《命令参考-系统管理》（CPU-LOG、内存等排障命令，PDF）（www-file.ruijie.com.cn）](https://www-file.ruijie.com.cn/Fu/Article/6c470414-e594-4277-98e3-40c11e3dc211/v0/20240913092259/PDF/00-pdf/01-%E7%B3%BB%E7%BB%9F%E7%AE%A1%E7%90%86.pdf)
