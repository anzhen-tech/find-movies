const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

// 发送请求
async function makeRequest(url, retries = 3) {
    const baseDelay = 5000; // 基础延迟时间
    
    for (let i = 0; i < retries; i++) {
        try {
            // 添加随机延迟，避免固定间隔的请求
            const randomDelay = Math.floor(Math.random() * 3000);
            if (i > 0) {
                const delay = baseDelay * Math.pow(2, i - 1) + randomDelay;
                console.log(`等待 ${Math.floor(delay/1000)} 秒后进行第 ${i + 1} 次重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            const response = await axios.get(url, {
                headers: {
                    ...headers,
                    'Referer': 'https://www.dy2018.com/',
                    'Cookie': '', // 清空Cookie
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                responseType: 'arraybuffer',
                timeout: 15000
            });

            // 检查响应状态
            if (response.status === 200) {
                return response;
            } else {
                throw new Error(`服务器返回非200状态码: ${response.status}`);
            }
        } catch (error) {
            const errorMessage = error.response
                ? `HTTP ${error.response.status}: ${error.response.statusText}`
                : error.code
                    ? `网络错误: ${error.code}`
                    : error.message;
            
            console.error(`第 ${i + 1} 次请求失败: ${url}`);
            console.error(`错误详情: ${errorMessage}`);

            if (i === retries - 1) {
                throw new Error(`在 ${retries} 次尝试后仍然无法完成请求: ${errorMessage}`);
            }
        }
    }
}


async function getMovieDetail(url) {
    try {
        const response = await makeRequest(url);
        let html;
        
        try {
            html = iconv.decode(response.data, 'gb2312');
        } catch (e) {
            console.error(`字符编码转换失败，尝试使用utf-8编码`);
            html = iconv.decode(response.data, 'utf-8');
        }

        // 检查页面内容是否包含特定标记，判断是否被反爬
        if (html.includes('访问太频繁') || html.includes('请求被拒绝')) {
            throw new Error('检测到反爬虫机制，请求被拒绝');
        }

        const $ = cheerio.load(html);
        
        const title = $('.title_all h1').text().trim();
        if (!title) {
            console.error(`无法获取标题，可能页面结构已改变`);
            console.log(`页面内容片段：${html.substring(0, 200)}...`);
            throw new Error('页面解析失败：无法获取标题');
        }
        
        const movieData = {
            title,
            detailUrl: url
        };
        
        let downloadLink = null;
        
        // 尝试从Zoom区域获取下载链接
        $('#Zoom a').each((_, element) => {
            if (!downloadLink) {
                const link = $(element).attr('href');
                if (link && (link.startsWith('magnet:') || link.startsWith('ftp:') || link.startsWith('http:') || link.startsWith('https:'))) {
                    downloadLink = link;
                    console.log(`从Zoom区域找到下载链接`);
                }
            }
        });
        
        // 尝试从页面文本中匹配磁力链接
        if (!downloadLink) {
            const magnetMatches = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+/g);
            if (magnetMatches && magnetMatches.length > 0) {
                downloadLink = magnetMatches[0];
                console.log(`从页面文本中找到磁力链接`);
            }
        }
        
        // 尝试从页面文本中匹配FTP链接
        if (!downloadLink) {
            const ftpMatches = html.match(/ftp:\/\/[^\s"'<>]+/g);
            if (ftpMatches && ftpMatches.length > 0) {
                downloadLink = ftpMatches[0];
                console.log(`从页面文本中找到FTP链接`);
            }
        }

        // 尝试从页面文本中匹配HTTP链接
        if (!downloadLink) {
            const httpMatches = html.match(/https?:\/\/[^\s"'<>]+/g);
            if (httpMatches && httpMatches.length > 0) {
                // 过滤掉图片等资源链接
                const validLinks = httpMatches.filter(link => 
                    !link.match(/\.(jpg|jpeg|png|gif|css|js)$/i) &&
                    !link.includes('dy2018.com')
                );
                if (validLinks.length > 0) {
                    downloadLink = validLinks[0];
                    console.log(`从页面文本中找到HTTP链接`);
                }
            }
        }
        
        if (!downloadLink) {
            console.log(`未找到任何下载链接，页面内容片段：${html.substring(0, 200)}...`);
        }
        
        movieData.downloadLink = downloadLink;
        return movieData;
    } catch (error) {
        console.error(`获取电影详情失败: ${url}`);
        console.error(`错误类型: ${error.name}`);
        console.error(`错误信息: ${error.message}`);
        if (error.stack) {
            console.error(`错误堆栈: ${error.stack}`);
        }
        return null;
    }
}

async function fixEmptyRecords() {
    console.log('开始处理失败记录...');
    
    // 读取failed.csv文件
    if (!fs.existsSync('failed.csv')) {
        console.log('failed.csv文件不存在');
        return;
    }
    
    const content = fs.readFileSync('failed.csv', 'utf8');
    const lines = content.split('\n');
    const header = lines[0];
    const records = lines.slice(1).filter(line => line.trim() !== '');
    
    // 读取movies.csv文件中的所有URL，用于查重
    const existingUrls = new Set();
    if (fs.existsSync('movies.csv')) {
        const moviesContent = fs.readFileSync('movies.csv', 'utf8');
        const moviesLines = moviesContent.split('\n');
        moviesLines.slice(1).forEach(line => {
            const match = line.match(/"[^"]*","([^"]*)",/);
            if (match && match[1]) {
                existingUrls.add(match[1]);
            }
        });
    }

    // 找出需要处理的记录
    const recordsToProcess = [];
    
    for (const line of records) {
        const match = line.match(/"([^"]*)","([^"]*)"/);        
        if (match) {
            const [_, title, detailUrl] = match;
            const cleanUrl = detailUrl.replace(/"/g, '');
            // 检查URL是否已存在于movies.csv中
            if (!existingUrls.has(cleanUrl)) {
                recordsToProcess.push({
                    title: title,
                    detailUrl: cleanUrl
                });
            } else {
                console.log(`跳过已存在的记录: ${cleanUrl}`);
            }
        }
    }
    
    console.log(`找到 ${recordsToProcess.length} 条需要处理的记录`);
    
    // 处理每条记录
    for (const record of recordsToProcess) {
        console.log(`正在处理: ${record.detailUrl}`);
        
        // 获取最新的电影详情
        const movieDetail = await getMovieDetail(record.detailUrl);
        
        if (movieDetail && movieDetail.downloadLink) {
            // 追加到movies.csv
            const newLine = `"${movieDetail.title}","${movieDetail.detailUrl}","${movieDetail.downloadLink}"\n`;
            fs.appendFileSync('movies.csv', newLine, 'utf8');
            console.log(`成功更新记录: ${movieDetail.title}`);
        } else {
            console.log(`无法获取详情: ${record.detailUrl}`);
        }
        
        // 等待一段时间再处理下一条记录
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 读取movies.csv文件
    const moviesContent = fs.readFileSync('movies.csv', 'utf8');
    const moviesLines = moviesContent.split('\n');
    const moviesHeader = moviesLines[0];
    const moviesRecords = moviesLines.slice(1).filter(line => line.trim() !== '');

    // 找出需要修复的记录
    const recordsToFix = [];
    const updatedRecords = [];

    for (let i = 0; i < moviesRecords.length; i++) {
        const line = moviesRecords[i];
        const match = line.match(/"([^"]*)","([^"]*)","([^"]*)"/);
        
        if (match) {
            const [_, title, detailUrl, downloadLink] = match;
            if (!title || !downloadLink) {
                recordsToFix.push({ index: i, detailUrl, originalLine: line });
            }
            updatedRecords.push(line);
        }
    }

    console.log(`找到 ${recordsToFix.length} 条需要修复的记录`);

    // 处理每条需要修复的记录
    for (const record of recordsToFix) {
        console.log(`正在处理: ${record.detailUrl}`);
        
        // 获取最新的电影详情
        const movieDetail = await getMovieDetail(record.detailUrl);
        
        if (movieDetail) {
            // 更新记录
            const newLine = `"${movieDetail.title}","${movieDetail.detailUrl}","${movieDetail.downloadLink || ''}"`;
            updatedRecords[record.index] = newLine;
            console.log(`成功更新记录: ${movieDetail.title}`);
        } else {
            console.log(`无法获取详情，保持原记录不变`);
        }
        
        // 等待一段时间再处理下一条记录
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 保存更新后的文件
    const newContent = [moviesHeader, ...updatedRecords].join('\n');
    fs.writeFileSync('movies.csv', newContent, 'utf8');

    console.log('处理完成！');
}

// 开始执行
fixEmptyRecords()
    .then(() => {
        console.log('所有空记录处理完毕');
    })
    .catch(error => {
        console.error('处理过程中出现错误:', error);
    });