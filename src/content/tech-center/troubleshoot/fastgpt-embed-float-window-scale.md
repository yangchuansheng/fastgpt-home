---
title: 解决FastGPT免登录嵌入悬浮窗无法缩放的问题
slug: /zh/troubleshoot/fastgpt-embed-float-window-scale
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7323
source_type: GitHub issue
---

# 解决FastGPT免登录嵌入悬浮窗无法缩放的问题

## 现象
免登录嵌入的悬浮窗在进行聊天问答时，若输出内容较多或包含图片，会出现显示空间不足的问题，无法完整展示全部聊天内容或图片，且当前悬浮窗不支持调整大小，影响正常使用体验。

## 可能原因
目前无官方明确说明该功能未实现的具体原因，相关情况需按实际部署环境与使用版本确认。

## 排查步骤
1. 确认当前使用的FastGPT版本是否为最新正式版本
2. 查看免登录嵌入悬浮窗的配置或使用界面，检查是否存在缩放控制的相关选项
3. 确认该功能是否已被官方纳入支持范围

## 解决与验证
目前该功能尚未被官方实现，可通过向官方GitHub仓库提交功能需求，或等待后续版本更新来获取该功能支持。验证方式为：当升级至支持该功能的FastGPT版本后，在免登录嵌入悬浮窗界面找到缩放控制选项，调整悬浮窗的大小，确认可适配更多的聊天内容与图片展示，解决显示空间不足的问题。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7323)
