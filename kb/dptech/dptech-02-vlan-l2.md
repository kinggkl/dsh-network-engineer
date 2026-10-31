---
vendor: 迪普（DPtech）
os: DPtech 自有 CLI
topic: VLAN 与二层特性
devices: LSW 系列交换机（LSW6600/5662/5620/3620/3600/3000 等）、XR 系列路由器
keywords: [迪普, DPtech, VLAN, trunk, access, hybrid, port-security, port-isolate, 端口隔离, 端口安全]
sources:
  - https://download.dptech.com:9443/file/down/public/5276
  - https://download.dptech.com:9443/file/down/public/7558
  - https://zhuanlan.zhihu.com/p/1947252969780277295
verified: medium
updated: 2026-10-31
---

# 迪普 · VLAN 与二层特性

> ⚠️ 迪普二层用 `switchport` 关键字（同 Cisco 风格），但批量建 VLAN 用 `to`、端口隔离用 `port-isolate` + `switchport protected`，与华为 `port link-type`、Cisco `switchport protected` 均有差异。以下命令已按迪普官方《LSW3600 系列以太网交换机命令手册 v2.0》《LSW5662 系列以太网交换机命令典型配置手册 v5.1》核对，其他型号/版本以官方手册为准。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建/进入单个 VLAN | vlan 10 | 配置视图 | 已创建则直接进入 VLAN 视图 |
| 批量创建 VLAN | vlan 10 to 20 | 配置视图 | 用关键字 to，不是空格分隔 |
| VLAN 描述 | description office | VLAN 视图 | ≤24 字符，缺省为 VLAN <id> |
| VLAN 视图划入端口 | port gige0_1 to gige0_3 | VLAN 视图 | 把端口改为 Access 并加入当前 VLAN |
| 端口模式 | switchport mode access/trunk/hybrid | 物理/聚合接口视图 | Trunk 与 Hybrid 不能直接互切 |
| Access 口划入 VLAN | switchport access vlan 10 | 物理/聚合接口视图 | VLAN 必须先创建 |
| Trunk 放行 VLAN（覆盖） | switchport trunk allowed vlan 15-18,60 | 物理/聚合接口视图 | 不带 add/remove 即整条覆盖 |
| Trunk 增量放行 VLAN | switchport trunk allowed vlan add 20 | 物理/聚合接口视图 | 在现有列表上追加，推荐 |
| Trunk 移除放行 VLAN | switchport trunk allowed vlan remove 20 | 物理/聚合接口视图 | 从放行列表剔除 |
| Trunk Native VLAN | switchport trunk native vlan 60 | 物理/聚合接口视图 | 两端必须一致 |
| Hybrid tagged VLAN | switchport hybrid allowed vlan 10-20 tagged | 物理/聚合接口视图 | 报文带 Tag 转发 |
| Hybrid untagged VLAN | switchport hybrid allowed vlan 30-40 untagged | 物理/聚合接口视图 | 报文去 Tag 转发 |
| 创建端口隔离组 | port-isolate 1 | 配置视图 | 隔离组号 0~31 |
| 端口加入隔离组 | switchport protected 1 | 物理接口视图 | LSW3600 手册要求带组号，LSW5662 示例不带组号 |
| 查看端口隔离组 | show port-isolate 1 / show port-isolate all | 用户视图 | 核对隔离组与端口列表 |
| 开启端口安全 | switchport port-security | 物理接口视图 | 缺省关闭 |
| 安全 MAC 静态绑定 | switchport port-security mac-address <MAC> vlan <id> | 物理接口视图 | MAC + VLAN 绑定 |
| 安全 MAC 自动学习 | switchport port-security mac-address sticky | 物理接口视图 | 动态学习的安全 MAC |
| 最大学习 MAC 数 | switchport port-security maximum 100 | 物理接口视图 | 0~1024，缺省 1 |
| 配置违例动作 | switchport port-security violation restrict | 物理接口视图 | protect/restrict/shutdown，缺省 protect |
| 查看 VLAN | show vlan 2 | 用户视图 | 显示 Tagged/Untagged 端口 |
| 查看 MAC 表项 | show mac-address-table | 用户视图 | 定位终端接入端口 |

## 典型示例

```text
<DPTECH> conf-mode
[DPTECH] vlan 2 to 3                      ← 批量创建 VLAN 2~3
[DPTECH] vlan 10
[DPTECH-vlan10] description office        ← VLAN 描述（≤24 字符）
[DPTECH-vlan10] port gige0_1 to gige0_2   ← VLAN 视图把端口划为 Access
[DPTECH-vlan10] exit
[DPTECH] interface gige0_24               ← 上联口配 Trunk
[DPTECH-gige0_24] switchport mode trunk
[DPTECH-gige0_24] switchport trunk allowed vlan 2-3,10
[DPTECH-gige0_24] switchport trunk native vlan 10
[DPTECH-gige0_24] exit
[DPTECH] port-isolate 1                   ← 先创建端口隔离组
[DPTECH] interface gige0_3
[DPTECH-gige0_3] switchport protected 1   ← 端口加入隔离组 1
[DPTECH-gige0_3] switchport port-security
[DPTECH-gige0_3] switchport port-security maximum 5
[DPTECH-gige0_3] switchport port-security violation restrict
[DPTECH-gige0_3] exit
[DPTECH] write file                       ← 保存配置
[DPTECH] exit
<DPTECH> show vlan 10
<DPTECH> show port-isolate all
<DPTECH> show mac-address-table
```

## 陷阱与版本差异

- 批量建 VLAN 用关键字 `to`：`vlan 10 to 20`（LSW3600 手册 4.1.1）；`vlan 10 20` 这类空格分隔写法在官方命令手册中不存在，也不要用华为的 `vlan batch`；其他型号/版本以官方手册为准。
- 划口有两个入口：接口视图 `switchport access vlan 10`（4.1.5，要求 VLAN 已创建），或 VLAN 视图 `port gige0_1 to gige0_3`（4.1.3，会把端口改为 Access 并加入当前 VLAN）。
- Trunk 放行列表 `switchport trunk allowed vlan 15-18,60` 是整条覆盖；增量用 `add`、移除用 `remove`（4.1.6）。上联口误覆盖会切断业务 VLAN 与管理 VLAN。
- `switchport mode` 只有 access/trunk/hybrid 三种，且 Trunk 与 Hybrid 之间不能直接互切，必须先设为 Access 再改（4.1.4）。
- 端口隔离是两步：配置视图 `port-isolate <0-31>` 建组，物理口 `switchport protected <组号>` 入组（3.6.1/3.6.2）；LSW5662 v5.1 典型配置案例中写作不带组号的 `switchport protected`，属版本差异，以实际版本官方手册为准。
- 端口安全缺省关闭，需先 `switchport port-security`；违例动作枚举为 protect/restrict/shutdown，缺省 protect，最大学习 MAC 数缺省 1（7.4.1~7.4.5）；端口安全无专用 show 命令，以 MAC 表项与端口转发情况核对（以官方手册为准）。

## 高危操作 ⚠️

- ⚠️ no vlan 10 删除 VLAN：其下 Access 端口失去所属 VLAN、SVI/Trunk 引用失效，业务中断；删除前用 show vlan 确认无端口与 VLAN 接口引用。
- ⚠️ 上联 Trunk 用整条覆盖 allowed vlan：漏写管理 VLAN 会切断远程管理通道，优先用 add/remove 增量修改。
- ⚠️ switchport port-security violation shutdown：违规即关闭端口，误配在上行/级联口会断整段业务；先在接入口小范围验证。
- ⚠️ 修改 Native VLAN 或端口隔离组：两端 Native VLAN 不一致会造成跨交换机流量错路，隔离组误配会导致合法互访被阻断；变更前记录原配置（show running-config）。

## 参考来源

1. [迪普 LSW3600 系列以太网交换机命令手册 v2.0（4.1 VLAN 基础命令、3.6 端口隔离、7.3 MAC、7.4 端口安全）](https://download.dptech.com:9443/file/down/public/5276)
2. [迪普 LSW5662 系列以太网交换机命令典型配置手册 v5.1（端口隔离、QinQ 等二层案例）](https://download.dptech.com:9443/file/down/public/7558)
3. [迪普 DPtech 设备命令公开实践整理（知乎专栏）](https://zhuanlan.zhihu.com/p/1947252969780277295)
