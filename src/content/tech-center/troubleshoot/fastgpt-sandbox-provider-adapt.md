---
title: 解决FastGPT沙箱提供商适配与扩展相关的排查问题
slug: /zh/troubleshoot/fastgpt-sandbox-provider-adapt
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7473
source_type: GitHub issue
---

# 解决FastGPT沙箱提供商适配与扩展相关的排查问题

## 现象
当前FastGPT仅支持sealosdevbox和opensandbox两种沙箱提供商，用户无法直接调用e2b或UCloud沙箱服务，在需要扩展沙箱提供商适配时，无对应的配置或代码路径可供使用。

## 可能原因
FastGPT内置的沙箱适配模块仅集成了sealosdevbox与opensandbox的适配代码，未包含e2b及UCloud沙箱的适配逻辑，因此无法识别并调用这两类沙箱服务，导致相关功能无法正常运行。

## 排查步骤
1. 登录FastGPT后台，查看沙箱提供商的可选配置列表，确认是否存在e2b或UCloud相关选项。
2. 检查FastGPT沙箱适配模块的代码文件，确认是否包含对应两类沙箱的适配配置与逻辑。
3. 核对自身使用的沙箱服务是否属于FastGPT当前支持的协议范围。

## 解决与验证
若需使用e2b或UCloud沙箱，可联系FastGPT项目维护者确认扩展计划。熟悉对应沙箱协议的开发者可参考[e2b官方文档](https://e2b.dev/docs)与[UCloud沙箱文档](https://astraflow.ucloud.cn/docs/agent-sandbox)的格式，完成适配开发并提交代码至FastGPT项目。验证时可在FastGPT后台配置新增的沙箱提供商参数，测试沙箱的启动与调用流程是否正常运行。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7473)
