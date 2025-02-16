# Find Movies

一个基于Node.js的电影信息爬虫项目，用于从电影天堂网站(dy2018.com)抓取电影信息。

## 功能特点

- 自动抓取电影天堂网站的电影信息
- 支持获取电影标题、详情页链接和下载链接
- 数据以CSV格式保存，方便后续处理和分析
- 内置失败重试机制，确保数据完整性
- 支持使用SOCKS代理，避免IP限制

## 数据格式

爬取的数据保存在`movies.csv`文件中，每条记录包含以下字段：

- 电影标题
- 详情页URL
- 下载链接

## 使用方法

### 1. 安装依赖

```bash
npm install
```

### 2. 运行爬虫

```bash
npm start
```

爬虫会自动开始工作，并将结果保存到`movies.csv`文件中。如果有抓取失败的记录，会保存到`failed.csv`文件中。

### 3. 处理失败记录

如果需要重试失败的记录，可以运行：

```bash
node fix_empty_records.js
```

## 依赖说明

- axios: HTTP客户端
- cheerio: HTML解析
- iconv-lite: 编码转换
- socks-proxy-agent: SOCKS代理支持