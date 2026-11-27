const env = require('./env.json');
const data = require('../data.json');
const temp = require('../temp.json');
const fetch = require('node-fetch');
const { writeFileSync } = require('fs');
const { join } = require('path');
const day = 24 * 60 * 60 * 1000;
class GetWxRank {
    constructor() {
        this.now = Date.now();
        this.yesterday = this.now - 20 * day;
        this.cached = {};
        data.forEach(item => {
            this.cached[`${item.title}:${item.author}`] = 1;
        });
        temp.list.forEach(item => {
            this.cached[`${item.title}:${item.author}`] = 1;
        });
    }


    async run() {
        const list = [];
        let yesterdayKey = this.formatDate(this.yesterday)
        if (!temp.runDate || !temp.runDate[yesterdayKey]) {
            for(let page = 1; page < 4; page++) {
                const result = await this.getLowRank(page);
                list.push(...result);
                const info = await this.getArticleList();
                list.push(...info.list);
            }
        }
        
        
        temp.runDate = temp.runDate || {};
        temp.runDate[yesterdayKey] = true;
        writeFileSync(join(__dirname, '../temp.json'), JSON.stringify(temp, null, 2));
        console.log('add new articles:', list.length)
    }

    async getLowRank(page) {
        
        page = page || 1;
        const res = await fetch('http://data.wxrank.com/weixin/lowfans',
            {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                key:env.WX_RANK_API_KEY,
                date: this.formatDate(this.yesterday),
                range: '7d',
                page: page
            })
        });
        const json = await res.json();
        const list = this.filter(json.data.list);
        console.log(`page： ${page}，new articles: ${list.length}`)
        return list;
    }

    async getArticleList(cursor) {
        const res = await fetch('http://data.wxrank.com/weixin/artlist',
            {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                key:env.WX_RANK_API_KEY,
                date: this.formatDate(this.yesterday),
                content_type: 'article',
                cursor: cursor || undefined
            })
        });
        const json = await res.json();
        const list = this.filter(json.data.list);
        return {
            list,
            cursor: json.data.cursor,
        }
    }

    filter(list) {
        return list.filter(item => {
            if (item.read_num < 100000) {
                return false;
            }
            return item.like_num > 10000 || item.share_num > 10000;
        }).map(item => {
            const author = item.wx_name || temp.name[item.wx_biz];
            if (item.wx_name && !temp.name[item.wx_biz]) {
                temp.name[item.wx_biz] = item.wx_name;
            }
            return {
                author: author,
                likeNum: item.like_num,
                shareNum: item.share_num,
                url: item.art_url,
                title: item.title,
                pubTime: item.pub_time,
                wxBiz: item.wx_biz,
                rank1: item.like_num + item.share_num > 20000
            }
        }).filter(item => {
            const key = `${item.title}:${item.author}`;
            if (this.cached[key]) {
                return false;
            }
            this.cached[key] = 1;
            temp.list.push(item);
            return true;
        })
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    isRank1(item) {
        if (item.author) {
            if (item.author.includes('新闻') || item.author.includes('校友会')) {
                return false;
            }
        }
        if (item.title.includes('新闻') || item.title.includes('通告') || item.title.includes('逝世')) {
            return false;
        }
        return item.likeNum + item.shareNum > 20000;
    }
}

const instance = new GetWxRank()
instance.run()