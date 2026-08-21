---
title: FastGPT API创建知识库时配置标题加入索引的参数说明
slug: /zh/troubleshoot/fastgpt-api-title-index-params
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7395
source_type: GitHub issue
---

# FastGPT API创建知识库时配置标题加入索引的参数说明

## 现象
用户使用私有部署v4.15.4版本的FastGPT，通过调用`/api/core/dataset/collection/create/localFile`接口创建知识库集合并上传本地文档，希望开启索引增强中的“将标题加入索引”功能，但不清楚对应的API传参，也不确定该功能是否默认开启。用户提供的curl请求中已在`data`字段的JSON结构内写入`"indexPrefixTitle":true`，但需要确认该参数的正确性与实际功能效果。

## 可能原因
用户需要配置索引增强功能，但存在两处疑问：一是不清楚该功能对应的API参数名称，无法正确构造请求参数；二是不确定该功能是否为默认启用，缺少配置依据。部分使用者还可能错误将布尔参数用字符串引号包裹，导致参数无法被正确识别。

## 排查步骤
1. 确认调用的接口路径为`/api/core/dataset/collection/create/localFile`，该接口用于本地文件上传创建知识库集合。
2. 检查请求中`data`表单字段的JSON结构，需包含与索引配置相关的参数。
3. 查找与“将标题加入索引”功能对应的参数名称，该参数为`indexPrefixTitle`。
4. 确认参数值为布尔类型，即`true`或`false`，无需使用字符串引号包裹。
5. 若需验证默认状态，可在不传入该参数的情况下发起请求，对比分块后的索引内容，具体默认行为需按实际环境确认。

## 解决与验证
该功能对应的API参数为`indexPrefixTitle`，传入`true`即可开启将标题加入索引的功能，传入`false`则关闭该功能。用户提供的curl请求中已正确使用该参数，格式为`"indexPrefixTitle":true`，无需额外修改。验证方法为：发起请求后，查看知识库中对应文档的分块索引内容，确认标题是否被包含在每个索引片段中。若未传入该参数，需参考官方文档或通过实际调用结果确认默认行为。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7395)
