# Changelog

本项目遵循语义化版本；上游基线为 `dsh-network-engineer 0.1.0`。

## 0.1.1 — 2026-10-31

社区延续版本，修复上游 issue #3 并完成知识库扩展。

### Fixed

- **技能资源基目录错位**：`index.js` 的 `resourceBase.path` 从 `skills/network-command-kb/`
  改为插件包根目录，`SKILL.md` 里的 `kb/...` 相对路径现在能正确解析到随包分发的知识库。
- **预设缺工具**：`preset-network-engineer-kb` 补齐 `tool-skill`、`skill-filesystem`、
  `tool-fs-search`、`agent-instructions`、`time-context`、`tool-bash`/`tool-pwsh`、
  `tool-ask-user`、`tool-todo`、`tool-web`、`present` 与 compaction 组；此前该预设下
  没有 `skill` 工具、没有 grep/glob、AGENTS.md 不生效。
- **persona 变量失效**：删除未注册的 `{{cwd}}` 变量，避免 0.2.x 下预设激活失败。
- **知识库结构缺陷**：统一 96 篇文档的 5 节结构、`- ⚠️` 高危条目格式、表格列数与
  frontmatter 字段；补全 `sources` 与「参考来源」链接。

### Added

- 知识库新增 8 厂商 64 篇：Cisco IOS/IOS-XE、Cisco NX-OS、Juniper Junos、Arista EOS、
  Fortinet FortiOS、ZTE ZXR10、VyOS、MikroTik RouterOS；合计 **12 厂商 / 96 篇**。
- `tools/kb-validate.sh`：12 厂商知识库结构与规范校验器（frontmatter、固定五节、
  速查表行数/列数、高危 ⚠️、来源链接、篇幅、主题齐全性）。
- `test/`：Node 原生测试套件，覆盖插件单元行为、打包清单、预设组合、知识库结构、
  locale/icon 元数据、跨厂商选路数值一致性。
- `locale/en.json`、`locale/zh.json`、`icon.svg`：插件管理器的显示元数据与原创图标。
- `NOTICE.md`：上游来源引用与致谢、本仓库变更清单。

### Changed

- 包名改为 `@kinggkl/dsh-network-engineer`（避免与原作者 npm 包同名冲突），
  版本沿用上游序列 `0.1.1`；插件行 id 为 `network-engineer-kb`，预设 id 为
  `network-engineer-kb`（显示名仍为「网络工程师助手」）。
- persona 升级到 12 厂商；补充 VyOS 的 commit/save 模型与 MikroTik RouterOS 的
  菜单路径 / v6→v7 差异说明；README、`kb/README.md`、`SKILL.md` 同步为 96 篇。

### Accuracy corrections (independent KB audit + official-manual re-check)

独立内容审计（`findings/kb-audit-report.md`）与逐篇官方手册复核后修正的实质性错误：

- **迪普 dptech**（对照官方 LSW3600 v2.0 / LSW5662 v5.1 PDF 手册）：静态路由是 `ip route` 而非
  `ip route-static`；设备命名用 `sysname`（非 `hostname`）；退出配置用 `exit`/`end`；保存用 `write file` /
  `configuration save` / `configuration rollback` / `configuration clear-all`；VLAN 接口为 `interface vlan-if 10`；
  批量建 VLAN 为 `vlan 10 to 20`；链路聚合是 `bond` 体系（`bond mode static|dynamic`），非
  eth-trunk/channel-group；ACL 是 `acl mode ipv4` + `stage icap` + 数字优先级 `rule ... deny|permit`；
  LSW 平台无 NAT（已从 ACL 篇移除并说明）。
- **Fortinet**：静态路由回显格式为 `[distance/metric]`（原 `[distance/priority]` 写错）；
  `set priority` 取值 min 1 / default 1（7.2.1 CLI Reference），并注明 8.0.x 文档正文的 default 0 不一致。
- **Cisco NX-OS**：`ip route <前缀/长度> <下一跳> [preference]` 的末尾参数就是 AD（官方称
  Administrative distance，CLI 回显称 preference），修正「关键字是 preference、不是 IOS distance」的矛盾表述。
- **Huawei / Ruijie**：把不可核正文的 `gitgit.ee` 停放页来源替换为 support.huawei.com HedEx 章节正文页、
  ruijie.com.cn 官方文档页；补齐 huawei-02/04 与 ruijie-04/08 的官方来源，保持 `verified: high` 可佐证。
- **VyOS**：`load` 支持 scp/sftp/ftp/http/https/tftp 全协议；OSPF「官方推荐接口方式」按官方原文改为
  「更方便（more convenient）」；版本依据写准为「命令依据 1.4 LTS 文档」。
- **MikroTik**：删除 mikrotik-06 中的编辑草稿残留并统一 interface-template 语法；
  v6→v7 旧菜单差异改为「以官方迁移说明为准」；标注仅部分机型有 `/interface ethernet switch` 菜单。
- **ZTE**：替换失效的镜像 PDF 来源；**dptech-05 / zte-04 / fortinet-05** 的表述矛盾与来源问题见上。

### Removed

- 无。上游 32 篇文档内容保留，仅做结构与格式规范化。
