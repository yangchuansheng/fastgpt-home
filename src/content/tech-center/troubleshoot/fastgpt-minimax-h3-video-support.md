---
title: 排查并解决FastGPT中MiniMax-H3模型与视频生成支持问题
slug: /zh/troubleshoot/fastgpt-minimax-h3-video-support
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7470
source_type: GitHub issue
---

# 排查并解决FastGPT中MiniMax-H3模型与视频生成支持问题

## 现象
在FastGPT中尝试调用MiniMax-H3模型生成视频时，无法正常使用该模型，无法满足制作文档过程中生成小视频讲解短片的需求，与issue中提及的应用场景一致。

## 可能原因
FastGPT当前版本未完成MiniMax-H3模型的适配开发，且未开放该模型对应的视频生成功能接口，具体的功能缺失原因需按实际使用环境确认。

## 排查步骤
1. 确认已将FastGPT升级至最新版本，该步骤符合issue中用户已完成版本升级的前提条件
2. 登录FastGPT的管理后台，查看平台提供的可用模型列表，确认是否包含MiniMax-H3模型的选项
3. 进入FastGPT的功能配置模块，检查是否存在与视频生成相关的功能开关或配置项
4. 核对当前系统中是否已完成MiniMax-H3模型的相关配置，具体配置项需按实际环境确认

## 解决与验证
当确认FastGPT当前未集成MiniMax-H3模型及视频生成功能时，需等待官方发布适配更新以支持该模型与视频生成能力。若平台已存在MiniMax-H3模型的配置项，但视频生成功能无法正常运行，需核对模型的访问权限与相关配置参数。验证功能是否正常时，可在升级至最新版本后，在FastGPT的对话或生成界面中选择MiniMax-H3模型，发起视频生成请求，确认能否正常生成符合制作文档需求的视频讲解短片。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7470)
