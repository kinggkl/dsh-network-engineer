---
vendor: 锐捷（Ruijie）
os: RGOS
topic: 系统管理与模式
devices: RG-S 系列交换机、RG-R 系列路由器等 RGOS 设备
keywords: [锐捷, RGOS, 命令模式, enable 特权模式, enable secret, hostname, write 保存配置, banner motd, show version, 恢复出厂]
sources:
  - https://www.cnblogs.com/rkit/articles/8081534.html
  - https://www.ruijie.com.cn/Fu/Article/68e41456-6eee-4dcc-85f1-6389deb6c816/v3/%E5%AE%98%E7%BD%91%E5%8F%91%E5%B8%83/HTML/02-%E5%8D%87%E7%BA%A7%E5%89%8D%E5%87%86%E5%A4%87%E5%B7%A5%E4%BD%9C/2.5%20%E5%A4%87%E4%BB%BD%E4%B8%8E%E5%9B%9E%E9%80%80%E5%87%86%E5%A4%87.html
verified: high
updated: 2026-10-31
---

# 锐捷 · 系统管理与模式

> 适用于 RGOS 交换机/路由器的命令行模式切换、主机名、密码分级、Web 管理开关、配置保存与恢复出厂。命令风格与 Cisco IOS 相近，但密码分级等细节为锐捷特有。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入特权模式 | enable | 用户模式 Ruijie> | 输入密码后提示符变为 Ruijie# |
| 退回用户模式 | disable 或 exit | 特权模式 Ruijie# | 退出特权级别 |
| 进入全局配置模式 | configure terminal | 特权模式 Ruijie# | 可简写 conf t，提示符变为 Ruijie(config)# |
| 返回上一级视图 | exit | 任意配置视图 | 逐级返回 |
| 直接返回特权模式 | end | 任意配置视图 | 等效快捷键 Ctrl+Z |
| 设置设备主机名 | hostname switchA | 全局配置 | 提示符同步变为 switchA |
| 配置每日提示横幅 | banner motd & 文本 & | 全局配置 | & 为终止符，可换用其他字符 |
| 远程登录密码 | enable secret level 1 0 <密码> | 全局配置 | level 1 为远程登录（普通用户）级别 |
| 特权密码 | enable secret level 15 0 <密码> | 全局配置 | 级别可选 1~15，15 为最高权限；0 表示密码不加密 |
| 开启 Web 管理 | enable services web-server | 全局配置 | 部分版本/机型写作 enable service web-server http 或 https 或 all（以官方手册为准） |
| 开启远程登录服务 | enable services telnet-server | 全局配置 | services 可选 web-server、telnet-server 等 |
| 保存配置 | write 或 write memory | 特权模式 | 将运行配置写入 flash:config.text |
| 保存配置（等效） | copy running-config startup-config | 特权模式 | 与 write 等效 |
| 查看版本信息 | show version | 特权模式 | 型号、RGOS 版本、运行时间 |
| 查看系统时间 | show clock | 特权模式 | 排障时先与日志时间对齐 |
| 查看当前运行配置 | show running-config | 特权模式 | 内存中生效配置，重启即失 |
| 删除配置文件 | del flash:config.text ⚠️ | 特权模式 | 交换机及 1700 系列路由器适用 |
| 删除启动配置 | erase startup-config ⚠️ | 特权模式 | 2500 系列路由器等平台适用（以官方手册为准） |
| 删除 VLAN 数据库 | del flash:vlan.dat ⚠️ | 特权模式 | 清空交换机全部 VLAN 配置信息 |
| 重启设备 | reload ⚠️ | 特权模式 | 未 write 保存的修改全部丢失 |

## 典型示例

```text
Ruijie> enable
Password: ********                        ← 输入不回显
Ruijie# configure terminal
Ruijie(config)# hostname switchA
switchA(config)# banner motd &Authorized access only!&
switchA(config)# enable secret level 1 0 Ruijie@123    ← 远程登录密码
switchA(config)# enable secret level 15 0 Admin@123    ← 特权密码
switchA(config)# enable services web-server            ← 开启 WEB 管理
switchA(config)# end
switchA# write                                          ← 必须保存，否则重启丢失
```

## 陷阱与版本差异

- 模式层级：Ruijie> 用户模式 → enable → Ruijie# 特权模式 → configure terminal → Ruijie(config)# 全局配置 → 各子视图（config-vlan、config-if、config-line 等）；exit 逐级返回，end/Ctrl+Z 直接回特权模式。
- 锐捷密码按级别设置：enable secret level <1-15> 0 <密码>，level 1 为普通用户/远程登录级别，level 15 为最高特权；命令末尾 0 表示明文存储。Cisco IOS 的 line vty 下 password + enable secret 写法与锐捷不同，不能照抄。
- Web 管理开关存在 enable services web-server 与 enable service web-server http/https/all 两种写法，随版本/机型不同（以官方手册为准）。
- 保存必须显式执行：show running-config 是内存配置，write/copy running-config startup-config 后才持久化到 flash:config.text；重启未保存必丢。
- 与华为 VRP/华三 Comware 差异：华为用 sysname、super password、save（华为 VRP 写法，锐捷不适用）；锐捷配置文件为 flash:config.text，VLAN 数据库为 flash:vlan.dat，恢复出厂围绕这两个文件展开。
- 恢复出厂的标准组合是「del flash:config.text（或 erase startup-config）+ del flash:vlan.dat + reload」，务必在变更窗口、Console 可达时执行。

## 高危操作 ⚠️

- ⚠️ del flash:config.text：删除启动配置文件，重启后设备以空配置启动，管理 IP 与远程登录全部失效，通常只能现场 Console 恢复。
- ⚠️ erase startup-config：同上，清除启动配置（平台适用范围以官方手册为准）。
- ⚠️ del flash:vlan.dat：删除全部 VLAN 定义，重启后所有接入/干线端口的 VLAN 引用失效，下游用户断网。
- ⚠️ reload：立即重启设备，未保存配置丢失；生产设备重启前先 write 并确认维护窗口。

## 参考来源

1. [锐捷网络交换机的配置命令集 - 博客园](https://www.cnblogs.com/rkit/articles/8081534.html)
2. [锐捷官网：升级前准备——备份与回退准备（write / show running-config 配置保存与回滚说明）](https://www.ruijie.com.cn/Fu/Article/68e41456-6eee-4dcc-85f1-6389deb6c816/v3/%E5%AE%98%E7%BD%91%E5%8F%91%E5%B8%83/HTML/02-%E5%8D%87%E7%BA%A7%E5%89%8D%E5%87%86%E5%A4%87%E5%B7%A5%E4%BD%9C/2.5%20%E5%A4%87%E4%BB%BD%E4%B8%8E%E5%9B%9E%E9%80%80%E5%87%86%E5%A4%87.html)
