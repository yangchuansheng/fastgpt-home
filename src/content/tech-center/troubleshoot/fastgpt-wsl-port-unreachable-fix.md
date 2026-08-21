---
title: 解决WSL中Ubuntu安装FastGPT后无法访问3000端口的问题
slug: /zh/troubleshoot/fastgpt-wsl-port-unreachable-fix
page_type: 排错/错误码
source: https://github.com/labring/FastGPT/issues/7016
source_type: GitHub issue
---

# 解决WSL中Ubuntu安装FastGPT后无法访问3000端口的问题

## 现象
用户在Windows 11的WSL环境中安装Ubuntu系统，通过官方bash一键命令完成FastGPT安装，Docker服务正常启动后，无法访问http://localhost:3000链接，且已关闭本地防火墙。

## 可能原因
1. WSL的localhost与Windows主机的localhost网络转发存在异常，直接使用localhost访问无法连通WSL内的服务；
2. Docker容器的端口映射配置未正确生效，导致3000端口未对外暴露；
3. 3000端口被其他进程占用，FastGPT服务无法正常监听该端口。

## 排查步骤
1. 确认Docker容器运行状态：在Ubuntu终端执行`docker ps`命令，查看FastGPT相关容器是否处于Up状态，且端口映射包含`3000:3000`。
2. 获取WSL本地IP地址：在Ubuntu终端执行`hostname -I`，获取WSL的内网IP地址，通常为192.168开头的网段地址。
3. 测试WSL本地访问：在Ubuntu终端执行`curl http://localhost:3000`，确认服务本身可正常响应。
4. 验证外部访问：在Windows主机的浏览器中，使用WSL的内网IP加3000端口访问，例如`http://192.168.xx.xx:3000`。
5. 检查端口占用：在Ubuntu终端执行`netstat -tulpn | grep 3000`，确认3000端口未被其他进程占用。

## 解决与验证
若直接使用localhost访问失败，可改用WSL的内网IP地址访问3000端口。若Docker端口映射异常，可执行`docker restart 容器ID`重启对应容器，或重新执行官方部署命令调整配置。若端口被占用，需更换未被占用的端口，并同步修改FastGPT的端口配置文件。验证方式为成功访问目标链接，页面正常加载。

> 来源：[FastGPT GitHub issue](https://github.com/labring/FastGPT/issues/7016)
