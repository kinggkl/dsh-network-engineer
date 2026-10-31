---
vendor: 新华三（H3C）
os: Comware V5/V7
topic: 系统管理与视图
devices: S 系列交换机、MSR 路由器等 Comware 设备
keywords: [system-view, sysname, display version, display current-configuration, save, reboot, reset saved-configuration, startup saved-configuration, display this, 视图切换]
sources:
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command"
  - "https://www.cnblogs.com/PBDragon/p/18843131"
  - "https://cloud.tencent.com/developer/article/2514727"
verified: high
updated: 2026-10-15
---

# 新华三 · 系统管理与视图

> 适用于 H3C Comware V5/V7 设备（S 系列交换机、MSR 路由器等）的视图切换、配置保存与启动管理、设备命名与重启等基础操作。提示符约定：`< >` 为用户视图，`[ ]` 为系统视图及各配置视图。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 进入系统视图 | system-view | 用户视图 `<Sysname>` | 进入后提示符变为 `[Sysname]`，配置类命令均需在配置视图执行 |
| 返回上一级视图 | quit | 任意视图 | 可连续执行，逐级返回 |
| 直接返回用户视图 | return | 任意配置视图 | 等价于快捷键 Ctrl+Z |
| 修改设备名称 | sysname Core-SW | 系统视图 | 提示符同步变为 `[Core-SW]` |
| 查看软硬件版本 | display version | 用户视图 | 含型号、软件版本、开机时长、内存等 |
| 查看当前运行配置 | display current-configuration | 用户/任意视图 | 回显分页：空格翻页、回车逐行、Ctrl+C 中止 |
| 查看当前视图配置 | display this | 任意配置视图 | 仅显示当前视图下生效配置，非设备全量配置 |
| 保存配置 | save | 用户视图 | 写入存储介质上的启动配置文件；`save force` 可跳过确认（V7，以版本手册为准） |
| 查看已保存配置 | display saved-configuration | 用户视图 | 用于备份导出与运行/保存配置比对 |
| 指定下次启动配置文件 | startup saved-configuration flash:/config.cfg | 用户视图 | 文件需已存在于 Flash；路径随机型可能为 flash:/ 或 cfa0:/（以版本手册为准） |
| 查看启动配置信息 | display startup | 用户视图 | 确认主用/备用下次启动文件 |
| 删除已保存的启动配置 | reset saved-configuration ⚠️ | 用户视图 | 高危：清空已保存配置，重启后以空配置启动（见高危操作） |
| 重启设备 | reboot ⚠️ | 用户视图 | 高危：整机业务中断，需按提示二次确认 |
| 切换中文界面 | language-mode Chinese | 用户视图 | 部分新型号/新版本不再内置中文，切回英文用 language-mode English（以版本手册为准） |
| 接口恢复缺省配置 | default | 接口视图 | 一步清除该接口下所有非缺省配置，比逐条 undo 快且干净 |

## 典型示例

```
<Sysname> display version
<Sysname> system-view
[Sysname] sysname Core-SW
[Core-SW] interface GigabitEthernet 1/0/1
[Core-SW-GigabitEthernet1/0/1] description UpLink-to-Core
[Core-SW-GigabitEthernet1/0/1] display this
[Core-SW-GigabitEthernet1/0/1] default
[Core-SW-GigabitEthernet1/0/1] quit
[Core-SW] quit
<Core-SW> save
<Core-SW> display startup
```

## 陷阱与版本差异

- `display this` ≠ 全量配置：它只显示当前视图（如某接口下）的配置；查全量用 `display current-configuration`。
- `reset saved-configuration` 只影响「已保存」配置，不改变当前运行配置；执行后若要恢复需重新 `save` 或重新执行 `startup saved-configuration` 指定文件，否则重启后配置丢失（不同机型对无启动文件时的加载行为有差异，以版本手册为准）。
- 故障排查时的临时修改不要随手 `save`：`save` 会立即覆盖基线配置文件，回退只能靠备份。
- V5/V7 系统管理命令主体一致，但部分 display 输出字段、默认配置文件名（如 V7 常见 flash:/startup.cfg）与 V5 不同，具体以版本手册为准。
- 提示符体系与华为 VRP 相同（`< >`/`[ ]`），命令名相近但不可混用，例如 VLAN 批量创建 H3C 无 `vlan batch`（华为命令）。

## 高危操作 ⚠️

- ⚠️ `reboot`：整机重启、业务中断；重启前确认已 `save` 或明确不需要保存当前运行配置。
- ⚠️ `reset saved-configuration`：误操作后设备重启将回到空配置；执行前先 `display saved-configuration` 导出备份。
- ⚠️ `startup saved-configuration` 指向错误或损坏的文件：下次启动可能加载错误配置甚至启动失败。
- ⚠️ 生产环境 `save` 覆盖旧配置前，确认当前运行配置正确，并保留一份带日期后缀的备份文件。

## 参考来源

1. [H3C Comware V7 命令手册（官网命令参考入口）](https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command)
2. [H3C交换机常用命令 - PBDragon - 博客园](https://www.cnblogs.com/PBDragon/p/18843131)
3. [H3C华三2025最新交换机常用70条指令 - 腾讯云开发者社区](https://cloud.tencent.com/developer/article/2514727)
