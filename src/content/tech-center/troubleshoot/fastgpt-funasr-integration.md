---
title: 为FastGPT集成FunASR实现语音输入与音频文件解析功能
slug: /zh/troubleshoot/fastgpt-funasr-integration
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7030
source_type: GitHub issue
---

# 为FastGPT集成FunASR实现语音输入与音频文件解析功能

## 现象
部分用户因业务需求需要在FastGPT中使用语音对话交互，或处理音频、视频类知识库素材，但现有FastGPT版本未提供对应的功能支持，无法完成语音转写或音频文件文本提取。

## 可能原因
FastGPT原生未集成支持语音转写的工具，缺少对接ASR服务的配置入口或适配逻辑，未打通语音到文本的转换环节。

## 排查步骤
1. 确认当前FastGPT部署环境是否支持第三方ASR服务对接。
2. 检查是否已部署符合接口要求的ASR服务，或准备部署相关工具。
3. 核对ASR服务的接口地址与参数格式是否符合FastGPT对接规范（需按实际环境确认）。
4. 可通过工具测试目标ASR服务的`/v1/audio/transcriptions`接口可用性（需按实际环境确认测试命令）。

## 解决与验证
1. 按要求安装依赖包：执行`pip install funasr vllm fastapi uvicorn python-multipart`。
2. 启动FunASR服务：执行`funasr-server --device cuda`，确认`/v1/audio/transcriptions`接口正常就绪。该服务支持私有本地部署，可完全在本地运行，符合FastGPT的部署理念。
3. 在FastGPT的配置页面中，添加该ASR服务的对接地址，使用`/v1/audio/transcriptions`接口作为语音转写入口。
4. 测试功能：发起语音输入对话，或上传音频、视频文件，验证转写结果是否正常生成并纳入知识库。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7030)
