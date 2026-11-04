---
vendor: 华为（Huawei）
os: VRP
topic: 系统管理与视图
devices: S/CE 系列交换机、AR/NE 路由器（平台差异见正文）
keywords: [VRP 视图, system-view, sysname, save, display current-configuration, commit, rollback configuration, AAA, local-user, console 登录, 平台差异]
sources:
  - https://support.huawei.com/hedex/api/pages/EDOC1100087046/AZJ0324D/12/resources/dc/save.html
  - https://support.huawei.com/enterprise/zh/doc/EDOC1000041691/a0f4f7e4
  - https://support.huawei.com/enterprise/zh/doc/EDOC1100383073/135b2760
  - https://support.huawei.com/enterprise/zh/doc/EDOC1100389671/b6bc6158
verified: high
updated: 2026-11-04
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

> 经典 V200R 版本（如 S5700 V200R019、S6720 V200R019）无两阶段机制，配置即时生效；CloudEngine S 系列 V600 新平台支持两阶段提交与配置回退（缺省模式以对应产品文档为准）；无两阶段的平台回滚只能依靠事先 `save` 并导出的配置文件备份。

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

- 经典 V200R 版本（如 S5700 V200R019、S6720 V200R019）与 CE 系列差异最大：前者无 `commit`/`rollback configuration`，回滚靠配置文件备份；CE 数据中心系列与 CloudEngine S V600 配置不 `commit` 不生效（V600 的缺省模式以产品文档为准）。
- 本地账号密码：新版本用 `password irreversible-cipher`，旧版本为 `password cipher`，两种写法互不兼容（以官方手册为准）。
- `clock timezone` 只设置时区不设置时间，需配合 `clock datetime` 或 NTP 才能对齐时间。
- `display saved-configuration` 与 `display current-configuration` 不一致，说明改动尚未 `save`，重启即丢。

## 平台差异（交换机 vs 路由器）

| 维度 | S/CE 系列交换机 | AR/NE 路由器 |
|---|---|---|
| 配置生效模型 | 经典 S 系列（V200R 等）：配置即时生效、无 `commit`；CloudEngine S V600 与 CE 数据中心系列：两阶段提交，编辑后需 `commit` 才生效，也可用 `system-view immediately` 切换为立即生效模式（缺省模式以对应产品文档为准） | NE 系列（VRP V8）：支持两阶段，缺省即两阶段，需 `commit`；AR 各版本能力不同，以对应平台产品文档为准 |
| 两阶段提交/回滚 | CE 数据中心系列与 CloudEngine S V600 支持 `commit` 与配置回退点命令；经典 S 系列 V200R 无这些命令 | NE（VRP V8）支持 `commit` 并生成配置回退点；AR 平台两阶段/回退能力随版本，以对应平台产品文档为准 |
| 配置持久化 | 都要 `save` 写入下次启动配置；`commit` 只让运行配置生效，不等于已保存 | 同左：两种生效模式都需 `save` 落盘，不 save 重启即丢 |
| 堆叠/多机虚拟化 | 支持 iStack/CSS 等堆叠与多机虚拟化（随型号） | 路由器无 iStack 堆叠概念；NE 的集群类特性以对应平台产品文档为准 |

两阶段配置是 VRP V8 平台的特性（CE 数据中心系列、CloudEngine S V600 与 NE 路由器），经典 S 系列 V200R 与经典 AR 路由器为即时生效模式；无论哪种模式，`save` 才是持久化动作。

## 高危操作 ⚠️

- ⚠️ `reset saved-configuration`：清空启动配置，误执行并重启后设备空配置失联，操作前必须导出备份。
- ⚠️ `reboot`：中断业务；先 `save` 并与团队确认变更窗口。
- ⚠️ Console 未启用认证（authentication-mode none）时，物理接触即可完全控制设备，生产环境禁止。

## 参考来源

1. [华为产品文档 · save 命令（保存当前配置）（support.huawei.com）](https://support.huawei.com/hedex/api/pages/EDOC1100087046/AZJ0324D/12/resources/dc/save.html)
2. [华为企业支持文档 EDOC1000041691（support.huawei.com）](https://support.huawei.com/enterprise/zh/doc/EDOC1000041691/a0f4f7e4)
3. [华为企业支持文档 EDOC1100383073（support.huawei.com）](https://support.huawei.com/enterprise/zh/doc/EDOC1100383073/135b2760)
4. [华为产品文档 · 选择命令行配置生效模式（立即生效、两阶段生效）（support.huawei.com）](https://support.huawei.com/enterprise/zh/doc/EDOC1100389671/b6bc6158)
