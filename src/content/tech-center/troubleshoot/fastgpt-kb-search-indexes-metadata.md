---
title: 解决FastGPT知识库搜索无法返回indexes元数据的问题
slug: /zh/troubleshoot/fastgpt-kb-search-indexes-metadata
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7074
source_type: GitHub issue
---

# 解决FastGPT知识库搜索无法返回indexes元数据的问题

## 现象
FastGPT知识库搜索返回的结果中，无法包含indexes元数据字段。当需要通过indexes字段匹配权限、过滤搜索结果时，当前仅能逐条调用`http://localhost:3000/api/core/dataset/data/detail?id=65abd4b29d1448617cba61db`这类知识库详情接口获取该字段。当搜索结果数量较多时，该操作会导致性能下降，使用体验受影响。

## 可能原因
当前知识库搜索接口的返回结果未包含indexes元数据字段，也未提供可选配置项来输出该字段，无法直接通过搜索结果自带的indexes字段完成权限过滤操作。

## 排查步骤
1.  调用知识库搜索接口，查看返回结果的字段列表，确认是否存在indexes字段；
2.  调用知识库详情接口`http://localhost:3000/api/core/dataset/data/detail?id=65abd4b29d1448617cba61db`，确认该接口可返回indexes字段；
3.  统计当前业务场景下的搜索结果平均数量，评估逐条调用详情接口带来的性能损耗。

## 解决与验证
解决方向为向知识库搜索接口增加可选输出配置，支持返回indexes元数据字段；或在知识库引用模块中增加可选开关，用于输出indexes字段。验证步骤如下：
1.  完成配置后调用知识库搜索接口，确认返回结果中包含indexes字段；
2.  直接使用返回的indexes字段完成权限过滤，无需逐条调用详情接口；
3.  在大量搜索结果的场景下，验证接口调用性能是否符合预期。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7074)
