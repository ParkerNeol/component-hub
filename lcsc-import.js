/**
 * LCSC 立创商城订单一键导入模块
 *
 * 依赖: 需在 main.js 之后加载，通过 LcscImportManager 实例注入 ComponentManager
 *
 * 功能:
 * 1. 管理 LCSC API 凭据（读/写 localStorage）
 * 2. 通过 Node.js 后端代理调用 LCSC API
 * 3. 加载订单列表和订单详情
 * 4. 三级匹配：精确/部分/无匹配
 * 5. 冲突解决 UI（4 个操作按钮）
 * 6. 执行导入（新建元器件/入库）
 */
class LcscImportManager {
    constructor() {
        this.componentManager = null;

        // 状态
        this.orders = [];
        this.currentPage = 1;
        this.totalPages = 1;
        this.currentOrder = null;
        this.orderItems = [];       // 原始 SKU 列表（已丰富）
        this.importResults = [];    // 匹配结果
        this.isLoading = false;

        // 当前订单的时间筛选
        this.dateFilter = {
            startTime: '',
            endTime: ''
        };
    }

    /**
     * 初始化
     * @param {ComponentManager} cm - 主界面 ComponentManager 实例
     */
    init(cm) {
        this.componentManager = cm;
        console.log('[LcscImport] 初始化完成');
    }

    // ==================== 凭据管理 ====================

    getCredentials() {
        try {
            const saved = localStorage.getItem('lcscApiCredentials');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('[LcscImport] 读取凭据失败:', e);
        }
        return null;
    }

    hasCredentials() {
        return !!this.getCredentials();
    }

    // ==================== API 调用 ====================

    /**
     * 通用 API 调用
     */
    async callApi(endpoint, params = {}) {
        const creds = this.getCredentials();
        if (!creds) {
            throw new Error('未配置 LCSC API 凭据，请在设置页面中配置');
        }

        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                appId: creds.appId,
                accessKey: creds.accessKey,
                secretKey: creds.secretKey,
                ...params
            })
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`API 请求失败 (${resp.status}): ${text.substring(0, 200)}`);
        }

        return await resp.json();
    }

    /**
     * 检查后端是否运行
     */
    /**
     * 检查后端服务是否运行。
     * 只判断服务本身是否可达，与 API 凭据是否有效无关。
     * 通过 GET /api/data/health 探测；若服务器不可达（fetch 抛错）则返回 false。
     */
    async checkBackend() {
        try {
            const resp = await fetch('/api/data/health');
            return resp.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * 加载订单列表
     */
    async loadOrders(page = 1, pageSize = 10) {
        const params = {
            currPage: page,
            pageSize: pageSize
        };

        if (this.dateFilter.startTime) {
            params.startCreateTime = this.dateFilter.startTime;
        }
        if (this.dateFilter.endTime) {
            params.endCreateTime = this.dateFilter.endTime;
        }

        const result = await this.callApi('/api/lcsc/order/list', params);
        return result;
    }

    /**
     * 加载订单详情
     */
    async loadOrderDetail(orderCode) {
        const params = { orderCode };
        const result = await this.callApi('/api/lcsc/order/detail', params);
        return result;
    }

    /**
     * 获取 SKU 基本信息（含详细参数）
     */
    async loadProductBasic(productId) {
        const params = { productId };
        const result = await this.callApi('/api/lcsc/product/basic', params);
        return result;
    }

    // ==================== 分类映射 ====================

    /**
     * LCSC 分类名称 → 系统品类 key 映射表
     */
    static LCSC_CATEGORY_MAP = {
        '电阻': 'resistor',
        '贴片电阻': 'resistor',
        '金属膜电阻': 'resistor',
        '碳膜电阻': 'resistor',
        '线绕电阻': 'resistor',
        '排阻': 'resistor',
        'NTC热敏电阻': 'resistor',
        '压敏电阻': 'resistor',
        '可调电阻': 'resistor',
        '电容': 'capacitor',
        '贴片电容': 'capacitor',
        '陶瓷电容': 'capacitor',
        '铝电解电容': 'capacitor',
        '钽电容': 'capacitor',
        '薄膜电容': 'capacitor',
        '超级电容': 'capacitor',
        '安规电容': 'capacitor',
        '电感': 'inductor',
        '贴片电感': 'inductor',
        '功率电感': 'inductor',
        '磁珠': 'inductor',
        '共模电感': 'inductor',
        '变压器': 'inductor',
        '二极管': 'diode',
        '肖特基二极管': 'diode',
        '稳压二极管': 'diode',
        '整流二极管': 'diode',
        '发光二极管': 'diode',
        '三极管': 'transistor',
        'NPN三极管': 'transistor',
        'PNP三极管': 'transistor',
        'MOS管': 'mosfet',
        '场效应管': 'mosfet',
        'MOSFET': 'mosfet',
        'LED': 'led',
        '发光二极管': 'led',
        '晶振': 'crystal',
        '有源晶振': 'crystal',
        '无源晶振': 'crystal',
        '谐振器': 'crystal',
        '集成电路': 'ic',
        'IC': 'ic',
        '芯片': 'ic',
        '电源芯片': 'ic',
        '运放': 'ic',
        '接口芯片': 'ic',
        '驱动芯片': 'ic',
        '存储芯片': 'ic',
        '单片机': 'ic',
        'MCU': 'ic',
        '连接器': 'other',
        '接插件': 'other',
        '端子': 'other',
        '开关': 'switch',
        '轻触开关': 'switch',
        '拨码开关': 'switch',
        '按键': 'switch',
        '保险丝': 'other',
        '继电器': 'other',
        '传感器': 'other',
    };

    /**
     * LCSC 品类名 → 系统子类别映射（粗略）
     */
    static LCSC_SUBCATEGORY_MAP = {
        '贴片电阻': '贴片电阻',
        '贴片电容': '贴片电容',
        '陶瓷电容': '陶瓷电容',
        '铝电解电容': '铝电解电容',
        '钽电容': '钽电容',
        '功率电感': '功率电感',
        '贴片电感': '贴片电感',
        '磁珠': '磁珠',
        '肖特基二极管': '肖特基二极管',
        '稳压二极管': '稳压二极管',
        'MOS管': 'MOS管',
        'NPN三极管': 'NPN三极管',
        'PNP三极管': 'PNP三极管',
        '发光二极管': 'LED',
        '有源晶振': '有源晶振',
        '无源晶振': '无源晶振',
        '单片机': '单片机',
        'MCU': '单片机',
    };

    /**
     * LCSC 参数名称 → 系统参数 ID 映射
     */
    static LCSC_PARAM_MAP = {
        resistor: {
            '阻值': 'p1',
            '电阻值': 'p1',
            '额定功率': 'p2',
            '功率': 'p2',
            '功率(W)': 'p2'
        },
        capacitor: {
            '电容值': 'p1',
            '容值': 'p1',
            '标称容量': 'p1',
            '容量': 'p1',
            '耐压值': 'p2',
            '耐压': 'p2',
            '额定电压': 'p2',
            '电压': 'p2'
        },
        inductor: {
            '电感量': 'p1',
            '电感值': 'p1',
            '额定电流': 'p2',
            '电流': 'p2'
        },
        mosfet: {
            '漏源击穿电压': 'p1',
            'Vdss': 'p1',
            '最大漏极电流': 'p2',
            'Id': 'p2'
        },
        diode: {
            '反向重复峰值电压': 'p1',
            '反向耐压': 'p1',
            '平均整流电流': 'p2',
            '正向压降': 'p3',
            'Vf': 'p3',
            '反向恢复时间': 'p4',
            'Trr': 'p4'
        },
        transistor: {
            '集电极-发射极击穿电压': 'p1',
            'Vceo': 'p1',
            '集电极最大允许电流': 'p2',
            'Ic': 'p2'
        },
        led: {
            '正向压降': 'p1',
            'Vf': 'p1',
            '正向电流': 'p2',
            'If': 'p2',
            '功率': 'p3',
            '发光颜色': 'p4',
            '颜色': 'p4',
            '色温': 'p5'
        },
        crystal: {
            '标称频率': 'p1',
            '频率': 'p1',
            '负载电容': 'p2',
            'CL': 'p2',
            '精度': 'p2'
        }
    };

    // ==================== 分类和参数提取 ====================

    /**
     * 将 LCSC 分类名称映射到系统品类
     */
    mapCategory(lcscCatalogName) {
        if (!lcscCatalogName) return 'other';

        // 尝试精确匹配
        if (LcscImportManager.LCSC_CATEGORY_MAP[lcscCatalogName]) {
            return LcscImportManager.LCSC_CATEGORY_MAP[lcscCatalogName];
        }

        // 模糊匹配：查找包含关系
        const name = lcscCatalogName.toLowerCase();
        for (const [key, value] of Object.entries(LcscImportManager.LCSC_CATEGORY_MAP)) {
            if (name.includes(key.toLowerCase()) || key.toLowerCase().includes(name)) {
                return value;
            }
        }

        return 'other';
    }

    /**
     * 映射 LCSC 分类到系统子类别
     */
    mapSubCategory(lcscCatalogName) {
        if (!lcscCatalogName) return '';

        // 直接映射
        if (LcscImportManager.LCSC_SUBCATEGORY_MAP[lcscCatalogName]) {
            return LcscImportManager.LCSC_SUBCATEGORY_MAP[lcscCatalogName];
        }

        // 从 LCSC_CATEGORY_MAP 找匹配子类
        const name = lcscCatalogName.toLowerCase();
        for (const [key] of Object.entries(LcscImportManager.LCSC_SUBCATEGORY_MAP)) {
            if (name.includes(key.toLowerCase()) || key.toLowerCase().includes(name)) {
                return LcscImportManager.LCSC_SUBCATEGORY_MAP[key];
            }
        }

        return '';
    }

    /**
     * 从 LCSC 产品参数数组中提取系统参数格式
     */
    extractParams(lcscProductParams, systemCategory, subCategory) {
        const cm = this.componentManager;
        if (!cm) return '[]';

        // 获取系统参数定义
        const defs = cm.getEffectiveParamDefs(systemCategory, subCategory);
        if (!defs || defs.length === 0) return '[]';

        // 构建参数名称 → 系统ID 映射
        const paramNameToId = LcscImportManager.LCSC_PARAM_MAP[systemCategory] || {};

        // 将 LCSC 参数转为查找 Map
        const lcscParamMap = {};
        if (lcscProductParams && Array.isArray(lcscProductParams)) {
            lcscProductParams.forEach(p => {
                if (p.name && p.value) {
                    lcscParamMap[p.name.trim()] = p.value.trim();
                }
            });
        }

        const result = defs.map(def => {
            // 查找匹配的 LCSC 参数
            let lcscValue = '';
            let lcscUnit = def.defaultUnit || '';

            // 使用映射表查找
            const expectedParamName = Object.keys(paramNameToId).find(
                name => paramNameToId[name] === def.id
            );

            if (expectedParamName) {
                // 查找精确匹配
                for (const [lcscName, lcscVal] of Object.entries(lcscParamMap)) {
                    if (lcscName.includes(expectedParamName) || expectedParamName.includes(lcscName)) {
                        const parsed = this.parseValueAndUnit(lcscVal);
                        lcscValue = parsed.value;
                        lcscUnit = parsed.unit || def.defaultUnit || '';
                        break;
                    }
                }
            }

            // 如果没有匹配，尝试在剩余参数中查找
            if (!lcscValue) {
                for (const [lcscName, lcscVal] of Object.entries(lcscParamMap)) {
                    if (lcscName.includes(def.label) || def.label.includes(lcscName)) {
                        const parsed = this.parseValueAndUnit(lcscVal);
                        lcscValue = parsed.value;
                        lcscUnit = parsed.unit || def.defaultUnit || '';
                        break;
                    }
                }
            }

            return {
                id: def.id,
                value: lcscValue,
                unit: lcscUnit,
                label: def.label
            };
        });

        return JSON.stringify(result);
    }

    /**
     * 解析值和单位（如 "10kΩ" → { value: "10", unit: "kΩ" }）
     */
    parseValueAndUnit(str) {
        if (!str) return { value: '', unit: '' };

        const match = str.match(/^([\d.]+)\s*(.*)$/);
        if (match) {
            return {
                value: match[1],
                unit: match[2].trim()
            };
        }
        return { value: str, unit: '' };
    }

    // ==================== 匹配算法 ====================

    /**
     * 对订单中的所有 SKU 执行匹配
     */
    matchAllItems(items) {
        const cm = this.componentManager;
        if (!cm) return items.map(item => ({ ...item, match: { status: 'none', confidence: 0, matchedComponent: null, reason: '系统未初始化' } }));

        return items.map(item => {
            const match = this.matchSingleItem(item);
            return { ...item, match };
        });
    }

    /**
     * 三级匹配：精确 → 部分 → 无匹配
     */
    matchSingleItem(item) {
        const cm = this.componentManager;
        const components = cm.components || [];

        // LCSC 产品信息
        const lcscModel = (item.productModel || item.model || '').trim().toLowerCase();
        const lcscBrand = (item.brandName || item.brand || '').trim().toLowerCase();
        const lcscName = (item.productName || item.name || '').trim().toLowerCase();
        const lcscCategory = item._mappedCategory || '';

        // 候选列表
        const candidates = [];

        components.forEach(comp => {
            const compModel = (comp.model || '').trim().toLowerCase();
            const compBrand = (comp.brand || '').trim().toLowerCase();
            const compName = (comp.name || '').trim().toLowerCase();
            const compCategory = (comp.category || '').trim().toLowerCase();
            const compParams = this.getParamsText(comp);

            // === Tier 1: 精确匹配 ===
            // 型号完全一致 + 品牌一致（或都为空）
            if (compModel && lcscModel && compModel === lcscModel) {
                if (compBrand && lcscBrand) {
                    if (compBrand === lcscBrand) {
                        candidates.push({
                            component: comp,
                            confidence: 0.98,
                            reason: '型号+品牌完全匹配',
                            matchType: 'exact'
                        });
                        return; // 此组件已处理
                    } else {
                        // 同型号但不同品牌 → 部分匹配
                        candidates.push({
                            component: comp,
                            confidence: 0.80,
                            reason: `型号匹配但品牌不同 (系统:${compBrand || '空'} vs LCSC:${lcscBrand})`,
                            matchType: 'partial'
                        });
                        return;
                    }
                }
                // 型号匹配，品牌都为空 → 精确
                if (!compBrand && !lcscBrand) {
                    candidates.push({
                        component: comp,
                        confidence: 0.95,
                        reason: '型号完全匹配',
                        matchType: 'exact'
                    });
                    return;
                }
                // 型号匹配，一个品牌为空 → 精确（宽松）
                candidates.push({
                    component: comp,
                    confidence: 0.93,
                    reason: '型号匹配',
                    matchType: 'exact'
                });
                return;
            }
        });

        // 如果已有精确匹配，直接返回
        const exactMatch = candidates.find(c => c.matchType === 'exact');
        if (exactMatch) {
            return {
                status: 'exact',
                confidence: exactMatch.confidence,
                matchedComponent: exactMatch.component,
                reason: exactMatch.reason
            };
        }

        // 所有精确匹配都没找到，继续查找部分匹配
        components.forEach(comp => {
            // 跳过已被精确匹配处理的组件
            if (candidates.some(c => c.component.id === comp.id)) return;

            const compModel = (comp.model || '').trim().toLowerCase();
            const compBrand = (comp.brand || '').trim().toLowerCase();
            const compName = (comp.name || '').trim().toLowerCase();
            const compCategory = (comp.category || '').trim().toLowerCase();
            const compParams = this.getParamsText(comp);

            // === Tier 2: 部分匹配 ===

            // 2a: 同型号但品牌不同（已在上面处理过，但这里处理漏网之鱼）
            if (compModel && lcscModel && compModel === lcscModel) {
                candidates.push({
                    component: comp,
                    confidence: 0.78,
                    reason: `同型号但品牌差异`,
                    matchType: 'partial'
                });
                return;
            }

            // 2b: 同品类 + 名称包含关系
            if (compCategory && lcscCategory && compCategory === lcscCategory) {
                if ((compName && lcscName && (compName.includes(lcscName) || lcscName.includes(compName)))
                    || (compModel && lcscModel && (compModel.includes(lcscModel) || lcscModel.includes(compModel)))) {
                    candidates.push({
                        component: comp,
                        confidence: 0.72,
                        reason: `同品类+名称/型号相似`,
                        matchType: 'partial'
                    });
                    return;
                }
            }

            // 2c: 产品代码匹配（LCSC 料号，如 C8728，全局唯一，是最可靠的匹配信号）
            const lcscProductCode = (item.productCode || '').trim().toLowerCase();
            const compProductCode = (comp.productCode || '').trim().toLowerCase();
            if (lcscProductCode && compProductCode && lcscProductCode === compProductCode) {
                candidates.push({
                    component: comp,
                    confidence: 0.95,
                    reason: '产品代码匹配',
                    matchType: 'exact'
                });
                return;
            }

            // 2d: 品类一致 + 有数值重叠
            if (compCategory && lcscCategory && compCategory === lcscCategory) {
                const lcscValues = this.extractNumericValues(item._paramsText || '');
                const compValues = this.extractNumericValues(compParams);
                if (lcscValues.length > 0 && compValues.length > 0) {
                    const hasOverlap = lcscValues.some(lv =>
                        compValues.some(cv => Math.abs(lv - cv) / Math.max(lv, cv) < 0.1)
                    );
                    if (hasOverlap) {
                        candidates.push({
                            component: comp,
                            confidence: 0.65,
                            reason: '同品类+参数值重叠',
                            matchType: 'partial'
                        });
                        return;
                    }
                }
            }
        });

        // 找到最佳部分匹配
        if (candidates.length > 0) {
            // 按置信度排序
            candidates.sort((a, b) => b.confidence - a.confidence);
            const best = candidates[0];
            return {
                status: best.matchType === 'exact' ? 'exact' : 'partial',
                confidence: best.confidence,
                matchedComponent: best.component,
                reason: best.reason
            };
        }

        // === Tier 3: 无匹配 ===
        return {
            status: 'none',
            confidence: 0,
            matchedComponent: null,
            reason: '系统中未找到匹配的元器件'
        };
    }

    /**
     * 获取组件的参数字符串
     */
    getParamsText(component) {
        if (!component) return '';
        if (component.params) {
            try {
                const params = typeof component.params === 'string' ?
                    JSON.parse(component.params) : component.params;
                if (Array.isArray(params) && params.length > 0) {
                    return params.filter(p => p.value).map(p => p.value + (p.unit || '')).join(' ');
                }
            } catch (e) {}
        }
        if (component.value) return component.value;
        return '';
    }

    /**
     * 从文本中提取数值
     */
    extractNumericValues(text) {
        if (!text) return [];
        const matches = text.match(/\d+\.?\d*/g);
        return matches ? matches.map(m => parseFloat(m)).filter(v => !isNaN(v) && v > 0) : [];
    }

    // ==================== 导入执行 ====================

    /**
     * 执行导入
     * @param {Array} results - 匹配结果数组（每个元素带决定）
     * @returns {Object} 导入结果统计
     */
    executeImport(results) {
        const cm = this.componentManager;
        if (!cm) throw new Error('ComponentManager 未初始化');

        let created = 0;
        let inbound = 0;
        let errors = [];
        const inbounds = [];  // 用于批量入库记录

        results.forEach(result => {
            try {
                if (result._action === 'skip') return;

                const quantity = parseInt(result.finalNumber || result.quantity || 1);

                switch (result._action) {
                    case 'inbound_keep': {
                        // 入库保持现有参数
                        const comp = result.match.matchedComponent;
                        const beforeStock = comp.stock;
                        comp.stock += quantity;
                        comp.updatedAt = new Date().toISOString();
                        cm.saveHistoryRecord('inbound', comp.name, quantity, beforeStock, comp.stock);
                        inbound++;
                        inbounds.push({ id: comp.id, name: comp.name, quantity });
                        break;
                    }

                    case 'inbound_update': {
                        // 入库并使用订单参数
                        const comp = result.match.matchedComponent;
                        const beforeStock = comp.stock;
                        comp.stock += quantity;
                        comp.model = result.productModel || comp.model;
                        comp.brand = result.brandName || comp.brand;
                        comp.params = result._extractedParams || comp.params;
                        comp.value = result._extractedParams || comp.value;
                        comp.image = result._imageUrl || comp.image;
                        comp.datasheet = result._datasheetUrl || comp.datasheet;
                        comp.productCode = result.productCode || comp.productCode;
                        // 更新备注，追加参数信息
                        const paramNote = result._paramsFormatted ? `\n商品参数: ${result._paramsFormatted}` : '';
                        const lcscNote = result._productUrl ? ` | 立创详情: ${result._productUrl}` : '';
                        if (paramNote || lcscNote) {
                            comp.notes = (comp.notes || '') + paramNote + lcscNote;
                        }
                        comp.updatedAt = new Date().toISOString();
                        cm.saveHistoryRecord('inbound', comp.name, quantity, beforeStock, comp.stock);
                        inbound++;
                        inbounds.push({ id: comp.id, name: comp.name, quantity });
                        break;
                    }

                    case 'create_new': {
                        // 创建新元器件
                        const newComp = this.createComponentFromOrderItem(result);
                        cm.components.push(newComp);
                        if (quantity > 0) {
                            cm.saveHistoryRecord('inbound', newComp.name, quantity, 0, quantity);
                        }
                        created++;
                        break;
                    }

                    // inbound_edit 功能未实现：按"使用订单参数入库"处理，避免静默失败
                    case 'inbound_edit': {
                        const comp = result.match.matchedComponent;
                        const beforeStock = comp.stock;
                        comp.stock += quantity;
                        comp.model = result.productModel || comp.model;
                        comp.brand = result.brandName || comp.brand;
                        comp.params = result._extractedParams || comp.params;
                        comp.value = result._extractedParams || comp.value;
                        comp.image = result._imageUrl || comp.image;
                        comp.datasheet = result._datasheetUrl || comp.datasheet;
                        comp.productCode = result.productCode || comp.productCode;
                        comp.updatedAt = new Date().toISOString();
                        cm.saveHistoryRecord('inbound', comp.name, quantity, beforeStock, comp.stock);
                        inbound++;
                        inbounds.push({ id: comp.id, name: comp.name, quantity });
                        break;
                    }

                    default:
                        errors.push(`${result.productName || result.name}: 未选择操作`);
                }
            } catch (e) {
                errors.push(`${result.productName || result.name}: ${e.message}`);
                console.error('[LcscImport] 导入项失败:', e);
            }
        });

        // 保存
        if (created > 0 || inbound > 0) {
            cm.saveData();
            // 记录批量入库到 inboundRecords
            if (inbound > 0) {
                const record = {
                    id: 'inbound_' + Date.now(),
                    timestamp: new Date().toISOString(),
                    type: 'lcsc_import',
                    orderCode: this.currentOrder?.orderCode || '',
                    items: inbounds,
                    totalItems: inbounds.length,
                    totalQuantity: inbounds.reduce((sum, item) => sum + item.quantity, 0)
                };
                try {
                    const records = JSON.parse(localStorage.getItem('inboundRecords') || '[]');
                    records.push(record);
                    localStorage.setItem('inboundRecords', JSON.stringify(records));
                } catch (e) { console.error('[LcscImport] 保存入库记录失败:', e); }
            }
            // 刷新界面（延迟一帧执行，避免导入时大量DOM操作卡顿）
            requestAnimationFrame(() => {
                cm.filterAndRender(false);
                cm.updateStatistics();
            });
        }

        return { created, inbound, errors };
    }

    /**
     * 从订单项创建元器件对象
     */
    createComponentFromOrderItem(item) {
        const cm = this.componentManager;
        const category = item._mappedCategory || 'other';
        const subCategory = item._mappedSubCategory || '';
        const params = item._extractedParams || '[]';

        // 构建备注：包含厂家型号、详情页链接和商品参数
        let notes = `从 LCSC 订单导入 (${this.currentOrder?.orderCode || ''})`;
        if (item.manufacturerModel) {
            notes += ` | 厂家型号: ${item.manufacturerModel}`;
        }
        if (item._productUrl) {
            notes += ` | 立创详情: ${item._productUrl}`;
        }
        if (item._paramsFormatted) {
            notes += `\n商品参数: ${item._paramsFormatted}`;
        }

        const newComp = {
            id: cm.generateId(),
            name: item.productName || item.name || '未命名',
            // 型号规格 = 封装（在库管理系统中"型号规格就是封装"）
            model: item.productModel || item.model || '',
            brand: item.brandName || item.brand || '',
            productCode: item.productCode || '',
            encapStandard: item.encapStandard || '',
            category: category,
            subCategory: subCategory,
            value: params,
            params: params,
            stock: parseInt(item.finalNumber || item.quantity || 0),
            threshold: 10,
            location: this.getNextLocation(category),
            notes: notes,
            image: item._imageUrl || '',
            datasheet: item._datasheetUrl || '',
            createdAt: new Date().toISOString()
        };

        return newComp;
    }

    /**
     * 获取下一个位置编号
     */
    getNextLocation(category) {
        const cm = this.componentManager;
        // 从 locationPrefixConfig 获取品类前缀
        const prefixConfig = JSON.parse(localStorage.getItem('locationPrefixConfig') || '{}');
        const defaultPrefixes = {
            resistor: 'R', capacitor: 'C', inductor: 'L',
            transistor: 'Q', diode: 'D', led: 'LED',
            ic: 'U', switch: 'S', crystal: 'X',
            mosfet: 'M', other: 'O'
        };
        const prefix = prefixConfig[category] || defaultPrefixes[category] || 'X';

        // 查找同一品类中的最大编号
        let maxNum = 0;
        if (cm.components) {
            cm.components.forEach(comp => {
                if (comp.category === category && comp.location) {
                    const match = comp.location.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
                    if (match) {
                        const num = parseInt(match[1]);
                        if (num > maxNum) maxNum = num;
                    }
                }
            });
        }
        return prefix + (maxNum + 1);
    }

    // ==================== 订单数据丰富和预处理 ====================

    /**
     * 准备导入的完整流程：加载订单详情 → 丰富产品信息 → 匹配
     */
    async prepareImport(orderCode, onProgress) {
        this.currentOrder = this.orders.find(o => o.orderCode === orderCode) || { orderCode };

        // 步骤1: 获取订单详情
        if (onProgress) onProgress(1, 3, '正在获取订单详情...');
        const detailResult = await this.loadOrderDetail(orderCode);

        // 提取 SKU 列表
        let items = [];
        if (detailResult.data) {
            // 从响应中提取 SKU 列表
            if (detailResult.data.orderSkuInfoVOS) {
                items = detailResult.data.orderSkuInfoVOS;
            } else if (detailResult.data.skuList) {
                items = detailResult.data.skuList;
            } else if (detailResult.data.orderItemVOS) {
                items = detailResult.data.orderItemVOS;
            } else if (detailResult.data.list) {
                items = detailResult.data.list;
            }
        }

        // 也直接从顶层检查
        if (items.length === 0 && Array.isArray(detailResult.orderSkuInfoVOS)) {
            items = detailResult.orderSkuInfoVOS;
        }

        // 如果还是空，尝试从 OrderDetailResult 结构提取
        if (items.length === 0 && detailResult.resultData) {
            if (detailResult.resultData.orderSkuInfoVOS) {
                items = detailResult.resultData.orderSkuInfoVOS;
            }
        }

        // 最后手段：尝试找到任何数组字段
        if (items.length === 0) {
            for (const key of Object.keys(detailResult)) {
                if (Array.isArray(detailResult[key])) {
                    items = detailResult[key];
                    break;
                }
            }
        }

        if (items.length === 0) {
            // 如果还是没有，可能需要检查数据中的嵌套结构
            console.warn('[LcscImport] 未找到 SKU 列表，原始响应:', detailResult);
            // 尝试直接使用 response.data
            const data = detailResult.resultData || detailResult.data || detailResult;
            for (const key of Object.keys(data)) {
                if (Array.isArray(data[key])) {
                    items = data[key];
                    break;
                }
            }
        }

        this.orderItems = items.map((item, index) => ({
            ...item,
            _index: index,
            productId: item.productId || item.id,
            productCode: item.productCode || item.code || '',
            productName: item.productName || item.name || '未命名',
            productModel: item.productModel || item.model || '',
            brandName: item.brandName || item.brand || '',
            finalNumber: item.finalNumber || item.quantity || item.num || 1,
        }));

        // 步骤2: 丰富产品信息（获取参数、图片、数据手册）
        if (onProgress) onProgress(2, 3, `正在获取 ${this.orderItems.length} 个产品的详细信息...`);

        const enriched = [];
        for (let i = 0; i < this.orderItems.length; i++) {
            const item = this.orderItems[i];
            try {
                if (onProgress) onProgress(2, 3, `正在获取产品信息 (${i + 1}/${this.orderItems.length}): ${item.productName}`);
                const productInfo = await this.loadProductBasic(item.productId);
                this.enrichItem(item, productInfo);
            } catch (e) {
                console.warn(`[LcscImport] 获取产品信息失败 (ID:${item.productId}):`, e.message);
            }
            enriched.push(item);
        }

        this.orderItems = enriched;

        // 映射分类
        this.orderItems.forEach(item => {
            const catalogName = item.parentCatalogName || item.catalogName || item.categoryName || '';
            item._mappedCategory = this.mapCategory(catalogName);
            item._mappedSubCategory = this.mapSubCategory(catalogName);
        });

        // 提取参数
        this.orderItems.forEach(item => {
            const productParams = item.productParams || item.parameters || item.specs || [];
            item._extractedParams = this.extractParams(productParams, item._mappedCategory, item._mappedSubCategory);
            item._paramsText = this.getParamsTextFromResult(item);
        });

        // 步骤3: 执行匹配
        if (onProgress) onProgress(3, 3, '正在匹配系统已有元器件...');
        this.importResults = this.matchAllItems(this.orderItems);

        return this.importResults;
    }

    /**
     * 从产品信息中丰富订单项
     */
    enrichItem(item, productInfo) {
        // 处理不同响应格式
        let basicInfo = null;
        if (productInfo.data) {
            if (Array.isArray(productInfo.data)) {
                basicInfo = productInfo.data[0];
            } else if (productInfo.data.productBasicInfoVOS) {
                basicInfo = productInfo.data.productBasicInfoVOS[0];
            } else {
                basicInfo = productInfo.data;
            }
        } else if (productInfo.resultData) {
            basicInfo = productInfo.resultData;
        }

        if (!basicInfo) return;

        // 补充信息
        item.productName = item.productName || basicInfo.productName || '';
        item.productModel = item.productModel || basicInfo.productModel || '';
        item.brandName = item.brandName || basicInfo.brandName || '';
        item.productCode = item.productCode || basicInfo.productCode || '';
        item.parentCatalogName = item.parentCatalogName || basicInfo.parentCatalogName || '';
        item.catalogName = item.catalogName || basicInfo.catalogName || '';
        item.encapStandard = item.encapStandard || basicInfo.encapStandard || '';

        // 参数
        item.productParams = basicInfo.productParams || basicInfo.parameters || basicInfo.specs || [];
        item.productImage = basicInfo.productImage || basicInfo.imageUrl || basicInfo.img || '';
        item.productDatasheet = basicInfo.productDatasheet || basicInfo.datasheetUrl || basicInfo.pdfUrl || basicInfo.datasheet || '';

        // 构建图片和数据手册 URL
        this.buildItemUrls(item);
    }

    /**
     * 构建图片和数据手册 URL（如果 API 未返回）
     */
    buildItemUrls(item) {
        const productCode = item.productCode || '';
        if (!item._imageUrl && productCode) {
            // LCSC 图片 URL 模式：https://image.lcsc.com/image/LCSC_图片名
            // 常见格式: https://assets.lcsc.com/products/... 或 https://image.lcsc.com/...
            if (item.productImage) {
                // 如果是相对路径，补全
                if (item.productImage.startsWith('http')) {
                    item._imageUrl = item.productImage;
                } else {
                    item._imageUrl = item.productImage;
                }
            }
        } else if (item.productImage) {
            item._imageUrl = item.productImage;
        }

        // 数据手册 URL
        if (item.productDatasheet) {
            if (item.productDatasheet.startsWith('http')) {
                item._datasheetUrl = item.productDatasheet;
            } else {
                item._datasheetUrl = item.productDatasheet;
            }
        }
    }

    /**
     * 从结果中获取参数文本（用于匹配）
     */
    getParamsTextFromResult(item) {
        try {
            const params = JSON.parse(item._extractedParams || '[]');
            return params.filter(p => p.value).map(p => p.value + (p.unit || '')).join(' ');
        } catch (e) {
            return '';
        }
    }

    // ==================== UI 控制 ====================

    /**
     * 打开订单浏览器
     */
    openOrderBrowser() {
        // 检查是否有凭据
        if (!this.hasCredentials()) {
            this.showNoCredentialsModal();
            return;
        }

        // 检查后端是否运行
        this.checkBackend().then(isRunning => {
            if (!isRunning) {
                this.showBackendNotRunningModal();
                return;
            }
            this.showOrderBrowserModal();
        });
    }

    /**
     * 显示"凭据未配置"提示
     */
    showNoCredentialsModal() {
        // 复用一个简单 modal 或创建新 modal
        const modal = document.getElementById('lcscOrderModal');
        if (!modal) return;

        modal.classList.remove('hidden');
        const body = modal.querySelector('.modal-body');
        if (body) {
            body.innerHTML = `
                <div class="text-center py-12">
                    <div class="w-20 h-20 mx-auto mb-4 bg-gray-700/50 rounded-full flex items-center justify-center">
                        <svg class="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-medium text-white mb-2">未配置 API 凭据</h3>
                    <p class="text-gray-400 mb-6">请先在设置页面配置 LCSC API 密钥</p>
                    <a href="settings.html" class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                        前往设置
                    </a>
                </div>
            `;
        }
    }

    /**
     * 显示"后端未运行"提示
     */
    showBackendNotRunningModal() {
        const modal = document.getElementById('lcscOrderModal');
        if (!modal) return;

        modal.classList.remove('hidden');
        const body = modal.querySelector('.modal-body');
        if (body) {
            body.innerHTML = `
                <div class="text-center py-12">
                    <div class="w-20 h-20 mx-auto mb-4 bg-yellow-900/30 rounded-full flex items-center justify-center">
                        <svg class="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-medium text-white mb-2">后端服务未运行</h3>
                    <p class="text-gray-400 mb-2">LCSC 订单导入需要 Node.js 后端服务</p>
                    <div class="bg-gray-800/50 rounded-lg p-4 inline-block text-left mb-6">
                        <code class="text-sm text-green-400">cd component-hub && node server.js</code>
                    </div>
                    <button onclick="document.getElementById('lcscOrderModal').classList.add('hidden')"
                            class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors">
                        关闭
                    </button>
                </div>
            `;
        }
    }

    /**
     * 显示订单浏览器
     */
    async showOrderBrowserModal() {
        const modal = document.getElementById('lcscOrderModal');
        if (!modal) return;

        modal.classList.remove('hidden');
        const body = modal.querySelector('.modal-body');
        if (!body) return;

        body.innerHTML = `
            <div class="text-center py-12">
                <div class="w-10 h-10 mx-auto mb-4">
                    <svg class="animate-spin text-blue-500 w-10 h-10" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                </div>
                <p class="text-gray-400">正在加载订单列表...</p>
            </div>
        `;

        try {
            const result = await this.loadOrders(this.currentPage, 10);
            this.renderOrderList(body, result);
        } catch (e) {
            body.innerHTML = `
                <div class="text-center py-12">
                    <div class="w-20 h-20 mx-auto mb-4 bg-red-900/30 rounded-full flex items-center justify-center">
                        <svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-medium text-white mb-2">加载失败</h3>
                    <p class="text-gray-400 mb-4">${e.message}</p>
                    <button onclick="window.lcscImportManager?.showOrderBrowserModal()"
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                        重试
                    </button>
                </div>
            `;
        }
    }

    /**
     * 渲染订单列表
     */
    renderOrderList(container, result) {
        let orders = [];
        let totalPage = 1;
        let totalRow = 0;
        let currPage = this.currentPage;

        // 解析不同响应格式
        if (result.data && result.data.dataList) {
            orders = result.data.dataList;
            totalPage = result.data.totalPage || 1;
            totalRow = result.data.totalRow || orders.length;
            currPage = result.data.currPage || this.currentPage;
        } else if (result.data && Array.isArray(result.data)) {
            orders = result.data;
            totalRow = orders.length;
        } else if (result.resultData && result.resultData.dataList) {
            orders = result.resultData.dataList;
            totalPage = result.resultData.totalPage || 1;
            totalRow = result.resultData.totalRow || orders.length;
        } else if (Array.isArray(result.dataList)) {
            orders = result.dataList;
            totalPage = result.totalPage || 1;
            totalRow = result.totalRow || orders.length;
        } else if (Array.isArray(result)) {
            orders = result;
            totalRow = orders.length;
        }

        this.orders = orders.map((o, i) => ({
            ...o,
            _index: i,
            orderCode: o.orderCode || o.code || o.orderNo || '',
            orderTime: o.orderTime || o.createTime || o.createdAt || o.date || '',
            orderStatus: o.orderStatus || o.status || '',
            payAmount: o.payAmount || o.totalAmount || o.amount || 0,
            skuCount: o.skuCount || o.itemCount || o.productCount || 0
        }));

        this.totalPages = totalPage;

        container.innerHTML = `
            <div class="space-y-4">
                <!-- 筛选栏 -->
                <div class="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-700/50">
                    <div class="flex items-center space-x-2">
                        <label class="text-sm text-gray-400">开始日期</label>
                        <input type="date" id="filterStartDate" value="${this.dateFilter.startTime}"
                               class="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none">
                    </div>
                    <div class="flex items-center space-x-2">
                        <label class="text-sm text-gray-400">结束日期</label>
                        <input type="date" id="filterEndDate" value="${this.dateFilter.endTime}"
                               class="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none">
                    </div>
                    <button id="applyDateFilter"
                            class="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded text-sm transition-colors">
                        筛选
                    </button>
                    <button id="resetDateFilter"
                            class="px-3 py-1.5 bg-gray-600/80 hover:bg-gray-600 text-white rounded text-sm transition-colors">
                        重置
                    </button>
                </div>

                <!-- 订单列表 -->
                ${this.orders.length === 0 ? `
                    <div class="text-center py-8">
                        <p class="text-gray-500">暂无订单数据</p>
                    </div>
                ` : `
                    <div class="space-y-2">
                        ${this.orders.map(order => `
                            <div class="flex items-center justify-between bg-gray-800/50 hover:bg-gray-800 rounded-lg p-4 transition-colors">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center space-x-3">
                                        <span class="text-white font-medium truncate">${order.orderCode || '未知订单'}</span>
                                        <span class="text-xs px-2 py-0.5 rounded ${this.getStatusBadgeClass(order.orderStatus)}">${order.orderStatus || '--'}</span>
                                    </div>
                                    <div class="flex items-center space-x-4 mt-1 text-xs text-gray-400">
                                        <span>${order.orderTime || '--'}</span>
                                        <span>${order.skuCount || 0} 种商品</span>
                                        <span>¥${order.payAmount || 0}</span>
                                    </div>
                                </div>
                                <button onclick="window.lcscImportManager?.startImportOrder('${order.orderCode}')"
                                        class="ml-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors whitespace-nowrap">
                                    导入此订单
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `}

                <!-- 分页 -->
                ${totalPage > 1 ? `
                    <div class="flex items-center justify-between pt-4 border-t border-gray-700/50">
                        <span class="text-sm text-gray-400">共 ${totalRow} 条</span>
                        <div class="flex items-center space-x-2">
                            <button class="page-btn px-3 py-1 rounded text-sm ${this.currentPage <= 1 ? 'text-gray-600 cursor-not-allowed' : 'text-white bg-gray-700 hover:bg-gray-600'}"
                                    ${this.currentPage <= 1 ? 'disabled' : ''} data-page="${this.currentPage - 1}">
                                上一页
                            </button>
                            <span class="text-sm text-gray-400">${this.currentPage} / ${totalPage}</span>
                            <button class="page-btn px-3 py-1 rounded text-sm ${this.currentPage >= totalPage ? 'text-gray-600 cursor-not-allowed' : 'text-white bg-gray-700 hover:bg-gray-600'}"
                                    ${this.currentPage >= totalPage ? 'disabled' : ''} data-page="${this.currentPage + 1}">
                                下一页
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        // 绑定事件
        const self = this;
        container.querySelectorAll('.page-btn').forEach(btn => {
            if (!btn.disabled) {
                btn.addEventListener('click', () => {
                    self.currentPage = parseInt(btn.dataset.page);
                    self.showOrderBrowserModal();
                });
            }
        });

        const startInput = container.querySelector('#filterStartDate');
        const endInput = container.querySelector('#filterEndDate');
        if (startInput && endInput) {
            container.querySelector('#applyDateFilter')?.addEventListener('click', () => {
                self.dateFilter.startTime = startInput.value ? startInput.value + ' 00:00:00' : '';
                self.dateFilter.endTime = endInput.value ? endInput.value + ' 23:59:59' : '';
                self.currentPage = 1;
                self.showOrderBrowserModal();
            });
            container.querySelector('#resetDateFilter')?.addEventListener('click', () => {
                self.dateFilter = { startTime: '', endTime: '' };
                startInput.value = '';
                endInput.value = '';
                self.currentPage = 1;
                self.showOrderBrowserModal();
            });
        }
    }

    /**
     * 获取订单状态标签样式
     */
    getStatusBadgeClass(status) {
        if (!status) return 'bg-gray-700 text-gray-400';
        const s = String(status).toLowerCase();
        if (s.includes('完成') || s.includes('finish') || s.includes('done') || s.includes('received')) {
            return 'bg-green-900/40 text-green-400';
        }
        if (s.includes('发货') || s.includes('ship') || s.includes('deliver') || s.includes('运输')) {
            return 'bg-blue-900/40 text-blue-400';
        }
        if (s.includes('处理') || s.includes('process') || s.includes('pending')) {
            return 'bg-yellow-900/40 text-yellow-400';
        }
        if (s.includes('取消') || s.includes('cancel')) {
            return 'bg-red-900/40 text-red-400';
        }
        return 'bg-gray-700/50 text-gray-400';
    }

    // ==================== 导入向导 ====================

    /**
     * 开始导入某个订单
     */
    async startImportOrder(orderCode) {
        // 打开导入向导 modal
        const modal = document.getElementById('lcscImportModal');
        if (!modal) return;
        modal.classList.remove('hidden');

        const body = modal.querySelector('.import-wizard-body');
        if (!body) return;

        // 显示步骤1：加载中
        body.innerHTML = this.renderStep1Loading();

        try {
            const results = await this.prepareImport(orderCode, (step, total, message) => {
                body.innerHTML = this.renderStep1Loading(step, total, message);
            });

            // 显示步骤2：匹配结果
            body.innerHTML = this.renderStep2Results(results);
        } catch (e) {
            body.innerHTML = `
                <div class="text-center py-12">
                    <div class="w-20 h-20 mx-auto mb-4 bg-red-900/30 rounded-full flex items-center justify-center">
                        <svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-medium text-white mb-2">导入失败</h3>
                    <p class="text-gray-400 mb-4">${e.message}</p>
                    <button onclick="document.getElementById('lcscImportModal').classList.add('hidden')"
                            class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors">
                        关闭
                    </button>
                </div>
            `;
        }
    }

    /**
     * 渲染步骤1：加载中
     */
    renderStep1Loading(current = 1, total = 3, message = '正在准备...') {
        const progress = (current / total) * 100;
        return `
            <div class="py-12">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 mx-auto mb-4">
                        <svg class="animate-spin text-blue-500 w-16 h-16" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                    </div>
                    <h3 class="text-lg font-medium text-white mb-2">正在处理订单</h3>
                    <p class="text-gray-400 text-sm" id="importProgressMsg">${message}</p>
                </div>
                <div class="max-w-md mx-auto">
                    <div class="bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div class="bg-blue-500 h-full rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                    </div>
                    <div class="flex justify-between mt-2 text-xs text-gray-500">
                        <span>解析订单文件</span>
                        <span>处理商品信息</span>
                        <span>抓取参数</span>
                        <span>匹配元器件</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染步骤2：匹配结果
     */
    renderStep2Results(results) {
        const exactCount = results.filter(r => r.match.status === 'exact').length;
        const partialCount = results.filter(r => r.match.status === 'partial').length;
        const noneCount = results.filter(r => r.match.status === 'none').length;

        return `
            <div class="space-y-4">
                <!-- 进度概要 -->
                <div class="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                    <div class="flex items-center space-x-4">
                        <span class="text-sm text-gray-400">匹配结果：</span>
                        <span class="text-sm text-green-400">${exactCount} 个精确匹配</span>
                        <span class="text-sm text-yellow-400">${partialCount} 个部分匹配</span>
                        <span class="text-sm text-blue-400">${noneCount} 个新器件</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="text-xs text-gray-500" id="importDecisionCount">待处理: ${partialCount}</span>
                    </div>
                </div>

                <!-- 元器件列表 -->
                <div class="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                    ${results.map((item, index) => this.renderMatchItemCard(item, index)).join('')}
                </div>

                <!-- 操作按钮 -->
                <div class="flex items-center justify-between pt-4 border-t border-gray-700/50">
                    <button onclick="document.getElementById('lcscImportModal').classList.add('hidden')"
                            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm">
                        取消
                    </button>
                    <button id="confirmImportBtn"
                            onclick="window.lcscImportManager?.executeImportAction()"
                            class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center space-x-2"
                            ${partialCount > 0 ? 'disabled' : ''}>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        <span>${partialCount > 0 ? '请先处理部分匹配项' : '执行导入'}</span>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * 渲染单个匹配项卡片
     */
    renderMatchItemCard(item, index) {
        const match = item.match;
        const statusBadge = {
            'exact': '<span class="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-700/30">精确匹配 · 自动入库</span>',
            'partial': '<span class="text-xs px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400 border border-yellow-700/30">部分匹配 · 请选择操作</span>',
            'none': '<span class="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-700/30">新元器件 · 自动新建</span>'
        };

        const paramsText = item._paramsText || '';
        const existingComp = match.matchedComponent;
        const existingParamsText = existingComp ? this.getParamsText(existingComp) : '';
        const orderQty = item.finalNumber || item.quantity || 1;

        return `
            <div class="bg-gray-800/30 border ${match.status === 'partial' ? 'border-yellow-600/30' : match.status === 'exact' ? 'border-green-700/20' : 'border-blue-700/20'} rounded-lg p-4 item-card" data-index="${index}">
                <!-- 头部 -->
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center space-x-2">
                            <span class="text-white font-medium truncate">${item.productName || '未命名'}</span>
                            ${statusBadge[match.status] || ''}
                        </div>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-400">
                            ${item.productModel ? `<span>型号: ${item.productModel}</span>` : ''}
                            ${item.brandName ? `<span>品牌: ${item.brandName}</span>` : ''}
                            ${item.productCode ? `<span>料号: ${item.productCode}</span>` : ''}
                            ${item._mappedCategory ? `<span>分类: ${item._mappedCategory}</span>` : ''}
                        </div>
                        ${paramsText ? `<div class="mt-1 text-xs text-gray-500">参数: ${paramsText}</div>` : ''}
                        <div class="mt-1 text-sm text-blue-400">订购数量: ${orderQty}</div>
                    </div>
                </div>

                <!-- 匹配详情 -->
                <div class="text-xs text-gray-500 mb-3">${match.reason || ''}</div>

                <!-- 部分匹配：冲突解决 -->
                ${match.status === 'partial' ? this.renderConflictActions(item, index, existingComp, existingParamsText) : ''}

                <!-- 精确/新建：自动接受标记 -->
                ${match.status !== 'partial' ? `
                    <div class="flex items-center justify-end">
                        <input type="hidden" class="item-action" value="${match.status === 'exact' ? 'inbound_keep' : 'create_new'}">
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * 渲染冲突解决按钮
     */
    renderConflictActions(item, index, existingComp, existingParamsText) {
        const orderQty = item.finalNumber || item.quantity || 1;
        return `
            <div class="bg-gray-900/40 rounded-lg p-3 mb-2">
                <div class="grid grid-cols-2 gap-3 mb-2">
                    <div>
                        <div class="text-xs text-gray-500 mb-1">立创订单商品</div>
                        <div class="text-xs text-white">${item.productModel || '--'}</div>
                        <div class="text-xs text-gray-400">${item.brandName || '--'}</div>
                        <div class="text-xs text-gray-500">${item._paramsText || '--'}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500 mb-1">系统已有元器件</div>
                        <div class="text-xs text-white">${existingComp?.model || '--'}</div>
                        <div class="text-xs text-gray-400">${existingComp?.brand || '--'}</div>
                        <div class="text-xs text-gray-500">${existingParamsText || '--'}</div>
                        <div class="text-xs text-green-400">库存: ${existingComp?.stock || 0}</div>
                    </div>
                </div>
            </div>
            <div class="flex flex-wrap gap-1.5">
                <button onclick="window.lcscImportManager?.setAction(${index}, 'inbound_keep')"
                        class="action-btn px-2.5 py-1.5 text-xs rounded bg-green-600/20 text-green-400 border border-green-600/30 hover:bg-green-600/40 transition-colors"
                        data-action="inbound_keep" data-index="${index}">
                    1. 入库(保持参数)
                </button>
                <button onclick="window.lcscImportManager?.setAction(${index}, 'inbound_update')"
                        class="action-btn px-2.5 py-1.5 text-xs rounded bg-blue-600/20 text-blue-400 border border-blue-600/30 hover:bg-blue-600/40 transition-colors"
                        data-action="inbound_update" data-index="${index}">
                    2. 入库(使用订单参数)
                </button>
                <button onclick="window.lcscImportManager?.setAction(${index}, 'create_new')"
                        class="action-btn px-2.5 py-1.5 text-xs rounded bg-orange-600/20 text-orange-400 border border-orange-600/30 hover:bg-orange-600/40 transition-colors"
                        data-action="create_new" data-index="${index}">
                    3. 创建为新元器件
                </button>
            </div>
        `;
    }

    /**
     * 设置某个匹配项的操作
     */
    setAction(index, action) {
        const result = this.importResults[index];
        if (!result) return;

        result._action = action;

        // 更新 UI
        const card = document.querySelector(`.item-card[data-index="${index}"]`);
        if (card) {
            // 高亮选中的按钮
            card.querySelectorAll('.action-btn').forEach(btn => {
                const isSelected = btn.dataset.action === action;
                btn.classList.toggle('ring-2', isSelected);
                btn.classList.toggle('ring-offset-1', isSelected);
                btn.classList.toggle('ring-offset-gray-800', isSelected);
                btn.classList.toggle('opacity-70', !isSelected);
            });
        }

        // 更新确认按钮状态
        this.updateImportButtonState();
    }

    /**
     * 更新确认按钮状态（检查是否所有部分匹配都已处理）
     * 同时支持 API 导入按钮 (confirmImportBtn) 和 XLS 导入按钮 (confirmXLSImportBtn)
     */
    updateImportButtonState() {
        const btn = document.getElementById('confirmImportBtn');
        const xlsBtn = document.getElementById('confirmXLSImportBtn');

        const partialItems = this.importResults.filter(r => r.match.status === 'partial');
        const pendingItems = partialItems.filter(r => !r._action);
        const totalPartial = partialItems.length;
        const remaining = pendingItems.length;

        const counter = document.getElementById('importDecisionCount');
        if (counter) {
            counter.textContent = remaining > 0 ? `待处理: ${remaining}` : '全部已处理 ✓';
        }

        const total = this.importResults ? this.importResults.length : 0;

        // 更新 API 导入按钮
        if (btn) {
            if (remaining === 0) {
                btn.disabled = false;
                btn.innerHTML = `
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span>执行导入 (${total} 项)</span>
                `;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                btn.disabled = true;
                btn.innerHTML = `<span>请先处理剩余 ${remaining} 个部分匹配项</span>`;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }

        // 更新 XLS 导入按钮（不使用 disabled，通过事件监听中的检查来处理）
        if (xlsBtn) {
            const span = xlsBtn.querySelector('span');
            if (span) {
                span.textContent = remaining > 0 ? `请先处理剩余 ${remaining} 个部分匹配项` : `执行导入 (${total} 项)`;
            }
            xlsBtn.classList.toggle('opacity-50', remaining > 0);
        }
    }

    /**
     * 执行导入操作
     */
    executeImportAction() {
        // 检查是否所有部分匹配都已处理
        const pendingItems = this.importResults.filter(r => r.match.status === 'partial' && !r._action);
        if (pendingItems.length > 0) {
            this.componentManager?.showNotification?.(`还有 ${pendingItems.length} 个部分匹配项未处理`, 'warning');
            return;
        }

        // 为没有 action 的项设置默认值
        this.importResults.forEach(r => {
            if (!r._action) {
                r._action = r.match.status === 'exact' ? 'inbound_keep' :
                           r.match.status === 'none' ? 'create_new' : 'skip';
            }
        });

        // 执行导入
        try {
            const result = this.executeImport(this.importResults);
            this.showImportSummary(result);
        } catch (e) {
            this.componentManager?.showNotification?.('导入失败: ' + e.message, 'error');
        }
    }

    /**
     * 显示导入结果摘要
     */
    showImportSummary(result) {
        const modal = document.getElementById('lcscImportModal');
        if (!modal) return;

        const body = modal.querySelector('.import-wizard-body');
        if (!body) return;

        body.innerHTML = `
            <div class="py-8">
                <div class="text-center mb-6">
                    <div class="w-16 h-16 mx-auto mb-4 bg-green-900/30 rounded-full flex items-center justify-center">
                        <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-medium text-white mb-2">导入完成</h3>
                </div>

                <div class="max-w-sm mx-auto space-y-3">
                    <div class="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                        <span class="text-gray-400">新建元器件</span>
                        <span class="text-blue-400 font-medium">${result.created} 个</span>
                    </div>
                    <div class="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                        <span class="text-gray-400">入库操作</span>
                        <span class="text-green-400 font-medium">${result.inbound} 项</span>
                    </div>
                    ${result.errors.length > 0 ? `
                        <div class="p-3 bg-red-900/20 rounded-lg">
                            <div class="text-red-400 text-sm mb-1">${result.errors.length} 个错误:</div>
                            ${result.errors.map(e => `<div class="text-xs text-red-400/70">${e}</div>`).join('')}
                        </div>
                    ` : ''}
                    <div class="flex justify-between items-center p-3 bg-gray-800/80 rounded-lg">
                        <span class="text-gray-400">合计</span>
                        <span class="text-white font-medium">${result.created + result.inbound} 项</span>
                    </div>
                </div>

                <div class="flex justify-center mt-6 space-x-3">
                    <button onclick="document.getElementById('lcscImportModal').classList.add('hidden'); document.getElementById('lcscOrderModal').classList.add('hidden');"
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
                        完成
                    </button>
                    <button onclick="window.lcscImportManager?.showOrderBrowserModal()"
                            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm">
                        继续导入其他订单
                    </button>
                </div>
            </div>
        `;

        // 也关闭订单列表弹窗
        const orderModal = document.getElementById('lcscOrderModal');
        if (orderModal) orderModal.classList.add('hidden');
    }

    // ==================== XLS 文件导入（本地文件解析，无需 API） ====================

    /**
     * 打开 XLS 文件导入界面（入口）
     * 替代原有的 API 导入方式，直接从本地立创商城导出的 XLS 文件导入
     */
    openXLSImport() {
        const modal = document.getElementById('lcscImportModal');
        if (!modal) return;
        modal.classList.remove('hidden');

        const body = modal.querySelector('.import-wizard-body');
        if (!body) return;

        this.renderXLSFileUploader(body);
    }

    /**
     * 渲染文件上传界面
     */
    renderXLSFileUploader(container) {
        container.innerHTML = `
            <div class="space-y-6">
                <!-- 上传区域 -->
                <div id="xlsDropZone"
                     class="border-2 border-dashed border-gray-600 rounded-xl p-12 text-center hover:border-blue-500 transition-colors cursor-pointer">
                    <div class="w-16 h-16 mx-auto mb-4 bg-gray-700/50 rounded-full flex items-center justify-center">
                        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                    </div>
                    <h3 class="text-lg font-medium text-white mb-2">选择立创商城订单文件</h3>
                    <p class="text-gray-400 text-sm mb-4">支持 .xls / .xlsx 格式</p>
                    <button id="xlsSelectFileBtn" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
                        选择文件
                    </button>
                    <input type="file" id="xlsFileInput" accept=".xls,.xlsx" class="hidden">
                    <p class="text-xs text-gray-500 mt-4">或将文件拖拽到此处</p>
                </div>

                <!-- 提示 -->
                <div class="bg-gray-800/50 rounded-lg p-4">
                    <h4 class="text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                        <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span>使用说明</span>
                    </h4>
                    <ul class="text-xs text-gray-500 space-y-1 list-disc list-inside">
                        <li>从立创商城 "我的订单" → "订单详情" 页面导出 Excel 文件</li>
                        <li>系统会自动解析商品编号、品牌、型号、封装、数量等信息</li>
                        <li>自动匹配系统已有元器件，支持新建/入库/跳过操作</li>
                        <li>所有解析在浏览器本地完成，数据不会上传到服务器</li>
                    </ul>
                </div>

                <!-- 底部按钮 -->
                <div class="flex justify-end pt-2 border-t border-gray-700/50">
                    <button onclick="document.getElementById('lcscImportModal').classList.add('hidden')"
                            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm">
                        取消
                    </button>
                </div>
            </div>
        `;

        // 绑定事件
        const self = this;
        const fileInput = container.querySelector('#xlsFileInput');
        const selectBtn = container.querySelector('#xlsSelectFileBtn');
        const dropZone = container.querySelector('#xlsDropZone');

        selectBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                self.importFromXLS(e.target.files[0]);
            }
        });

        // 拖拽支持
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-500', 'bg-blue-900/10');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-blue-500', 'bg-blue-900/10');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-blue-900/10');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                self.importFromXLS(e.dataTransfer.files[0]);
            }
        });
    }

    /**
     * 解析 XLS 文件，提取订单信息和商品明细
     * @param {File} file - 用户选择的 .xls / .xlsx 文件
     * @returns {Object} { orderCode, orderTime, items: [...] }
     */
    parseXLSOrder(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // 取第一个有效 sheet（Sheet1 或订单名 sheet）
                    let sheetName = workbook.SheetNames[0];
                    // 跳过 Sheet2/Sheet3 等空白 sheet，找有数据的
                    for (const name of workbook.SheetNames) {
                        const ws = workbook.Sheets[name];
                        const ref = ws['!ref'];
                        if (ref) {
                            const range = XLSX.utils.decode_range(ref);
                            if (range.e.r > 5) { // 至少 6 行数据才视为有效
                                sheetName = name;
                                break;
                            }
                        }
                    }

                    const ws = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                    // 提取订单号（Row 0, Col 1）
                    const orderCode = rows[0] && rows[0][1] ? String(rows[0][1]).trim() : '';
                    // 提取下单时间（Row 0, Col 8）
                    const orderTime = rows[0] && rows[0][8] ? String(rows[0][8]).trim() : '';

                    // 定位 "商品明细列表" 标记行
                    let detailHeaderRow = -1;
                    for (let i = 0; i < rows.length; i++) {
                        const cell = String(rows[i][0] || '').trim();
                        if (cell === '商品明细列表') {
                            detailHeaderRow = i;
                            break;
                        }
                    }

                    if (detailHeaderRow === -1) {
                        // 尝试找包含 "序号" 和 "商品编号" 的表头行
                        for (let i = 0; i < rows.length; i++) {
                            const row = rows[i];
                            if (String(row[0] || '').trim() === '序号' && String(row[1] || '').trim() === '商品编号') {
                                detailHeaderRow = i - 1;
                                break;
                            }
                        }
                    }

                    if (detailHeaderRow === -1) {
                        throw new Error('无法识别订单文件格式：未找到商品明细列表');
                    }

                    // 解析商品行
                    const items = [];
                    for (let i = detailHeaderRow + 2; i < rows.length; i++) {
                        const row = rows[i];
                        const seq = String(row[0] || '').trim();
                        // 跳过空行和非数字序号行
                        if (!seq || !/^\d+$/.test(seq)) continue;

                        const item = this.parseXLSOrderItem(row, orderCode);
                        if (item) items.push(item);
                    }

                    if (items.length === 0) {
                        throw new Error('未找到有效的商品数据');
                    }

                    resolve({ orderCode, orderTime, items });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 将 XLS 的一行数据转为标准订单项格式
     *
     * 注意：在库管理系统中，"型号规格"就是"封装"。
     * 因此 XLS 的"封装"列会映射到 productModel（系统 model 字段，UI 显示为"型号规格"），
     * 而 XLS 的"厂家型号"列存入 manufacturerModel 作为辅助信息。
     *
     * @param {Array} row - XLS 的一行数据数组
     * @param {string} orderCode - 订单号
     * @returns {Object} 标准化的订单项对象
     */
    parseXLSOrderItem(row, orderCode) {
        const productCode = String(row[1] || '').trim();
        const brandRaw = String(row[2] || '').trim();
        const manufacturerModel = String(row[3] || '').trim();  // 厂家型号（辅助信息）
        const package_ = String(row[4] || '').trim();            // 封装 → 作为系统"型号规格"
        const name = String(row[5] || '').trim();
        const qtyRaw = String(row[6] || '').trim();
        const priceRaw = String(row[9] || '').trim();

        if (!productCode) return null;

        // 解析数量："100个" → 100
        let quantity = 1;
        const qtyMatch = qtyRaw.match(/^(\d+)/);
        if (qtyMatch) quantity = parseInt(qtyMatch[1]);

        // 解析品牌（去掉括号内的中文注释，如 "MICROCHIP(美国微芯)" → "MICROCHIP"）
        let brand = brandRaw;
        const parenMatch = brandRaw.match(/^([^(]+)/);
        if (parenMatch) brand = parenMatch[1].trim();

        // 从商品名称中提取分类关键词（用封装+名称提高识别率）
        const catalogName = this.inferCatalogFromProduct(name, package_, package_);

        return {
            _index: 0,
            productCode: productCode,
            productName: name,
            // 封装作为型号规格（系统 model 字段）
            productModel: package_,
            // 厂家型号存入辅助字段
            manufacturerModel: manufacturerModel,
            brandName: brandRaw,
            brand: brand,
            encapStandard: package_,
            quantity: quantity,
            finalNumber: quantity,
            orderCode: orderCode,
            // 以下字段用于匹配和导入
            parentCatalogName: catalogName,
            catalogName: catalogName,
            _mappedCategory: this.mapCategory(catalogName),
            _mappedSubCategory: this.mapSubCategory(catalogName),
            _extractedParams: '[]',
            _paramsText: '',
            _imageUrl: '',
            _datasheetUrl: '',
            productParams: []  // XLS 没有详细参数，留空
        };
    }

    /**
     * 从产品名称/型号/封装中推断分类名称
     * 用于没有明确分类信息的 XLS 文件
     *
     * 注意：匹配顺序很重要，更具体的规则应该放在前面，
     * 避免 "LDO稳压器" 被误匹配为 "二极管" 这类问题。
     */
    inferCatalogFromProduct(name, model, pkg) {
        const text = (name + ' ' + model + ' ' + pkg).toLowerCase();

        // === 先匹配具体品类，再匹配通用品类 ===
        // 注意：更具体/易混淆的规则放在前面，且无法识别时返回空字符串
        // （调用方 mapCategory('') 会兜底为 'other'，避免产生垃圾分类）。

        // === 集成电路（含各种电源/驱动/逻辑/接口芯片）===
        // 优先匹配，避免 "稳压器/驱动器/转换器" 等被误判为二极管或电阻
        if (/集成电路|芯片|mcu|单片机|微控制器|微处理器|处理器|控制器/
            .test(text)) return '集成电路';
        // 电源类：LDO / 稳压器 / 降压 / 升压 / DC-DC / 电源芯片 / 双电源
        if (/\bldo\b|稳压器|稳压ic|稳压芯片|降压|升压|dc[- ]?dc|电源芯片|电源管理|电压调节|双电源/
            .test(text)) return '集成电路';
        // 驱动类：LED驱动 / 马达驱动 / 栅极驱动（注意 "发光二极管" 不在此列）
        if (/驱动|driver|驱动器|恒流|恒压/.test(text)) return '集成电路';
        // 放大/运放/逻辑门/比较器/转换器
        if (/运放|放大器|比较器|与门|或门|非门|与非|或非|异或|逻辑|电平转换|转换器|收发器|缓冲器|光耦|光电耦合|隔离/
            .test(text)) return '集成电路';
        // 接口/存储/射频/无线/时钟等信号处理类芯片
        if (/接口|存储|flash|eeprom|rom|ram|射频|无线|蓝牙|wifi|以太网|usb|串口|模拟开关|看门狗|时钟芯片/
            .test(text)) return '集成电路';
        // 通用 "ic" 匹配，但避免匹配 "nic"、"pic" 等单词中的 ic
        if (/\bic\b/.test(text)) return '集成电路';

        // === LED：必须在通用二极管之前判断，避免 "发光二极管" 被二极管规则抢走 ===
        if (/发光二极管/.test(text)) return '发光二极管';
        if (/\bled\b|\bled$|^led/i.test(text) && !/驱动|driver|电源/.test(text)) return '发光二极管';
        if (/发光/.test(text) && !/驱动|电源/.test(text)) return '发光二极管';

        // === 二极管 ===
        // 明确是"稳压二极管/整流二极管"才细分，否则先归为通用二极管
        if (/稳压二/.test(text)) return '稳压二极管';
        if (/整流二/.test(text)) return '整流二极管';
        if (/二极管|diode/.test(text)) return '肖特基二极管';

        // === 晶振：必须在电感之前判断（"MHz" 含 "mh"，会误触发电感规则）===
        if (/晶振|crystal|oscillator|谐振/.test(text)) {
            if (/有源/.test(text)) return '有源晶振';
            if (/无源/.test(text)) return '无源晶振';
            return '晶振';
        }

        // === 电阻 ===
        // Ω 在 toLowerCase 后会变成 ω
        if (/电阻|resistor|res|Ω|ω|ohm|kΩ|mΩ/.test(text)) return '贴片电阻';

        // === 电容（含超级电容）===
        // μf 可能是 μf/uf/µf；F 结尾且前有数字的是（超级）电容，如 "250F"
        if (/电容|capacitor|cap|μf|µf|uf|pf|nf|\d\s*f\b/i.test(text)) return '贴片电容';

        // === 电感 ===
        // 注意：使用 \d+ 限定电感单位前必须有数字，避免 "8MHz" 中的 "mh" 误触发
        if (/电感|inductor|\d+\s*(μh|µh|mh|uh)/i.test(text)) return '贴片电感';
        if (/磁珠|bead/.test(text)) return '磁珠';

        // === 三极管/MOS管 ===
        if (/三极管|transistor/.test(text)) return '三极管';
        if (/n沟道|p沟道|mosfet|场效应/.test(text)) return 'MOS管';
        // "MOS" 单独匹配时避免误判（如 "MOS" 在单词中）
        if (/\bmos\b/i.test(text)) return 'MOS管';

        // === 连接器/开关/继电器/传感器/保险丝 ===
        if (/连接器|connector|端子|接插件|排针|排母|插座|插头|间距|xh2\.54|排座/
            .test(text)) return '连接器';
        if (/开关|switch|按键|轻触/.test(text)) return '开关';
        if (/继电器|relay/.test(text)) return '继电器';
        if (/传感器|sensor|探头/.test(text)) return '传感器';
        if (/保险丝|fuse/.test(text)) return '保险丝';

        // === 根据封装推断（仅作辅助，不据此硬判）===
        if (/sot|sop|qfp|tqfp|qfn|dfn|bga|ssop|tssop|msop|soic|dip/.test(pkg)) {
            // 封装是 SOT/SOP/QFP 等，通常为 IC 或半导体，但名称更可信；
            // 这里只在这些封装无法判断时给出通用信号，最终归 other 更安全。
        }

        // 无法识别：返回空字符串，调用方兜底为 'other'
        return '';
    }

    /**
     * 从 XLS 文件导入订单（主流程）
     * 解析 → 分类映射 → 匹配 → 展示结果
     */
    async importFromXLS(file) {
        const modal = document.getElementById('lcscImportModal');
        if (!modal) return;

        const body = modal.querySelector('.import-wizard-body');
        if (!body) return;

        // 显示加载中
        body.innerHTML = this.renderStep1Loading(1, 4, '正在解析订单文件...');

        try {
            // 步骤1: 解析 XLS 文件
            const { orderCode, orderTime, items } = await this.parseXLSOrder(file);

            body.innerHTML = this.renderStep1Loading(2, 4, `正在处理 ${items.length} 个商品...`);

            // 步骤2: 分类映射 + 参数提取（无 API 参数，仅用名称和型号推断）
            this.orderItems = items.map((item, index) => {
                item._index = index;
                // 使用名称推断更多参数信息
                item._mappedCategory = this.mapCategory(item.parentCatalogName || item.catalogName || '');
                item._mappedSubCategory = this.mapSubCategory(item.parentCatalogName || item.catalogName || '');
                // 尝试从名称中提取参数值
                item._extractedParams = this.extractParamsFromName(item);
                item._paramsText = this.getTextFromExtractedParams(item._extractedParams);
                return item;
            });

            // 设置当前订单信息
            this.currentOrder = { orderCode, orderTime };

            // 步骤2.5: 尝试通过后端 Puppeteer 抓取补充参数
            try {
                const productCodes = this.orderItems.map(item => item.productCode).filter(Boolean);
                if (productCodes.length > 0) {
                    body.innerHTML = this.renderStep1Loading(2, 4, `正在从立创商城抓取 ${productCodes.length} 个商品的参数...`);
                    const resp = await fetch('/api/lcsc/product/scrape-batch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ productCodes })
                    });
                    if (resp.ok) {
                        const result = await resp.json();
                        if (result.success && Array.isArray(result.data)) {
                            // 用抓取到的参数覆盖
                            result.data.forEach(scraped => {
                                const item = this.orderItems.find(i => i.productCode === scraped.code);
                                if (!item) return;

                                // 抓取失败：设置备选搜索链接
                                if (!scraped.success || !scraped.data) {
                                    if (!item._productUrl) {
                                        item._productUrl = `https://www.szlcsc.com/search.html?keyword=${item.productCode}`;
                                    }
                                    return;
                                }

                                // 参数（可能为空）
                                if (scraped.data.params && scraped.data.params.length > 0) {
                                    item._extractedParams = JSON.stringify(scraped.data.mappedParams || []);
                                    item._paramsText = scraped.data.params.map(p => p.value).join(' ');
                                    item._paramsFormatted = scraped.data.params.map(p => p.label + '=' + p.value).join('; ');
                                    // 从参数中提取类别
                                    const catParam = scraped.data.params.find(p => p.label === '商品目录');
                                    if (catParam && catParam.value) {
                                        item.parentCatalogName = catParam.value;
                                        item.catalogName = catParam.value;
                                        item._mappedCategory = this.mapCategory(catParam.value);
                                        item._mappedSubCategory = this.mapSubCategory(catParam.value);
                                    }
                                }

                                // 基本信息（无论是否有参数，都要更新）
                                if (scraped.data.productName) item.productName = scraped.data.productName;
                                if (scraped.data.brand) item.brandName = scraped.data.brand;
                                if (scraped.data.model) item.productModel = scraped.data.model;
                                if (scraped.data.pkg) item.encapStandard = scraped.data.pkg;
                                // 图片和数据手册（独立于参数）
                                if (scraped.data.imageUrl) item._imageUrl = scraped.data.imageUrl;
                                if (scraped.data.datasheetUrl) item._datasheetUrl = scraped.data.datasheetUrl;
                                if (scraped.data.productUrl) item._productUrl = scraped.data.productUrl;
                            });
                        }
                    }
                }
            } catch (e) {
                // 抓取失败不影响主流程，使用名称解析的参数
                console.warn('[XLS导入] 参数抓取失败，使用名称解析结果:', e.message);
            }

            // 步骤3: 执行匹配
            body.innerHTML = this.renderStep1Loading(3, 4, '正在匹配系统已有元器件...');
            this.importResults = this.matchAllItems(this.orderItems);

            // 短暂延迟让用户看到进度
            await new Promise(resolve => setTimeout(resolve, 300));

            // 展示匹配结果
            body.innerHTML = this.renderXLSResultView(this.importResults, orderCode, orderTime);

            // 使用直接事件绑定替代 onclick 属性（避免 disabled 时 onclick 不触发的问题）
            const confirmBtn = document.getElementById('confirmXLSImportBtn');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => {
                    // 检查是否有未处理的 partial 匹配项
                    const pendingItems = this.importResults.filter(r => r.match.status === 'partial' && !r._action);
                    if (pendingItems.length > 0) {
                        this.componentManager?.showNotification?.(`还有 ${pendingItems.length} 个部分匹配项未处理，请先选择操作`, 'warning');
                        return;
                    }
                    this.executeImportAction();
                });
            }
            const backBtn = document.getElementById('xlsBackBtn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    this.openXLSImport();
                });
            }
        } catch (e) {
            body.innerHTML = `
                <div class="text-center py-12">
                    <div class="w-20 h-20 mx-auto mb-4 bg-red-900/30 rounded-full flex items-center justify-center">
                        <svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <h3 class="text-xl font-medium text-white mb-2">解析失败</h3>
                    <p class="text-gray-400 mb-4">${e.message}</p>
                    <div class="flex justify-center space-x-3">
                        <button onclick="window.lcscImportManager?.openXLSImport()"
                                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
                            重新选择文件
                        </button>
                        <button onclick="document.getElementById('lcscImportModal').classList.add('hidden')"
                                class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors text-sm">
                            关闭
                        </button>
                    </div>
                </div>
            `;
        }
    }

    /**
     * 从产品名称/型号中提取参数（XLS 文件没有 API 返回的详细参数）
     * 这是一个轻量级方案，仅提取明显的参数信息
     */
    extractParamsFromName(item) {
        const cm = this.componentManager;
        if (!cm) return '[]';

        const category = item._mappedCategory || 'other';
        const subCategory = item._mappedSubCategory || '';
        const defs = cm.getEffectiveParamDefs(category, subCategory);
        if (!defs || defs.length === 0) return '[]';

        const text = (item.productName + ' ' + item.productModel + ' ' + item.encapStandard).toLowerCase();

        // 定义各品类的参数提取规则
        const patterns = {
            resistor: [
                { label: '阻值', regex: /(\d+\.?\d*)\s*([kKmM]?Ω|k|m|r|ω)/i },
                { label: '功率', regex: /(\d+\.?\d*)\s*([mM]?[wW])/ }
            ],
            capacitor: [
                { label: '容值', regex: /(\d+\.?\d*)\s*([μuµ][fF]|[pP][fF]|[nN][fF])/i },
                { label: '耐压', regex: /(\d+)\s*[vV]/ }
            ],
            inductor: [
                { label: '电感量', regex: /(\d+\.?\d*)\s*([μuµ]?[hH]|[mM][hH])/i },
                { label: '电流', regex: /(\d+\.?\d*)\s*[aA]/ }
            ],
            mosfet: [
                { label: '耐压', regex: /(\d+)\s*[vV]/ },
                { label: '电流', regex: /(\d+\.?\d*)\s*[aA]/.test(text) ? /(\d+\.?\d*)\s*[aA]/ : null }
            ],
            diode: [
                { label: '反向耐压', regex: /(\d+)\s*[vV]/ }
            ],
            led: [
                { label: '颜色', regex: /(红|绿|蓝|白|黄|橙|紫|rgb|暖白|冷白)/i }
            ],
            crystal: [
                { label: '频率', regex: /(\d+\.?\d*)\s*([mM][hH][zZ]|[kK][hH][zZ])/i }
            ]
        };

        const categoryPatterns = patterns[category] || [];
        const result = defs.map(def => {
            let value = '';
            let unit = def.defaultUnit || '';

            for (const pat of categoryPatterns) {
                if (pat.label === def.label || def.label.includes(pat.label) || pat.label.includes(def.label)) {
                    if (pat.regex) {
                        const match = text.match(pat.regex);
                        if (match) {
                            value = match[1];
                            if (match[2]) unit = match[2];
                        }
                    }
                    break;
                }
            }

            return { id: def.id, value, unit, label: def.label };
        });

        return JSON.stringify(result);
    }

    /**
     * 从提取的参数 JSON 中获取纯文本
     */
    getTextFromExtractedParams(paramsJson) {
        try {
            const params = JSON.parse(paramsJson);
            return params.filter(p => p.value).map(p => p.value + (p.unit || '')).join(' ');
        } catch (e) {
            return '';
        }
    }

    /**
     * 渲染 XLS 导入结果视图（复用现有匹配结果 UI 风格）
     * 注意：按钮绑定使用容器委托事件（在 importFromXLS 中设置），
     *       而不是 onclick 属性，以避免 disabled 状态下 onclick 不触发的问题
     */
    renderXLSResultView(results, orderCode, orderTime) {
        const exactCount = results.filter(r => r.match.status === 'exact').length;
        const partialCount = results.filter(r => r.match.status === 'partial').length;
        const noneCount = results.filter(r => r.match.status === 'none').length;

        const total = results.length;
        const autoCount = exactCount + noneCount;
        const pendingCount = partialCount;

        return `
            <div class="space-y-4">
                <!-- 订单信息 -->
                <div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div class="flex items-center space-x-3 text-sm">
                        <span class="text-gray-400">订单号:</span>
                        <span class="text-white font-mono">${orderCode || '未知'}</span>
                        ${orderTime ? `<span class="text-gray-500">|</span><span class="text-gray-400">${orderTime}</span>` : ''}
                    </div>
                    <span class="text-xs text-gray-500">共 ${total} 项</span>
                </div>

                <!-- 进度概要 -->
                <div class="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                    <div class="flex items-center space-x-4">
                        <span class="text-sm text-gray-400">匹配结果：</span>
                        <span class="text-sm text-green-400">${exactCount} 个精确匹配</span>
                        <span class="text-sm text-yellow-400">${partialCount} 个部分匹配</span>
                        <span class="text-sm text-blue-400">${noneCount} 个新器件</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="text-xs text-gray-500" id="importDecisionCount">${pendingCount > 0 ? `待处理: ${pendingCount}` : '全部已处理 ✓'}</span>
                    </div>
                </div>

                <!-- 元器件列表 -->
                <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    ${results.map((item, index) => this.renderXLSItemCard(item, index)).join('')}
                </div>

                <!-- 操作按钮（不使用 onclick 属性，改用事件委托） -->
                <div class="flex items-center justify-between pt-4 border-t border-gray-700/50">
                    <button id="xlsBackBtn"
                            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm">
                        重新选择文件
                    </button>
                    <button id="confirmXLSImportBtn"
                            class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center space-x-2 ${pendingCount > 0 ? 'opacity-50' : ''}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        <span>${pendingCount > 0 ? '请先处理部分匹配项' : `执行导入 (${total} 项)`}</span>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * 渲染单个 XLS 导入项卡片
     */
    renderXLSItemCard(item, index) {
        const match = item.match;
        const statusBadge = {
            'exact': '<span class="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-700/30">精确匹配 · 自动入库</span>',
            'partial': '<span class="text-xs px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400 border border-yellow-700/30">部分匹配 · 请选择操作</span>',
            'none': '<span class="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-700/30">新元器件 · 自动新建</span>'
        };

        const paramsText = item._paramsText || '';
        const existingComp = match.matchedComponent;
        const existingParamsText = existingComp ? this.getParamsText(existingComp) : '';
        const orderQty = item.finalNumber || item.quantity || 1;

        return `
            <div class="bg-gray-800/30 border ${match.status === 'partial' ? 'border-yellow-600/30' : match.status === 'exact' ? 'border-green-700/20' : 'border-blue-700/20'} rounded-lg p-4 item-card" data-index="${index}">
                <!-- 头部 -->
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center space-x-2">
                            <span class="text-white font-medium truncate">${item.productName || '未命名'}</span>
                            ${statusBadge[match.status] || ''}
                        </div>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-400">
                            <span class="text-green-300">型号规格: ${item.productModel || '--'}</span>
                            ${item.brandName ? `<span>品牌: ${item.brandName}</span>` : ''}
                            <span class="text-blue-300">料号: ${item.productCode || '--'}</span>
                            ${item.manufacturerModel ? `<span>厂家型号: ${item.manufacturerModel}</span>` : ''}
                            ${item._mappedCategory ? `<span>分类: ${item._mappedCategory}</span>` : ''}
                            ${item._productUrl ? `<a href="${item._productUrl}" target="_blank" class="text-orange-400 hover:text-orange-300 underline">立创详情</a>` : ''}
                        </div>
                        ${paramsText ? `<div class="mt-1 text-xs text-gray-500">参数: ${paramsText}</div>` : ''}
                        <div class="mt-1 text-sm text-blue-400">数量: ${orderQty} 个</div>
                    </div>
                </div>

                <!-- 匹配详情 -->
                <div class="text-xs text-gray-500 mb-3">${match.reason || ''}</div>

                <!-- 部分匹配：冲突解决 -->
                ${match.status === 'partial' ? this.renderConflictActions(item, index, existingComp, existingParamsText) : ''}

                <!-- 精确/新建：自动接受标记 -->
                ${match.status !== 'partial' ? `
                    <div class="flex items-center justify-end">
                        <input type="hidden" class="item-action" value="${match.status === 'exact' ? 'inbound_keep' : 'create_new'}">
                    </div>
                ` : ''}
            </div>
        `;
    }
}

// 全局导出
window.LcscImportManager = LcscImportManager;
