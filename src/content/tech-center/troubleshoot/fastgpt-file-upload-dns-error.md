---
title: 解决FastGPT对话上传文件时出现ERR_NAME_NOT_RESOLVED报错问题
slug: /zh/troubleshoot/fastgpt-file-upload-dns-error
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6524
source_type: GitHub issue
---

# 解决FastGPT对话上传文件时出现ERR_NAME_NOT_RESOLVED报错问题

## 现象
用户在私有部署V4.14.8版本的FastGPT中，对话上传文件时出现ERR_NAME_NOT_RESOLVED报错。上传请求的URL为`https://fastgpt-private.${domain}:8080/chat/xxxx`，使用旧版URL`https://${domain}:8080/xxxx`可正常上传。同时`https://fastgpt-private.${domain}`无法被正常解析，触发域名解析失败问题。

## 可能原因
上传文件请求使用了未完成DNS解析的子域名`fastgpt-private.${domain}`，导致浏览器无法解析该域名，触发ERR_NAME_NOT_RESOLVED报错。该子域名未正确指向FastGPT部署的服务器地址，或未完成域名解析配置。

## 排查步骤
1.  确认当前FastGPT上传文件请求的URL格式，检查是否使用了`fastgpt-private.${domain}`作为请求域名。
2.  登录域名管理控制台，检查`fastgpt-private.${domain}`是否已添加DNS解析记录，指向部署FastGPT的服务器IP。
3.  在本地或服务器终端执行域名解析验证命令，例如`nslookup fastgpt-private.${domain}`，确认该域名能否被正常解析。
4.  对比可正常上传的旧版URL`https://${domain}:8080/xxxx`，排查请求域名的配置差异。

## 解决与验证
### 解决方法
1.  完成`fastgpt-private.${domain}`子域名的DNS解析配置，将其指向部署FastGPT的服务器公网IP地址。
2.  按照实际部署的服务配置规则，确保该子域名的请求可被正确转发至FastGPT服务端口。
如果无需使用该子域名，也可调整FastGPT的上传请求配置，使用原可正常工作的`${domain}:8080`域名格式。

### 验证步骤
1.  重新尝试上传文件，确认不再弹出ERR_NAME_NOT_RESOLVED报错。
2.  通过浏览器访问`https://fastgpt-private.${domain}:8080`，验证域名可正常访问且服务可用。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6524)
