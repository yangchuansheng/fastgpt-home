---
title: 解决FastGPT开发模式下内存占用过高的问题
slug: /zh/troubleshoot/fastgpt-dev-high-memory
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7177
source_type: GitHub issue
---

# 解决FastGPT开发模式下内存占用过高的问题

## 现象
使用FastGPT 14.14 main分支，执行pnpm dev或pnpm dev start app启动应用后，系统内存占用飙升至2GB，对比同类前端应用在相同环境下启动后的内存占用仅约200MB。

## 可能原因
目前可推测的潜在关联方向包括开发模式的热更新机制、内置开发调试工具的资源占用，或项目依赖加载逻辑异常。具体原因需结合实际环境进一步确认。

## 排查步骤
1.  确认当前使用的FastGPT版本为14.14 main分支，执行对应启动命令（pnpm dev 或 pnpm dev start app）。
2.  监控系统内存使用情况，记录内存占用峰值数据。
3.  在相同环境下启动同类前端应用，对比内存占用差异。
4.  查看项目启动日志，排查是否存在异常加载提示或报错信息。

## 解决与验证
目前暂无通用固定解决方案，可尝试以下方向排查优化：
1.  临时禁用开发模式下的热更新相关插件或功能，观察内存占用变化。
2.  检查项目依赖包，清理重复加载或冗余的依赖项。
3.  切换至生产构建模式启动应用，对比内存占用情况。
若内存占用回落至合理范围，则说明问题与开发模式下的特定机制相关。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7177)
