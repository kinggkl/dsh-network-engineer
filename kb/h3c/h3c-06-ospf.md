---
vendor: 新华三（H3C）
os: Comware V5/V7
topic: OSPF
devices: S 系列交换机、MSR 路由器等 Comware 设备
keywords: [ospf, router-id, area 0, network 反掩码, bandwidth-reference, display ospf peer, import-route, default-route-advertise, filter-policy, authentication-mode]
sources:
  - "https://www.h3c.com/cn/d_201906/1208038_30005_0.htm"
  - "https://www.h3c.com/cn/d_200711/317166_30005_0.htm"
  - "https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command"
verified: high
updated: 2026-10-15
---

# 新华三 · OSPF

> 适用于 H3C Comware V5/V7 的 OSPF 单区域/多区域配置、外部路由引入、默认路由发布与区域认证。Comware 支持 OSPF 多进程，进程号取值 1～65535，进程号是本地概念（官方命令参考）。

## 命令速查

| 功能 | 命令 | 视图 | 说明 |
|---|---|---|---|
| 创建 OSPF 进程 | ospf 1 router-id 1.1.1.1 | 系统视图 | 建议手工指定 router-id 并全网唯一；`ospf [进程号 [router-id <id>]]` |
| 进入区域视图 | area 0 | OSPF 视图 | 骨干区域固定为 0（显示为 0.0.0.0） |
| 宣告网段 | network 192.168.1.0 0.0.0.255 | OSPF 区域视图 | 用反掩码（通配符），接口地址命中即激活 |
| 接口开销 | ospf cost 10 | 接口视图 | 改单接口开销影响选路 |
| 参考带宽 | bandwidth-reference 1000 | OSPF 视图 | 单位 Mbps，缺省 100；全网建议统一 |
| 查看邻居 | display ospf peer | 用户/任意视图 | `display ospf peer brief` 看邻居简表，状态需为 Full |
| 引入外部路由 | import-route static | OSPF 视图 | 可带 cost/type/tag/route-policy 参数（官方命令参考）；引入后为 Type-5 |
| 发布默认路由 | default-route-advertise | OSPF 视图 | 本机需已有活动默认路由；`always` 强制发布（以官方手册为准） |
| 过滤接收的路由 | filter-policy 2000 import | OSPF 视图 | 只过滤 OSPF 计算出的路由，不过滤 LSA |
| 过滤发布的路由 | filter-policy 2000 export | OSPF 视图 | 主要过滤引入（import-route）的路由 |
| 区域认证 | authentication-mode md5 1 cipher H3c@2026 | OSPF 区域视图 | 两端必须一致；接口下可用 ospf authentication-mode（以版本手册为准） |
| 查看链路状态数据库 | display ospf lsdb | 用户/任意视图 | 排查 LSA 泛洪/缺失 |
| 重启 OSPF 进程 | reset ospf 1 process ⚠️ | 用户视图 | 改 router-id 等参数后生效用，邻居全部重算 |

## 典型示例

```
<Sysname> system-view
[Sysname] ospf 1 router-id 1.1.1.1
[Sysname-ospf-1] area 0
[Sysname-ospf-1-area-0.0.0.0] network 10.0.0.0 0.0.0.255
[Sysname-ospf-1-area-0.0.0.0] network 192.168.1.0 0.0.0.255
[Sysname-ospf-1-area-0.0.0.0] authentication-mode md5 1 cipher H3c@2026
[Sysname-ospf-1-area-0.0.0.0] quit
[Sysname-ospf-1] bandwidth-reference 1000
[Sysname-ospf-1] import-route static
[Sysname-ospf-1] default-route-advertise
[Sysname-ospf-1] quit
[Sysname] interface GigabitEthernet 1/0/1
[Sysname-GigabitEthernet1/0/1] ospf cost 10
[Sysname-GigabitEthernet1/0/1] quit
[Sysname] quit
<Sysname> display ospf peer brief
```

## 陷阱与版本差异

- `network` 必须用反掩码：0 精确匹配、1 任意。宣告漏网段是最常见的「邻居能起但学不到路由」原因，用 `display ospf interface`（以版本手册为准）核对接口是否激活。
- `filter-policy import` 只影响本机路由计算——LSA 仍会正常泛洪并进入 LSDB，下游路由器照样收到；要控制泛洪需用其他手段（官方文档口径，勿当成 LSA 过滤器）。
- `default-route-advertise` 不带 `always` 时本机必须有活动默认路由才发布；排查「下游没有默认路由」时先查本机路由表。
- 区域视图提示符为 `[Sysname-ospf-1-area-0.0.0.0]`；区域认证与接口认证同时配置时以接口为准（以版本手册为准）。
- 修改 router-id 不会立即生效，需 `reset ospf <进程号> process` 重启进程；router-id 冲突会引发路由震荡。
- V5/V7 命令主体一致；认证的加密算法选项（md5/hmac-md5 等）与 key-id 写法随版本有差异（以版本手册为准）。

## 高危操作 ⚠️

- ⚠️ `reset ospf 1 process`：重启进程，全部邻居断开重算，业务路由短暂中断，维护窗口执行。
- ⚠️ `undo ospf <进程号>`：删除整个进程及全部 OSPF 配置，直接断网。
- ⚠️ `import-route` 引入大量路由（如直连全部网段）且未配 cost/类型控制：LSA 规模暴涨，可能拖垮低端设备。
- ⚠️ 变更区域认证或认证密码：两端不一致时邻居全部断开，变更需两端联动并回退预案。

## 参考来源

1. [04-OSPF命令 - 新华三集团-H3C](https://www.h3c.com/cn/d_201906/1208038_30005_0.htm)
2. [H3C S3600 系列以太网交换机操作手册-路由协议操作 - 新华三集团-H3C](https://www.h3c.com/cn/d_200711/317166_30005_0.htm)
3. [H3C Comware V7 命令手册（官网命令参考入口）](https://www.h3c.com/cn/Service/Document_Software/Document_Center/Home/Switches/00-Public/Command/Command_Manual/ComwareV7_Command)
