---
title: 解决fastgpt-code-sandbox v4.15.0 seccomp加载失败启动异常问题
slug: /zh/troubleshoot/fastgpt-sandbox-seccomp-load-failure
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7256
source_type: GitHub issue
---

# 解决fastgpt-code-sandbox v4.15.0 seccomp加载失败启动异常问题

## 现象
fastgpt-code-sandbox 镜像v4.15.0在群晖NAS环境部署时，容器启动后反复打印警告日志：`Python warm child failed: load seccomp filter: operation canceled`，最终容器异常退出或不断重启，无法正常提供代码执行沙箱服务。同环境下v4.14.15版本的镜像可正常启动运行。

## 可能原因
该问题由v4.15.0新增的Python沙箱seccomp加固机制导致。沙箱通过python-seccomp库为预热子进程加载seccomp-BPF过滤规则，调用`f.load()`时默认使用`SECCOMP_FILTER_FLAG_TSYNC`模式同步规则到所有线程。部分定制精简内核（如群晖DSM定制内核）对该多线程同步模式支持不完整，触发`ECANCELED`错误，对应日志中的`operation canceled`。

## 排查步骤
1. 执行命令`uname -r`获取宿主机内核版本信息。
2. 查看fastgpt-code-sandbox容器的日志，确认是否出现`Python warm child failed: load seccomp filter: operation canceled`报错。
3. 对比同配置下v4.14.15版本镜像的运行状态，验证是否为v4.15.0版本特有问题。

## 解决与验证
目前可通过临时回退镜像版本至v4.14.15解决该问题，步骤如下：
1. 修改docker-compose配置文件中fastgpt-code-sandbox的镜像标签，将`v4.15.0`替换为`v4.14.15`。
2. 执行`docker-compose up -d`重新部署服务。
3. 等待容器启动完成后，查看容器日志确认无报错，验证沙箱服务正常运行。
需注意，该临时方案仅针对当前已知的seccomp多线程同步兼容问题，后续可关注官方版本更新以获取适配新版内核的修复。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7256)
