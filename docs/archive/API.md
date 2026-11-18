> **⚠️ 已废弃（Deprecated）**：KBLoader 热插拔方案（流式加载、LRU 缓存、事件总线、registerModule）从未落地，已被只读 `kb_lookup` 工具与 DSH 官方 `ctx.skills` provider 机制取代。仅作历史归档，请勿据此实现。

## KBLoader API 签名

```javascript
class KBLoader {
  constructor(options) { /* 参数见代码 */ }

  load(vendor, topic, options = {}) 
    // → Promise<{content, meta, version, cached, from}>

  stream(vendor, topic, options = {}) 
    // → AsyncGenerator<string>

  preload(items, options = {}) 
    // → Promise<Array<{success, data/error}>>>

  on(event, handler) 
    // → Function (unsubscribe)

  emit(event, data) 
    // → void

  registerModule(module) 
    // → void (运行时热插拔)

  getStats() 
    // → Object { loaded, cached, misses, hitRate }
}
```

## 关键行为
1. **流式读取**：使用 async iterator，支持中断 + 暂停
2. **LRU 缓存**：TTL + 容量限制，自动淘汰
3. **事件驱动**：发布 `kb-load` / `kb-cache-hit` / `kb-cache-miss`
4. **热插拔**：无需重启即可注册新模块
5. **跨插件共享**：基于 agentId 的缓存同步