> **⚠️ 已废弃（Deprecated）**：KBLoader 热插拔方案（流式加载、LRU 缓存、事件总线、registerModule）从未落地，已被只读 `kb_lookup` 工具与 DSH 官方 `ctx.skills` provider 机制取代。仅作历史归档，请勿据此实现。

# 🔄 插件开发交接：v0.2.1 热插拔知识库

## 当前状态
- ✅ v0.1.7 流式加载 + LRU 缓存 + 事件总线已实现
- ✅ v0.1.8 模块化重构（每个厂商/主题独立 .mjs）
- ✅ v0.1.9 批量预加载 + 性能监控
- 🚧 v0.2.0 运行时热插拔 + 跨插件共享（待完成）
- 📌 v0.2.x 热插拔方案（KBLoader、registerModule、SharedKBLoader、kb-v2）已被轻量 `kb_lookup`（vendor → 目录 → 单节）方案取代，待 owner 确认后正式关闭。

## 核心目标
**按需加载 + 流式分块 + 事件驱动 + 上下文缓存**

## 关键 API
```javascript
// 1. 按需加载
const data = await kb_loader.load('huawei', 'static-route', { lazy: true });

// 2. 流式处理
for await (const chunk of kb_loader.stream('huawei', 'static-route', { chunkSize: 100 })) {
  // 边处理边渲染
}

// 3. 事件监听
kb_loader.on('kb-load', (data) => { /* 实时更新 */ });

// 4. 批量预加载
await kb_loader.preload([['cisco-ios', 'ospf']]);
```

## 待完成：v0.2.0 热插拔
- 运行时注册新模块：`registerModule(module)`
- 跨插件共享：`SharedKBLoader` 支持多 agent
- 缓存同步：基于 agentId 的 LRU 缓存

## 测试命令
```bash
npm test # 单元测试
npm run validate # 知识库结构校验
```

## 关键文件
- `lib/kb-loader.mjs` - 核心加载器
- `lib/lru.mjs` - LRU 缓存
- `index.js` - 插件注册
- `kb-v2/modules/` - 模块化结构

## 下一步
完成 `registerModule()` 和 `SharedKBLoader` 实现，支持运行时注册新模块和跨插件缓存同步。
