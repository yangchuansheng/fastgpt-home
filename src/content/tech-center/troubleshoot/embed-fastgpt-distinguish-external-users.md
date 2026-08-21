---
title: 解决嵌入FastGPT应用时区分外部门户网站登录用户的问题
slug: /zh/troubleshoot/embed-fastgpt-distinguish-external-users
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6504
source_type: GitHub issue
---

# 解决嵌入FastGPT应用时区分外部门户网站登录用户的问题

## 现象
门户网站通过免登录窗口嵌入FastGPT应用，门户网站自身带有用户登录系统，但嵌入的FastGPT应用无法识别当前门户网站的登录用户，用户希望通过带入手机号码的方式区分不同用户。

## 可能原因
当前嵌入FastGPT应用的流程未支持传递外部系统的用户身份参数，嵌入应用无法获取外部传入的用户标识信息，因此无法区分不同的登录用户。

## 排查步骤
1. 确认嵌入FastGPT应用的代码逻辑，是否支持接收外部传入的用户身份参数。
2. 检查门户网站的用户登录流程，确认是否可以获取到当前登录用户的手机号码等身份信息。
3. 验证是否可以在嵌入FastGPT应用的iframe链接中拼接对应的用户标识参数。
4. 需按实际环境确认FastGPT嵌入应用是否支持读取外部传入的用户参数。

## 解决与验证
在嵌入FastGPT应用的iframe的src链接中，拼接包含用户手机号码的自定义参数，例如`https://[你的FastGPT应用地址]?phone=当前用户手机号`。在FastGPT应用内，按实际应用的配置方式读取该phone参数，将其作为用户标识来区分不同用户。验证时，可让不同的门户网站用户登录后访问嵌入页面，确认FastGPT应用可以正确获取并识别对应的用户手机号码，以此完成用户区分。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6504)
