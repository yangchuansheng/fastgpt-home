---
title: FastGPT中qwen3.5-omni全模态模型的排错方法
slug: /zh/troubleshoot/fastgpt-qwen35-omni-troubleshooting
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6869
source_type: GitHub issue
---

# FastGPT中qwen3.5-omni全模态模型的排错方法

## 现象
用户在FastGPT中配置或调用qwen3.5-omni全模态模型时，出现无法正常调用、无响应或报错的情况，具体报错信息需按实际环境确认。

## 可能原因
1. 当前使用的FastGPT版本未集成qwen3.5-omni全模态模型的适配配置；
2. 未正确填写百炼平台提供的qwen3.5-omni全模态模型调用所需的参数；
3. 调用时的输入格式或流程未遵循百炼平台的全模态模型规范。

## 排查步骤
1. 确认当前使用的FastGPT版本是否已内置qwen3.5-omni全模态模型的支持项；
2. 参考百炼平台官方文档（https://help.aliyun.com/zh/model-studio/omni/、https://help.aliyun.com/zh/model-studio/realtime），核对该模型的调用入口与参数要求；
3. 检查FastGPT内的模型配置页面，确认已正确填写百炼平台的认证信息与调用参数；
4. 测试调用时的输入内容是否符合全模态模型的格式要求。

## 解决与验证
若当前FastGPT版本未集成该模型的适配配置，需等待官方版本更新或按照百炼平台文档自行完成适配开发；若为参数配置错误，需修正相关认证信息与调用参数。验证时，按照百炼平台提供的全模态模型示例发起测试调用，确认FastGPT可正常接收并返回模型响应。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6869)
