# dsh-network-engineer · 网络工程师助手（network-command-kb）

**English** — A DeepSeek Harness plugin that ships a standalone "网络工程师助手" (Network Engineer Assistant)
agent preset plus a **12-vendor / 96-document** command knowledge base: Huawei VRP, H3C Comware, Ruijie RGOS,
DPtech CLI, Cisco IOS/IOS-XE and NX-OS, Juniper Junos, Arista EOS, Fortinet FortiOS, ZTE ZXR10, VyOS and
MikroTik RouterOS. It covers vendor command reference, cross-vendor translation, routing-priority analysis,
screenshot reading and online manual lookup, and only answers networking topics.

> **社区延续版本 v0.1.2。** 本项目基于 [sososilencing/dsh-network-engineer](https://github.com/sososilencing/dsh-network-engineer)
> 0.1.0（MIT）重构：修复上游 issue #3 的 skill 注册路径与预设工具链缺陷，新增 8 个厂商 64 篇文档，
> 把知识库扩展到 12 厂商 / 96 篇。原作者的插件骨架、预设思路与首批 4 厂商 32 篇文档是这条工作的基础，
> 来源与致谢见 [NOTICE.md](NOTICE.md)。

---

## 它是什么

一个插件包同时提供三件事：

| 组成 | 说明 |
|---|---|
| **插件模块** | `index.js` 在 `ctx.skills` 注册 `network-command-kb` 技能，resource base 指向包根，`kb/` 随插件分发 |
| **技能 `network-command-kb`** | 12 厂商 × 8 主题 = 96 篇命令参考，Agent 加载技能后按「厂商 + 主题」检索 |
| **预设「网络工程师助手」** | DSH 预设切换器里独立出现；带完整工具链（skill / grep / glob / read_image / bash / web），只答网络工程主题 |

## 功能

- **预设 Agent「网络工程师助手」**：安装后出现在桌面端 / Web 的预设切换器中，选中即用；只回答网络工程主题，其他话题礼貌拒答。
- **内置知识库（96 篇 / 十二厂商）**：每厂商 8 主题（01 系统管理、02 VLAN 与二层、03 接口、04 链路聚合、05 静态路由、06 OSPF、07 ACL、08 远程管理与诊断），以技能形式随插件分发。
- **跨厂商命令对照 + 选路数值差异**：华为/新华三 preference、Cisco 系 AD、Junos preference、FortiOS distance 等分属不同数值体系，文档与 persona 都明确提醒不能直接比大小。
- **联网查手册**：知识库未覆盖的型号/版本差异自动联网检索官方文档并注明来源；禁止编造命令与参数。
- **风险标注**：`reboot` / `format` / `erase` / `factoryreset` / `reset-configuration` 等高危命令自动附 ⚠️ 风险提示、备份建议与维护窗口提醒。
- **工程质量**：自带知识库校验器（`tools/kb-validate.sh`）与 Node 原生测试套件（`test/`），覆盖插件行为、打包清单、预设组合、知识库结构、跨厂商一致性。

## 安装

**方式一（发布后）**：npm 安装 scoped 包，或经 [dshmarket](https://dshmarket.com) / awesome-dsh-plugin 目录安装。

**方式二（本仓库开发版）**：用 Harness 的 Plugin Manager 安装本地目录：

```text
plugin_manager: { action: "install_bundle", target: "/path/to/dsh-network-engineer" }
```

**方式三（手动）**：把本目录放进 profile 的 `node_modules/`，并在 profile 的 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: network-engineer-kb
      name: '@kinggkl/dsh-network-engineer'
```

### 与上游 0.1.0 共存时（重要）

本包与原版同名预设/技能，若原版 `dsh-network-engineer` 仍安装在 profile 中，请在 profile 的
`cordis.patch.yml` 里禁用它的两行，否则会出现两个同名预设、`network-command-kb` 技能重复注册
（按 first-wins 规则可能命中旧版 80 篇知识库）：

```yaml
- id: network-engineer
  disabled: true
- id: preset-network-engineer
  disabled: true
```

或者干脆从 profile 卸载原版包。禁用是幂等、可回退的。

> ⚠️ 顺序很重要：请**先禁用/卸载上游两行，再安装本插件**。若本插件先装、上游后禁用，
> 两个插件在同一个 global 层重复注册 `network-command-kb` 技能名，按 first-wins 规则本插件
> 的注册会变成 no-op；随后禁用上游会让该技能彻底消失，需要把本插件的 `network-engineer-kb`
> 行禁用再启用一次（或重装）才能重新注册。

## 使用

1. 新会话选择预设 **网络工程师助手**。
2. 直接提问，例如：
   - 「华为交换机怎么把端口划进 VLAN 10」「把这段 H3C 配置转成锐捷」
   - 「Cisco Nexus 的 OSPF 为什么邻居起不来」「Junos 的静态路由优先级怎么算」
   - 「VyOS 的配置为什么重启后丢了」「RouterOS v7 的 OSPF 邻居怎么配」「MikroTik 静态路由 distance 怎么设」
   - 「帮我看这张拓扑图」「分析这条路由为什么不通」
3. Agent 会先查内置知识库，再联网核实；迪普（公开资料有限）、中兴（官方手册获取受限）相关部分标注
   `verified: medium`，回答会提示以官方手册为准。

## 知识库

```
kb/
├── huawei/     华为 VRP（8 篇）
├── h3c/        新华三 Comware V5/V7（8 篇）
├── ruijie/     锐捷 RGOS（8 篇）
├── dptech/     迪普自有 CLI（8 篇，verified: medium）
├── cisco-ios/  思科 IOS / IOS-XE（8 篇，1 篇 medium）
├── cisco-nxos/ 思科 NX-OS（8 篇）
├── juniper/    瞻博 Junos（8 篇）
├── arista/     Arista EOS（8 篇）
├── fortinet/   飞塔 FortiOS（8 篇）
├── zte/        中兴 ZXR10 ROSNG / ZROS（8 篇，verified: medium）
├── vyos/       VyOS 1.4 LTS / 1.5 rolling（8 篇）
├── mikrotik/   MikroTik RouterOS v7（8 篇）
└── README.md   总览、厂商索引、跨厂商选路数值对照与 RAG 导入指南
```

每篇含 YAML frontmatter（vendor/os/topic/devices/keywords/sources/verified/updated）、
命令速查表（功能/命令/视图/说明）、典型示例、陷阱与版本差异、高危操作 ⚠️、参考来源。
资料整理自官方手册与高可信社区页面，每篇 `sources` 均为撰写时实际抓取/核对过的 URL；
`verified: medium` 表示官方资料不足，正文已就地标注「以官方手册为准」。

跨厂商选路数值速查（细节以各厂商 05 号文档为准）：

| 厂商 | 静态路由缺省优先级 | OSPF 缺省优先级 | 体系 |
|---|---|---|---|
| 华为 VRP / 新华三 Comware | preference 60 | preference 10 | 小值优先，OSPF 胜 |
| 锐捷 RGOS / Cisco IOS-IOS-XE / NX-OS / Arista EOS | AD 1 | AD 110 | Cisco AD，静态胜 |
| Juniper Junos | preference 5 | preference 10（外部 150） | 小值优先 |
| Fortinet FortiOS | distance 10 | distance 110 | FortiOS 体系，静态胜 |
| VyOS（FRR） | distance 1 | distance 110 | FRR 体系，静态胜 |
| 迪普 / 中兴 / MikroTik | 以 `kb/<vendor>/*-05-static-route.md` 为准 | 同左 | 各厂商自有体系 |

> 华为/新华三的 preference 与 Cisco AD 不是同一套数值，不能直接比大小；跨厂商迁移时先换算再讨论「谁更优」。

## 与上游 0.1.0 的差异

详见 [CHANGELOG.md](CHANGELOG.md)。摘要：

1. **修 `resourceBase`**：指向包根（`kb/` 实际位置），不再指向 `skills/network-command-kb/`（上游 issue #3 B）。
2. **补预设工具链**：`tool-skill`、`skill-filesystem`、`tool-fs-search`、`agent-instructions`、
   `time-context`、`tool-bash`/`tool-pwsh`、`tool-jobs` 等（上游 issue #3 A）；删掉未注册的 `{{cwd}}` 变量。
3. **知识库 32 篇 → 96 篇**：新增 Cisco IOS/IOS-XE、Cisco NX-OS、Juniper Junos、Arista EOS、
   Fortinet FortiOS、ZTE ZXR10、VyOS、MikroTik RouterOS 八家。
4. **新增工程质量设施**：`tools/kb-validate.sh` 校验器、`test/` 测试套件、`locale/`、`icon.svg`、`NOTICE.md`。

## 目录结构

```
dsh-network-engineer/
├── package.json           # dsh.bundle.patch 声明、exports（含 locale/icon）、files 清单
├── cordis.patch.yml       # 插件行 + 「网络工程师助手」预设行（完整工具链 + persona）
├── index.js               # 注册 network-command-kb 技能（resourceBase = 包根）
├── skills/network-command-kb/SKILL.md
├── kb/                    # 12 厂商 × 8 主题 = 96 篇命令知识库 + README
├── locale/{en,zh}.json    # 插件管理器显示名称与说明
├── icon.svg               # 原创图标
├── tools/kb-validate.sh   # 知识库结构校验器
├── test/                  # Node 原生测试
├── README.md / NOTICE.md / CHANGELOG.md / LICENSE
```

## 测试

```bash
cd dsh-network-engineer
npm install            # 安装 devDependency（js-yaml，仅测试用）
npm test               # 插件单元 + 打包 + 预设组合 + 知识库结构 + 跨厂商一致性
npm run validate       # 12 厂商 96 篇文档结构校验
```

测试范围：

| 测试文件 | 覆盖 |
|---|---|
| `test/plugin.test.mjs` | `apply()` 注册的 skill 形状、resourceBase 指向包根、SKILL.md 缺失/非法/知识库缺失三种降级路径 |
| `test/package.test.mjs` | package.json/exports/files、dsh.bundle.patch、locale 元数据、icon 合法性、真实 `npm pack` 清单、来源致谢存在性 |
| `test/patch.test.mjs` | cordis.patch.yml 可解析、插件行/预设行结构、预设必备工具齐备、persona 无未注册变量、12 厂商均在 persona 中 |
| `test/kb.test.mjs` | 12 厂商 × 8 主题齐全、frontmatter 8 字段与 vendor/topic 交叉一致、五节唯一且非空、速查表行数/列数、高危 ⚠️、官方来源、篇幅 |
| `test/consistency.test.mjs` | README/SKILL/persona/package.json 的厂商与篇数一致、跨厂商选路数值与文档一致 |

## 发布（维护者）

1. `npm publish --access public`（scoped 包 `@kinggkl/dsh-network-engineer`；如需换名，改 `package.json.name`
   并在 `cordis.patch.yml` 的插件行同步）。
2. 推送到 GitHub 仓库并打 tag：`git tag v0.1.2 && git push origin v0.1.2`。
3. 向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 目录提交一条条目；
   [dshmarket](https://dshmarket.com) 通常随后自动收录（详见 `NOTICE.md` 与仓库 Issues）。

## 兼容性

- DSH 0.2.x（bundle patch + `@deepseek-ai/dsh-agent-preset` 声明式预设）；
- 预设里 `tool-bash`/`tool-pwsh` 按平台二选一（`!!js process.platform`），Linux/macOS 走 bash，Windows 走 pwsh；
- `read_image` 需要 durable attachment store 与支持图像输入的模型（DSH 默认组成已具备）。

## 已知限制

- **迪普 / 中兴**：公开资料有限，`dptech/`、`zte/` 恒为 `verified: medium`；中兴部分篇目因官方站需登录，
  使用官方手册的可用镜像并在正文/参考来源中显式标注（如 `zte-04-link-aggregation`）。
- **FortiOS 官方文档自身存在不一致**（如静态路由 `priority` 默认值 7.x CLI Reference 为 1、8.x 管理指南正文写 0，
  回显格式 `[distance/metric]` 与 `[priority/weight]` 的表述），文档已双向标注、以设备回显/官方 CLI Reference 为准。
- **型号/版本差异**无法穷尽（NX-OS `feature` 集合、Junos EX 与 MX、FortiOS 6.x/7.x、VyOS 1.3/1.4、RouterOS v6/v7），
  各篇「陷阱与版本差异」已列主要差异点，落地前仍应核对对应版本官方手册。

## 来源、致谢与许可

- 上游：[sososilencing/dsh-network-engineer](https://github.com/sososilencing/dsh-network-engineer)（MIT，0.1.0），
  感谢原作者与所有原始贡献者；本文档保留上游版权声明。
- 本仓库：kinggkl/dsh-network-engineer，维护者 kinggkl。
- 完整来源引用、变更清单与商标声明见 [NOTICE.md](NOTICE.md)；许可见 [LICENSE](LICENSE)（MIT）。
