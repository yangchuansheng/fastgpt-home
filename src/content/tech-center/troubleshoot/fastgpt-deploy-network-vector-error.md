---
title: 解决FastGPT部署时docker compose拉取镜像报undefined network vector错误
slug: /zh/troubleshoot/fastgpt-deploy-network-vector-error
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/6970
source_type: GitHub issue
---

# 解决FastGPT部署时docker compose拉取镜像报undefined network vector错误

## 现象
用户在FastGPT部署流程中，执行配置下载后，运行`docker compose --profile prepull pull opensandbox-agent-sandbox-image opensandbox-execd-image opensandbox-egress-image`命令拉取镜像时，出现报错：`service "fastgpt-milvus-minio" refers to undefined network vector: invalid compose project`。此前配置下载流程正常，已更新S3、MCP访问地址，确认Docker socket路径无误。

## 可能原因
该报错提示配置中的服务引用了未定义的名为vector的网络，可能的原因是docker-compose.yml配置中存在对未创建或未定义的vector网络的引用，或配置文件中的网络配置存在错误。

## 排查步骤
1. 打开当前部署目录下的docker-compose.yml文件，搜索关键词`vector`，确认其中是否存在对名为vector的网络的引用配置。
2. 检查docker-compose.yml中的`networks`配置块，确认是否定义了名为vector的网络。
3. 确认部署环境中是否提前创建了该自定义网络，或配置文件中的网络名称与实际创建的网络名称一致。
4. 核对此前更新的配置项，确认是否在配置下载后未正确保留或修改了网络相关配置。

## 解决与验证
若docker-compose.yml中未定义vector网络，可在配置文件的`networks`块中添加该网络的基础定义，例如添加`vector: {}`。若部署环境中未创建该网络，可执行`docker network create vector`命令创建自定义网络。完成配置修改或网络创建后，重新执行拉取镜像的命令：`docker compose --profile prepull pull opensandbox-agent-sandbox-image opensandbox-execd-image opensandbox-egress-image`，确认报错消失。验证：拉取镜像成功后，执行`docker compose up -d`启动服务，确认无网络相关报错即可。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/6970)
