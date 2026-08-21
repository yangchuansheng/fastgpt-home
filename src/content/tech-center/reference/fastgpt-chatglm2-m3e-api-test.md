---
title: FastGPT中调用ChatGLM2与M3E自定义模型的API测试方法
slug: /zh/reference/fastgpt-chatglm2-m3e-api-test
page_type: 技术速查
source: https://doc.fastgpt.cn/zh-CN/self-host/custom-models/chatglm2-m3e
source_type: 官方文档小节
---

# FastGPT中调用ChatGLM2与M3E自定义模型的API测试方法

## 请求鉴权

请求头需要包含 `Authorization: Bearer YOUR_API_KEY` 与 `Content-Type: application/json`。发布页面使用占位符承载示例密钥，调用时替换为自己的 API Key。

## 测试接口

向 embeddings 与 chat/completions 端点分别发送请求，确认模型名称与 One API 中登记的自定义模型保持一致。

> 来源：[FastGPT ChatGLM2 与 M3E 官方文档](https://doc.fastgpt.cn/zh-CN/self-host/custom-models/chatglm2-m3e)
> 来源：[FastGPT ChatGLM2 官方文档](https://doc.fastgpt.cn/zh-CN/self-host/custom-models/chatglm2)
