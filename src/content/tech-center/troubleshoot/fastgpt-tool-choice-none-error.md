---
title: 解决FastGPT连续工具调用后tool_choice设为none的模型响应异常问题
slug: /zh/troubleshoot/fastgpt-tool-choice-none-error
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7339
source_type: GitHub issue
---

# 解决FastGPT连续工具调用后tool_choice设为none的模型响应异常问题

## 现象
在FastGPT v4.15.2的工作流工具调用节点中，当连续工具调用次数超过5次后，系统会将下一次请求的tool_choice参数设为none。此时若上游兼容OpenAI接口的模型返回finish_reason为tool_calls，但无有效toolCalls、answerText为空、reasoningText非空，会触发chat:LLM_model_response_empty报错，工作流异常终止。该问题仅出现在强制收尾的工具调用请求中，模型配置页面测试、普通对话均能正常运行。

## 可能原因
FastGPT的Agent Loop逻辑中，设置了连续工具调用次数阈值：当consecutiveRequestToolTimes >5时，会强制将tool_choice设为none，以终止工具调用流程。部分兼容OpenAI接口的模型在tool_choice设为none时，仍返回finish_reason为tool_calls，且未生成有效工具调用内容，导致FastGPT无法识别有效响应，触发通用的空响应报错。

## 排查步骤
1. 确认FastGPT版本为v4.15.2，且通过AIProxy v0.6.5接入兼容reasoning和tool calling的OpenAI-compatible模型。
2. 检查目标工作流的工具调用节点配置，确认系统提示词要求模型连续调用工具获取证据。
3. 触发连续5次以上仅返回工具调用的对话流程，观察第6次及之后的请求参数。
4. 查看上游模型的原始响应，确认是否存在finish_reason为tool_calls、无有效toolCalls、answerText为空、reasoningText非空的情况。
5. 检查FastGPT运行日志，确认报错信息为chat:LLM_model_response_empty。

## 解决与验证
针对该异常，可通过以下方式处理与验证：
1. 为tool_choice设为none，但返回finish_reason为tool_calls且无有效toolCalls的场景，添加明确的异常识别逻辑，替换通用报错信息。
2. 可增加自动重试机制，使用tool_choice为none重新发起请求，明确要求模型输出最终文本。
3. 在日志中补充记录请求的tool_choice、返回的finish_reason、有效toolCalls状态、answerText和reasoningText的长度等信息，便于问题定位。
验证时，触发相同的连续工具调用流程，确认异常报错被替换为明确的协议异常提示，或工作流正常终止，未再出现chat:LLM_model_response_empty报错。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7339)
