---
title: 解决FastGPT私有部署后重启丢失嵌入知识库数据问题
slug: /zh/troubleshoot/fastgpt-restart-lost-embed-data
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7020
source_type: GitHub issue
---

# 解决FastGPT私有部署后重启丢失嵌入知识库数据问题

## 现象
用户使用docker compose部署私有部署版本FastGPT，前端显示版本为4.14.20，fastgpt-app镜像版本为4.14.22，使用seekdb相关的compose文件。创建知识库并添加文件后，seekdb内可查询到嵌入数据，执行`docker compose down`关闭服务，再通过`docker compose up -d`重启后，知识库内的嵌入数据消失。

## 可能原因
目前可基于场景推测，该问题可能与容器重启后数据存储未正确持久化有关，具体需结合部署的docker compose配置确认。

## 排查步骤
1. 检查当前使用的docker compose配置文件，确认seekdb相关服务是否配置了持久化数据卷。
2. 检查执行`docker compose down`命令时是否携带了`--volumes`参数，该参数会删除匿名卷，可能导致嵌入数据丢失。
3. 核对部署时的镜像版本与前端显示版本是否匹配，本次场景中前端版本为4.14.20，fastgpt-app镜像版本为4.14.22。
4. 重启服务后，查看知识库内的嵌入数据是否保留。

## 解决与验证
若执行`docker compose down`时携带了`--volumes`参数，移除该参数后重新启动服务。若配置文件未配置持久化数据卷，需为seekdb服务添加本地卷或命名卷的挂载配置。验证方法为：创建知识库并添加文件，确认seekdb内存在嵌入数据后执行`docker compose down`，再通过`docker compose up -d`重启服务，再次查看知识库内的嵌入数据是否保留。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7020)
