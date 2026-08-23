---
title: 解决FastGPT索引模型无法使用指定上下文嵌入模型的问题
slug: /zh/troubleshoot/fastgpt-index-model-support-context-embedding-models
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6946
source_type: GitHub issue
---

# 解决FastGPT索引模型无法使用指定上下文嵌入模型的问题

## 现象
在FastGPT平台配置pplx-embed-context-v1-4b或voyage-context-3作为文档索引的嵌入模型时，会出现无法正常提交索引任务、系统提示模型不支持，或索引过程中出现调用失败的情况。

## 可能原因
当前FastGPT版本的索引模型支持列表未收录pplx-embed-context-v1-4b、voyage-context-3这类上下文嵌入模型，系统无法识别并调用该类模型完成长文档的切片与索引流程，导致索引任务失败。

## 排查步骤
1. 确认当前使用的FastGPT已升级到官方发布的最新版本，避免因旧版本缺失模型支持导致的问题。
2. 检查配置的模型名称是否完全匹配pplx-embed-context-v1-4b或voyage-context-3，确认无拼写错误或格式偏差。
3. 登录FastGPT后台管理界面，查看内置的索引模型支持列表，确认是否存在上述两款模型。
4. 核对模型调用所需的API密钥、访问权限等配置信息，确保配置无误。

## 解决与验证
目前可通过两种方式解决该问题：一是等待FastGPT官方更新索引模型支持列表，添加对pplx-embed-context-v1-4b、voyage-context-3的支持；二是若为自行部署的FastGPT实例，可参考官方文档修改索引模型的支持配置，具体操作需按实际环境确认。验证方法为：将上述模型配置为索引模型后，上传一篇长文档进行索引测试，若能正常完成文档切片与索引流程，且未出现模型不支持或调用失败的报错，则验证配置生效。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6946)
