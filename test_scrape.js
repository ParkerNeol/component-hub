/**
 * 立创商城爬取测试工具
 *
 * 模拟人工操作：打开主页 → 搜索框输入商品编号 → 进入详情页 → 提取参数
 *
 * 用法: node test_scrape.js <商品编号>
 * 示例: node test_scrape.js C22356631
 */

const puppeteer = require('puppeteer');

async function main() {
    const productCode = process.argv[2];
    if (!productCode) {
        console.log('用法: node test_scrape.js <商品编号>');
        console.log('示例: node test_scrape.js C22356631');
        process.exit(1);
    }

    console.log(`\n🔍 开始测试爬取: ${productCode}\n`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // 1. 访问首页
    console.log('1️⃣  访问立创商城首页...');
    await page.goto('https://www.szlcsc.com/', {
        waitUntil: 'networkidle2', timeout: 30000
    });
    console.log('   标题:', await page.title());
    console.log('   URL:', page.url());

    // 2. 在搜索框中输入商品编号
    console.log('\n2️⃣  在搜索框中输入商品编号...');
    const searchInput = await page.$('input[type="text"]');
    if (!searchInput) {
        console.log('   ❌ 找不到搜索框');
        await browser.close();
        return;
    }
    await searchInput.click();
    await searchInput.type(productCode, { delay: 30 });
    console.log('   已输入:', productCode);

    // 3. 回车搜索
    console.log('\n3️⃣  回车搜索...');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 3000));
    console.log('   跳转后标题:', await page.title());
    console.log('   跳转后URL:', page.url());

    // 4. 提取搜索结果中的商品链接
    console.log('\n4️⃣  提取搜索结果...');
    const links = await page.evaluate(() => {
        const items = document.querySelectorAll('a[href*="item.szlcsc.com/"]');
        const results = [];
        const seen = new Set();
        items.forEach(a => {
            const match = a.href.match(/item\.szlcsc\.com\/(\d+)\.html/);
            if (match && !seen.has(match[1])) {
                seen.add(match[1]);
                results.push({
                    id: match[1],
                    url: a.href.split('?')[0],
                    text: a.textContent.trim().substring(0, 60)
                });
            }
        });
        return results.slice(0, 5);
    });
    console.log(`   找到 ${links.length} 个结果:`);
    links.forEach((l, i) => console.log(`   [${i + 1}] ${l.id} | ${l.text || '(无文本)'}`));

    if (links.length === 0) {
        console.log('\n❌ 未找到商品链接，可能搜索被拦截');
        // 打印页面部分内容帮助诊断
        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
        console.log('   页面内容:', bodyText);
        await browser.close();
        return;
    }

    // 5. 点击第一个结果进入详情页
    const targetId = links[0].id;
    console.log(`\n5️⃣  进入商品详情页 (${targetId})...`);
    await page.goto(`https://item.szlcsc.com/${targetId}.html`, {
        waitUntil: 'networkidle2', timeout: 30000
    });
    await new Promise(r => setTimeout(r, 1000));
    console.log('   标题:', await page.title());
    console.log('   URL:', page.url());

    // 6. 提取商品信息
    console.log('\n6️⃣  提取商品信息...');
    const info = await page.evaluate(() => {
        const text = document.body.innerText;

        // 使用 DOM 提取基本信息（页面使用 label/div 结构）
        const getLabelValue = (labelText) => {
            const xpath = `//*[text()='${labelText}']/following-sibling::*[1]`;
            const result = document.evaluate(xpath, document, null,
                XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const el = result.singleNodeValue;
            if (el) return el.textContent.trim();
            const all = document.querySelectorAll('span, div, td, label, p, li');
            for (const el of all) {
                if (el.textContent.trim() === labelText) {
                    const next = el.nextElementSibling;
                    if (next) return next.textContent.trim();
                }
            }
            return '';
        };

        const productCode = getLabelValue('商品编号');
        const brand = getLabelValue('品牌名称') || getLabelValue('品牌');
        const model = getLabelValue('商品型号');
        const pkg = getLabelValue('商品封装');

        // 提取参数表
        const params = [];
        const ps = text.indexOf('商品参数');
        if (ps >= 0) {
            const ps2 = text.indexOf('商品参数', ps + 5);
            const start = ps2 >= 0 ? ps2 : ps;
            const section = text.substring(start, start + 800);
            const lines = section.split('\n');
            for (const line of lines) {
                if (line.includes('数据手册') || line.includes('买了又买') ||
                    line.includes('替代料') || line.includes('商品概')) break;
                const parts = line.split('\t').filter(p => p.trim());
                if (parts.length >= 2) {
                    const label = parts[0].trim();
                    const value = parts[1].trim();
                    if (label && value && label !== '属性' && label !== '参数值' && label !== '对比'
                        && !label.includes('厂家型号') && !label.includes('相似度')) {
                        params.push({ label, value });
                    }
                }
            }
        }

        return { productCode, brand, model, pkg, params };
    });

    // 7. 输出结果
    console.log('   ┌──────────────────────────────────────');
    console.log(`   │ 商品编号: ${info.productCode || '(未提取到)'}`);
    console.log(`   │ 品牌:     ${info.brand || '(未提取到)'}`);
    console.log(`   │ 型号:     ${info.model || '(未提取到)'}`);
    console.log(`   │ 封装:     ${info.pkg || '(未提取到)'}`);
    console.log(`   │ 参数:     ${info.params.length} 项`);
    console.log('   ├──────────────────────────────────────');
    info.params.forEach(p => {
        console.log(`   │ ${p.label.padEnd(16)} = ${p.value}`);
    });
    console.log('   └──────────────────────────────────────');

    await browser.close();
    console.log('\n✅ 测试完成');
}

main().catch(e => {
    console.error('\n❌ 错误:', e.message);
    process.exit(1);
});