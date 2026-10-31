# NOTICE · 来源与致谢

本仓库是社区延续版本（v0.1.1），基于 **sososilencing/dsh-network-engineer 0.1.0**（MIT）重构而来。
原作者的插件骨架、预设与 persona 提示词、以及首批 4 厂商 32 篇命令知识库是这条工作的基础，
在此明确引用出处并向原作者及所有原始贡献者致谢。

## 上游项目

- 仓库：https://github.com/sososilencing/dsh-network-engineer
- 版本：0.1.0（MIT License，Copyright (c) 2026 dsh-network-engineer contributors）
- 沿用内容：插件包结构（package.json / cordis.patch.yml / index.js）、`network-command-kb`
  技能骨架、「网络工程师助手」预设与 persona 思路、`kb/huawei/`、`kb/h3c/`、`kb/ruijie/`、
  `kb/dptech/` 四个目录共 32 篇基础命令知识库。

## 本仓库（kinggkl/dsh-network-engineer）

- 维护者：kinggkl（GitHub：https://github.com/kinggkl）
- 版本：0.1.1（2026-10-31）
- 新增知识库：`kb/cisco-ios/`、`kb/cisco-nxos/`、`kb/juniper/`、`kb/arista/`、
  `kb/fortinet/`、`kb/zte/`、`kb/vyos/`、`kb/mikrotik/` 八个目录共 64 篇；
  知识库合计 **12 厂商 / 96 篇**。
- 修复上游 issue #3：
  1. `index.js` 的 `resourceBase` 由 `skills/network-command-kb/` 改为包根，与 `kb/` 实际位置一致；
  2. 预设在原有工具集基础上补挂 `tool-skill`、`skill-filesystem`、`tool-fs-search`、
     `agent-instructions`、`time-context`、`tool-bash`/`tool-pwsh`、`tool-jobs` 等，
     使技能目录、grep/glob、AGENTS.md 在该预设下真正生效；
  3. 删除 persona 中未注册的 `{{cwd}}` 变量，避免预设激活失败。
- 新增工程质量设施：`tools/kb-validate.sh` 结构校验器、`test/` 下的 Node 原生测试
  （插件单元、打包、预设组合、知识库结构、跨厂商一致性）、`CHANGELOG.md`。
- 安装元数据：`locale/en.json`、`locale/zh.json`（插件管理器中显示的名称与说明）与
  `icon.svg`（本仓库原创图标）。

## 知识库来源

每篇命令文档的 frontmatter `sources` 字段列出整理时实际抓取/核对的官方文档或高可信来源 URL；
正文末尾「参考来源」节同样列出。`verified: high` 表示主干命令有官方手册佐证，
`verified: medium` 表示公开资料有限、仅作方向参考（回答时须提示以官方手册为准）。

## 商标

华为、新华三、锐捷、迪普、思科、瞻博、Arista、飞塔、中兴、VyOS、MikroTik 等
名称与商标归各自权利人所有；本项目仅作命令语法整理与教学参考，与各厂商无隶属关系。

## 许可

本仓库沿用上游 MIT License；完整许可文本见 [LICENSE](LICENSE)。
