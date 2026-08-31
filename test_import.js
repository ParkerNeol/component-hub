/**
 * 立创订单导入 - 分步测试工具
 *
 * 用法: node test_import.js <xls文件路径>
 * 示例: node test_import.js "立创订单样本/立创商城订单详情-SO26010941688.xls"
 *
 * 功能: 测试 XLS 解析、分类映射、后端抓取三个步骤的结果
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

/* ============ 步骤1: 解析 XLS ============ */
function parseXLS(filePath) {
    console.log('\n═══════════════════════════════════════\n  步骤1: 解析 XLS 文件\n═══════════════════════════════════════\n');
    const wb = XLSX.readFile(filePath);
    let sheetName = wb.SheetNames[0];
    for (const n of wb.SheetNames) {
        const ref = wb.Sheets[n]['!ref'];
        if (ref && XLSX.utils.decode_range(ref).e.r > 5) { sheetName = n; break; }
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    const orderCode = rows[0]?.[1] || '?', orderTime = rows[0]?.[8] || '?';
    let hdr = -1;
    for (let i = 0; i < rows.length; i++) if (String(rows[i][0] || '').trim() === '商品明细列表') { hdr = i; break; }
    if (hdr < 0) { console.error('❌ 未找到"商品明细列表"'); return null; }
    const items = [];
    for (let i = hdr + 2; i < rows.length; i++) {
        const r = rows[i];
        if (!String(r[0] || '').trim().match(/^\d+$/)) continue;
        items.push({ 商品编号: String(r[1]||'').trim(), 品牌: String(r[2]||'').trim(), 厂家型号: String(r[3]||'').trim(), 封装: String(r[4]||'').trim(), 商品名称: String(r[5]||'').trim(), 数量: String(r[6]||'').trim() });
    }
    console.log('订单号:', orderCode, '| 时间:', orderTime, '| 商品数:', items.length);
    items.forEach((t, i) => console.log(`  [${i+1}] ${t.商品编号} | ${t.品牌} | ${t.厂家型号} | ${t.封装} | ${t.商品名称} | ${t.数量}`));
    return { orderCode, orderTime, items };
}

/* ============ 步骤2: 分类映射 ============ */
function step2(items) {
    console.log('\n═══════════════════════════════════════\n  步骤2: 分类映射 + 参数提取\n═══════════════════════════════════════\n');
    const CAT = { '电阻':'resistor','贴片电阻':'resistor','电容':'capacitor','贴片电容':'capacitor','电感':'inductor','贴片电感':'inductor','磁珠':'inductor','二极管':'diode','肖特基二极管':'diode','三极管':'transistor','MOS管':'mosfet','LED':'led','发光二极管':'led','晶振':'crystal','集成电路':'ic','IC':'ic','芯片':'ic','连接器':'other','开关':'switch','继电器':'other','传感器':'other','保险丝':'other' };
    function infer(t) {
        const txt = t.toLowerCase();
        if (/电阻|resistor|res|Ω|ω|ohm/.test(txt)) return '贴片电阻';
        if (/电容|capacitor|cap|μf|µf|uf|pf|nf/.test(txt)) return '贴片电容';
        if (/电感|inductor|uh|μh|µh|mh/.test(txt)) return '贴片电感';
        if (/磁珠|bead/.test(txt)) return '磁珠';
        if (/二极管|diode/.test(txt)) return '肖特基二极管';
        if (/N沟道|P沟道|n沟道|p沟道/.test(txt)) return 'MOS管';
        if (/mosfet|mos.?fet|场效应/.test(txt) || /\bmos\b/i.test(txt)) return 'MOS管';
        if (/发光二极管/.test(txt)) return '发光二极管';
        if (/\bled\b|\bled$|^led/i.test(txt) && !/驱动|driver|电源/.test(txt)) return '发光二极管';
        if (/三极管|transistor|npn|pnp/.test(txt)) return 'NPN三极管';
        if (/晶振|crystal|oscillator|谐振/.test(txt)) return '晶振';
        if (/芯片|集成电路|mcu|单片机|微控制器|微处理器/.test(txt)) return '集成电路';
        if (/驱动芯片|电源芯片|运放|放大器/.test(txt)) return '集成电路';
        if (/\bic\b/.test(txt)) return '集成电路';
        if (/连接器|connector|端子|接插件/.test(txt)) return '连接器';
        if (/开关|switch|按键/.test(txt)) return '开关';
        return '(未识别)';
    }
    const mapC = (n) => CAT[n] || 'other';
    items.forEach(t => {
        const cat = infer(t.商品名称 + ' ' + t.厂家型号 + ' ' + t.封装);
        console.log(`  [${t.商品编号}] ${t.商品名称}\n    → 推断分类: ${cat}\n    → 映射品类: ${mapC(cat)}\n`);
    });
}

/* ============ 步骤3: 抓取 ============ */
async function step3(items) {
    console.log('═══════════════════════════════════════\n  步骤3: 后端 Puppeteer 抓取测试\n═══════════════════════════════════════\n');
    const codes = items.slice(0, 5).map(t => t.商品编号);
    for (const code of codes) {
        process.stdout.write(`  ${code} ... `);
        try {
            const r = await fetch(`http://localhost:5000/api/lcsc/product/scrape`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productCode: code }), signal: AbortSignal.timeout(30000) });
            const j = await r.json();
            if (j.success) {
                console.log(`✓ ${j.data.brand || '(无品牌)'} | ${j.data.params.length} 个参数`);
                j.data.params.slice(0, 4).forEach(p => console.log(`    ${p.label} = ${p.value}`));
                if (j.data.params.length > 4) console.log(`    ... 还有 ${j.data.params.length - 4} 个参数`);
            } else {
                console.log(`✗ ${j.error}`);
            }
        } catch(e) { console.log(`✗ ${e.message}`); }
    }
}

/* ============ 主流程 ============ */
async function main() {
    const fp = process.argv[2];
    if (!fp) { console.log('用法: node test_import.js <xls文件路径>\n例: node test_import.js "立创订单样本/立创商城订单详情-SO26010941688.xls"'); process.exit(1); }
    const r = parseXLS(path.resolve(fp));
    if (!r) process.exit(1);
    step2(r.items);
    await step3(r.items);
    console.log('\n═══════════════════════════════════════\n  测试完成\n═══════════════════════════════════════\n');
}
main().catch(e => console.error('错误:', e.message));