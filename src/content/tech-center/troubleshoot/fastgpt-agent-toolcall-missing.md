---
title: 解决FastGPT多工具Agent调用时无tool_call数组的中断问题
slug: /zh/troubleshoot/fastgpt-agent-toolcall-missing
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6877
source_type: GitHub issue
---

# 解决FastGPT多工具Agent调用时无tool_call数组的中断问题

## 现象
使用FastGPT私有部署v4.14.20版本，为Agent配置33个工具，开启将工具调用信息加入上下文的功能，进行2-3轮交互后，第三次请求仅输出思考内容，finish_reason为tool_calls，但未返回tool_call数组，导致请求意外中断。直接将LLM请求详情原样调用指定大模型时流程正常，仅在FastGPT环境中出现该问题，复现概率约50%。

## 可能原因
目前未明确根因，结合现象推测问题可能与多工具配置下的上下文数据量累积、FastGPT对工具调用结果的解析逻辑异常，或上下文包含工具调用信息的配置在多轮交互后出现处理异常相关。

## 排查步骤
1. 确认当前FastGPT为v4.14.20私有部署版本。
2. 记录当前Agent配置的工具数量，可先减少工具数量后测试，观察问题是否复现。
3. 临时关闭"将工具调用信息加入上下文"的配置，进行多轮交互测试，确认问题是否消失。
4. 导出FastGPT的LLM请求详情日志，对比直接调用模型的请求参数与返回结果，排查返回内容的差异。
5. 复现问题时，确认日志中finish_reason为tool_calls且无tool_call数组的具体表现。

## 解决与验证
若需临时恢复正常流程，可先减少Agent配置的工具数量，或临时关闭将工具调用信息加入上下文的配置。验证方式为：调整配置后，进行多轮交互，确认每次请求均能正常生成tool_call数组，finish_reason符合预期，请求流程未中断。若问题持续，需按实际环境进一步排查FastGPT的上下文处理与工具调用解析逻辑。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6877)
