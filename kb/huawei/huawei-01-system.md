---
vendor: 华为（Huawei）
os: VRP
topic: 系统管理与视图
devices: S 系列交换机、AR/NE 路由器等 VRP 设备
keywords: [VRP 视图, system-view, sysname, save, display current-configuration, commit, rollback configuration, AAA, local-user, console 登录]
sources:
  - https://support.huawei.com/hedex/api/pages/EDOC1100087046/AZJ0324D/12/resources/dc/save.html
  - https://support.huawei.com/enterprise/zh/doc/EDOC1000041691/a0f4f7e4
  - https://support.huawei.com/enterprise/zh/doc/EDOC1100383073/135b2760
verified: high
updated: 2026-10-31
---

# 华为 · 系统管理与视图

> 适用于 VRP 平台的 S 系列交换机与 AR/NE 路由器：视图层级、系统信息查看、配置保存与回滚、登录账号管理；CloudEngine（CE）系列两阶段配置单独列出。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入系统视图 | system-view | 用户视图 | 提示符 `<Huawei>` 变为 `[Huawei]` |
| 逐层退出 | quit | 任意视图 | 返回上一层视图 |
| 直回用户视图 | return 或 Ctrl+Z | 任意视图 | 从接口/协议视图一步回到 `<Huawei>` |
| 修改设备名 | sysname CORE-SW-01 | 系统视图 | 各级提示符即时更新 |
| 查看版本 | display version | 用户视图 | VRP 版本、机型、运行时长 |
| 查看硬件 | display device | 用户视图 | 单板/电源/风扇状态是否 Normal |
| 查看时间 | display clock | 用户视图 | 排查日志时间戳错乱 |
| 设置时区 | clock timezone CST add 08:00:00 | 用户视图 | 北京时间 UTC+8 |
| 手工对时 | clock datetime 12:00:00 2026-10-15 | 用户视图 | 参数顺序随版本，以官方手册为准 |
| 配置 NTP | ntp-service unicast-server 10.0.0.100 | 系统视图 | 与 NTP 服务器同步时间 |
| 保存配置 | save | 用户视图 | 写入下次启动配置文件 |
| 查看当前配置 | display current-configuration | 用户视图 | 正在运行的配置 |
| 查看已保存配置 | display saved-configuration | 用户视图 | 与 current 对比可发现未保存改动 |
| 清除已保存配置 | reset saved-configuration | 用户视图 | ⚠️ 删除启动配置，重启后空配置 |
| 重启设备 | reboot | 用户视图 | ⚠️ 重启前必须 save |

## CloudEngine 两阶段配置（CE 系列）

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 提交配置 | commit | 系统视图 | CE 系列配置须 commit 后才真正生效 |
| 带标签提交 | commit label CHANGE-0415 | 系统视图 | 给提交命名便于回滚（以官方手册为准） |
| 查看提交历史 | display configuration commit list | 用户视图 | 列出各次 commit 的 ID 与标签 |
| 回滚到指定提交 | rollback configuration to <commit-id> | 用户视图 | 按历史 commit ID 整体回滚 |

> 传统盒式交换机（S5700/S6720 等）无两阶段机制，配置即时生效；回滚只能依靠事先 `save` 并导出的配置文件备份。

## AAA 账号与 Console 登录

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入 AAA 视图 | aaa | 系统视图 | 本地账号均在 AAA 视图配置 |
| 创建本地账号 | local-user admin password irreversible-cipher <密码> | AAA 视图 | 密码不可逆加密存储 |
| 设置账号等级 | local-user admin privilege level 15 | AAA 视图 | 15 为最高管理级 |
| 开放登录服务 | local-user admin service-type telnet ssh | AAA 视图 | 不配 service-type 则账号无法登录 |
| 进入 Console 线路 | user-interface console 0 | 系统视图 | — |
| Console 启用 AAA | authentication-mode aaa | Console 线路视图 | Console 直连也需账号认证 |

## 典型示例

```
<Huawei> clock timezone CST add 08:00:00
<Huawei> system-view
[Huawei] sysname CORE-SW-01
[CORE-SW-01] ntp-service unicast-server 10.0.0.100
[CORE-SW-01] aaa
[CORE-SW-01-aaa] local-user admin password irreversible-cipher Huawei@123
[CORE-SW-01-aaa] local-user admin privilege level 15
[CORE-SW-01-aaa] local-user admin service-type telnet ssh
[CORE-SW-01-aaa] quit
[CORE-SW-01] user-interface console 0
[CORE-SW-01-ui-console0] authentication-mode aaa
[CORE-SW-01-ui-console0] return
<CORE-SW-01> save
```

## 陷阱与版本差异

- 传统盒式（S5700/S6720 等）与 CE 系列差异最大：前者无 `commit`/`rollback configuration`，回滚靠配置文件备份；后者配置不 `commit` 不生效。
- 本地账号密码：新版本用 `password irreversible-cipher`，旧版本为 `password cipher`，两种写法互不兼容（以官方手册为准）。
- `clock timezone` 只设置时区不设置时间，需配合 `clock datetime` 或 NTP 才能对齐时间。
- `display saved-configuration` 与 `display current-configuration` 不一致，说明改动尚未 `save`，重启即丢。

## 高危操作 ⚠️

- ⚠️ `reset saved-configuration`：清空启动配置，误执行并重启后设备空配置失联，操作前必须导出备份。
- ⚠️ `reboot`：中断业务；先 `save` 并与团队确认变更窗口。
- ⚠️ Console 未启用认证（authentication-mode none）时，物理接触即可完全控制设备，生产环境禁止。

## 参考来源

1. [华为产品文档 · save 命令（保存当前配置）（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100087046/AZJ0324D/12/resources/dc/save.html)
2. [华为企业支持文档 EDOC1000041691（support.huawei.com）](https://support.huawei.com/enterprise/zh/doc/EDOC1000041691/a0f4f7e4)
3. [华为企业支持文档 EDOC1100383073（support.huawei.com）](https://support.huawei.com/enterprise/zh/doc/EDOC1100383073/135b2760)
