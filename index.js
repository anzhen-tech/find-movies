const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');

const baseUrls = [
    'https://www.dy2018.com/html/gndy/jddyy/',
    'https://www.dy2018.com/html/gndy/jddy/',
    'https://www.dy2018.com/html/gndy/dyzz/',
    'https://www.dy2018.com/html/bikan/',
    'https://www.dy2018.com/html/dongman/index.html',
    'https://www.dy2018.com/html/zongyi2013/index.html',
    'https://www.dy2018.com/html/tv/rihantv/index.html',
    'https://www.dy2018.com/html/tv/oumeitv/index.html',
    'https://www.dy2018.com/html/tv/hytv/index.html',
    'https://www.dy2018.com/html/gndy/rihan/',
    'https://www.dy2018.com/html/gndy/oumei/',
    'https://www.dy2018.com/0/',
    'https://www.dy2018.com/1/',
    'https://www.dy2018.com/2/',
    'https://www.dy2018.com/3/',
    'https://www.dy2018.com/4/',
    'https://www.dy2018.com/5/',
    'https://www.dy2018.com/6/',
    'https://www.dy2018.com/7/',
    'https://www.dy2018.com/8/',
    'https://www.dy2018.com/9/',
    'https://www.dy2018.com/10/',
    'https://www.dy2018.com/11/',
    'https://www.dy2018.com/12/',
    'https://www.dy2018.com/13/',
    'https://www.dy2018.com/14/',
    'https://www.dy2018.com/15/',
    'https://www.dy2018.com/16/',
    'https://www.dy2018.com/17/',
    'https://www.dy2018.com/18/',
    'https://www.dy2018.com/19/',
    'https://www.dy2018.com/20/'
];
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

// 发送请求
async function makeRequest(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                headers,
                responseType: 'arraybuffer',
                timeout: 10000
            });

            return response;
        } catch (error) {
            console.error(`请求失败: ${url}`, error.message);
            if (i < retries - 1) {
                console.log(`等待后重试...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    throw new Error(`在 ${retries} 次尝试后仍然无法完成请求`);
}

// 读取已存在的电影数据
function readExistingMovies() {
    const existingMovies = new Set();
    if (fs.existsSync('movies.csv')) {
        const content = fs.readFileSync('movies.csv', 'utf8');
        const lines = content.split('\n').slice(1); // 跳过表头
        lines.forEach(line => {
            if (line) {
                const match = line.match(/"[^"]*","([^"]*)",/);
                if (match && match[1]) {
                    existingMovies.add(match[1]);
                }
            }
        });
    }
    return existingMovies;
}

// 保存失败记录
function saveFailedRecord(title, detailUrl) {
    const failedRecord = `"${title || ''}","${detailUrl}"\n`;
    fs.appendFileSync('failed.csv', failedRecord, 'utf8');
}

async function getMaxPageNum(html) {
    const $ = cheerio.load(html);
    let maxPage = 1;
    
    // 查找分页导航中的所有页码链接
    $('.co_content8 select option').each((_, element) => {
        const pageNum = parseInt($(element).text());
        if (!isNaN(pageNum) && pageNum > maxPage) {
            maxPage = pageNum;
        }
    });

    // 检查分页链接
    $('.co_content8 .x a').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
            const match = href.match(/index_(\d+)\.html/);
            if (match) {
                const pageNum = parseInt(match[1]);
                if (!isNaN(pageNum) && pageNum > maxPage) {
                    maxPage = pageNum;
                }
            }
        }
    });

    // 检查页码按钮
    $('.pages a, .pagelist a').each((_, element) => {
        const pageText = $(element).text().trim();
        const pageNum = parseInt(pageText);
        if (!isNaN(pageNum) && pageNum > maxPage) {
            maxPage = pageNum;
        }

        // 检查href属性中的页码
        const href = $(element).attr('href');
        if (href) {
            const match = href.match(/index_(\d+)\.html/);
            if (match) {
                const hrefPageNum = parseInt(match[1]);
                if (!isNaN(hrefPageNum) && hrefPageNum > maxPage) {
                    maxPage = hrefPageNum;
                }
            }
        }
    });

    // 检查最后一页链接
    $('a:contains("末页"), a:contains("尾页")').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
            const match = href.match(/index_(\d+)\.html/);
            if (match) {
                const pageNum = parseInt(match[1]);
                if (!isNaN(pageNum) && pageNum > maxPage) {
                    maxPage = pageNum;
                }
            }
        }
    });

    console.log(`检测到最大页数: ${maxPage}`);
    return maxPage;
}

async function getPage(baseUrl, pageNum) {
    let url;
    if (baseUrl.match(/\d+\/$/)){ // 数字分类目录
        url = pageNum === 1 ? baseUrl : `${baseUrl}index_${pageNum}.html`;
    } else if (baseUrl.endsWith('index.html')) { // 已经包含index.html的URL
        const baseWithoutIndex = baseUrl.replace('index.html', '');
        url = pageNum === 1 ? baseUrl : `${baseWithoutIndex}index_${pageNum}.html`;
    } else { // 其他分类目录
        url = pageNum === 1 ? `${baseUrl}index.html` : `${baseUrl}index_${pageNum}.html`;
    }
    
    try {
        const response = await makeRequest(url);
        const html = iconv.decode(response.data, 'gb2312');
        return html;
    } catch (error) {
        console.error(`获取页面失败: ${url}`, error.message);
        return null;
    }
}

async function getMovieDetail(url) {
    try {
        const response = await makeRequest(url);
        const html = iconv.decode(response.data, 'gb2312');
        const $ = cheerio.load(html);
        
        const title = $('.title_all h1').text().trim();
        
        const movieData = {
            title,
            detailUrl: url
        };
        
        let downloadLink = null;
        
        $('#Zoom a').each((_, element) => {
            if (!downloadLink) {
                const link = $(element).attr('href');
                if (link && (link.startsWith('magnet:') || link.startsWith('ftp:') || link.startsWith('http:') || link.startsWith('https:'))) {
                    downloadLink = link;
                }
            }
        });
        
        if (!downloadLink) {
            const magnetMatches = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+/g);
            if (magnetMatches && magnetMatches.length > 0) {
                downloadLink = magnetMatches[0];
            }
        }
        
        if (!downloadLink) {
            const ftpMatches = html.match(/ftp:\/\/[^\s"'<>]+/g);
            if (ftpMatches && ftpMatches.length > 0) {
                downloadLink = ftpMatches[0];
            }
        }

        if (!downloadLink) {
            const httpMatches = html.match(/https?:\/\/[^\s"'<>]+/g);
            if (httpMatches && httpMatches.length > 0) {
                downloadLink = httpMatches[0];
            }
        }
        
        movieData.downloadLink = downloadLink;
        return movieData;
    } catch (error) {
        console.error(`获取电影详情失败: ${url}`, error.message);
        let title = '';
        try {
            const $ = cheerio.load(html);
            title = $('.title_all h1').text().trim();
        } catch (e) {}
        saveFailedRecord(title, url);
        return null;
    }
}

async function parseMovieList(html, existingMovies) {
    const $ = cheerio.load(html);
    const movies = [];
    
    // 只获取电影链接，排除导航链接和其他无关内容
    const items = $('.co_content8 .ulink').filter((_, element) => {
        const href = $(element).attr('href');
        // 确保链接格式符合电影详情页的格式（/i/数字.html 或 /html/...）
        return href && (href.match(/\/i\/\d+\.html$/) || href.match(/\/html\/[\w\/]+\d+\.html$/));
    });
    for (let i = 0; i < items.length; i++) {
        const element = items[i];
        const link = 'https://www.dy2018.com' + $(element).attr('href');
        
        if (!existingMovies.has(link)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const movieDetail = await getMovieDetail(link);
            if (movieDetail) {
                movies.push(movieDetail);
                console.log(`成功获取电影信息: ${movieDetail.title}`);
            }
        } else {
            console.log(`跳过已存在的电影: ${link}`);
        }
    }
    
    return movies;
}

async function crawlMovies(startPage = 1) {
    const allMovies = [];
    const existingMovies = readExistingMovies();
    
    if (!fs.existsSync('failed.csv')) {
        fs.writeFileSync('failed.csv', 'Title,DetailUrl\n', 'utf8');
    }
    
    if (!fs.existsSync('movies.csv')) {
        fs.writeFileSync('movies.csv', 'Title,DetailUrl,DownloadLink\n', 'utf8');
    }

    for (const baseUrl of baseUrls) {
        console.log(`开始爬取分类: ${baseUrl}`);
        
        // 获取第一页内容以确定总页数
        const firstPageHtml = await getPage(baseUrl, 1);
        if (!firstPageHtml) continue;
        
        const maxPageNum = await getMaxPageNum(firstPageHtml);
        console.log(`检测到总页数: ${maxPageNum}`);
        
        // 处理第一页数据
        const firstPageMovies = await parseMovieList(firstPageHtml, existingMovies);
        allMovies.push(...firstPageMovies);
        
        // 保存第一页数据到CSV
        const firstPageCsvContent = firstPageMovies
            .map(movie => {
                const escapedTitle = movie.title.replace(/"/g, '""');
                return `"${escapedTitle}","${movie.detailUrl}","${movie.downloadLink || ''}"`;                
            })
            .join('\n');
        
        if (firstPageCsvContent) {
            fs.appendFileSync('movies.csv', firstPageCsvContent + '\n', 'utf8');
        }
        
        // 处理剩余页面
        for (let page = 2; page <= maxPageNum; page++) {
            console.log(`正在获取第 ${page} 页...`);
            const html = await getPage(baseUrl, page);
            if (html) {
                const movies = await parseMovieList(html, existingMovies);
                allMovies.push(...movies);
                console.log(`第 ${page} 页完成，获取到 ${movies.length} 部电影信息`);
                
                const csvContent = movies
                    .map(movie => {
                        const escapedTitle = movie.title.replace(/"/g, '""');
                        return `"${escapedTitle}","${movie.detailUrl}","${movie.downloadLink || ''}"`;
                    })
                    .join('\n');
                
                if (csvContent) {
                    fs.appendFileSync('movies.csv', csvContent + '\n', 'utf8');
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // 在切换到下一个分类之前等待一段时间
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return allMovies;
}

// 开始爬取
crawlMovies(1)
    .then(movies => {
        console.log(`爬取完成，共获取 ${movies.length} 部电影信息`);
    })
    .catch(error => {
        console.error('爬取过程中出现错误:', error);
    });