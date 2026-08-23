---
title: 解决FastGPT中MinerU Saas插件files参数配置问题
slug: /zh/troubleshoot/fastgpt-mineru-saas-files-config
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7114
source_type: GitHub issue
---

# 解决FastGPT中MinerU Saas插件files参数配置问题

## 现象
在FastGPT私有部署V4.14.20版本的对话Agent中，配置MinerU Saas解析插件的files参数时，在参数值输入框输入斜杠（/）后，无法弹出参数值来源选择列表，无法完成该参数的配置。

## 可能原因
暂无公开明确的触发原因，需按实际部署环境与插件调用链路排查确认。

## 排查步骤
1. 确认当前使用的FastGPT版本为私有部署V4.14.20，且配置的插件为MinerU Saas解析插件。
2. 进入对话Agent的配置页面，找到MinerU Saas插件的files参数配置项。
3. 在参数值输入框中输入斜杠（/），观察是否出现参数值来源选择弹窗。
4. 确认自身使用的API密钥正常可用，无相关权限限制。
5. 核对插件的所有前置配置项，确认无缺失或错误配置。

## 解决与验证
若排查后仍无法解决该问题，可参考官方文档提交排查日志与配置信息，或等待官方版本更新修复。验证方式为：重新进入对话Agent的MinerU Saas插件配置页面，在files参数输入框输入斜杠（/），确认可正常弹出参数值来源选择列表并完成参数配置。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7114)
