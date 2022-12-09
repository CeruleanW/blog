#!/bin/bash

git checkout hexo # 切换为hexo分支
hexo clean # 清除生成的静态文件
hexo g # 生成静态文件
hexo d # 部署到远程
git add . # 添加所有文件
git commit -m "publish update content"
git push origin hexo # push to remote branch hexo