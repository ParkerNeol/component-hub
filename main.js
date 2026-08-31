// 电子元器件管理系统 - 主要JavaScript文件

// ========== IndexedDB 数据手册文件存储 ==========
const DATASHEET_DB_NAME = 'ComponentDatasheetsDB';
const DATASHEET_DB_VERSION = 1;
const DATASHEET_STORE_NAME = 'datasheets';

function openDatasheetDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATASHEET_DB_NAME, DATASHEET_DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(DATASHEET_STORE_NAME)) {
                db.createObjectStore(DATASHEET_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveDatasheetFile(componentId, file) {
    const db = await openDatasheetDB();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const data = {
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                data: reader.result,
                savedAt: new Date().toISOString()
            };
            const tx = db.transaction(DATASHEET_STORE_NAME, 'readwrite');
            tx.objectStore(DATASHEET_STORE_NAME).put(data, componentId);
            tx.oncomplete = () => resolve(data);
            tx.onerror = () => reject(tx.error);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

async function getDatasheetFile(componentId) {
    const db = await openDatasheetDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DATASHEET_STORE_NAME, 'readonly');
        const request = tx.objectStore(DATASHEET_STORE_NAME).get(componentId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function deleteDatasheetFile(componentId) {
    const db = await openDatasheetDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DATASHEET_STORE_NAME, 'readwrite');
        tx.objectStore(DATASHEET_STORE_NAME).delete(componentId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// 下载 Blob 为文件
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ========== ComponentManager 类 ==========

class ComponentManager {
    constructor() {
        this.components = [];
        this.filteredComponents = [];
        this.currentCategory = 'all';
        this.currentSubCategory = ''; // 子类别筛选（空=全部）
        this.currentStockFilters = ['full', 'warning', 'empty'];
        this._activeStockCard = null;
        this.searchQuery = '';
        this.editingComponent = null;

        // 操作历史栈（用于撤回功能）
        this.historyStack = [];
        this.maxHistorySize = 50;

        // 拖拽相关定时器（用于防抖/节流）
        this.dragDebounceTimers = {};

        // BOM匹配数据缓存
        this.currentBomItems = [];
        this.currentBomMatchResults = [];

        // BOM筛选状态
        this.bomFilteredComponentIds = null;

        // LCSC订单一键导入
        this.lcscImportManager = null;

        // 性能优化：分页配置
        this.pageSize = 30; // 每页显示30个
        this.currentPage = 1;

        // 防抖定时器
        this.searchDebounceTimer = null;

        // 分化参数筛选状态
        this.paramFilters = {}; // e.g. { p1: { min: '10', max: '100', unit: 'Ω' } }
        this.paramFilterActive = false;

        // 系统设置
        this.settings = this.loadSettings();

        // 批量编辑相关
        this.bulkEditComponentsList = [];
        this.selectedBulkEditIds = new Set();

        // 数据手册文件上传暂存
        this.pendingDatasheetFileData = null;
        this.pendingAddDatasheetFileData = null;

        this.init();
    }

    // 防抖函数
    debounce(func, wait, key = 'default') {
        return (...args) => {
            if (this.dragDebounceTimers[key]) {
                clearTimeout(this.dragDebounceTimers[key]);
            }
            this.dragDebounceTimers[key] = setTimeout(() => {
                func.apply(this, args);
                delete this.dragDebounceTimers[key];
            }, wait);
        };
    }

    // 节流函数
    throttle(func, limit, key = 'default') {
        let inThrottle = false;
        return (...args) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // 单位转换函数：将带有单位的字符串转换为纯数值
    // 支持的单位：
    // - 通用单位：k/K=1000, m/M=1000000, g/G=1000000000
    // - 电容单位（基准pf）：pf=1, nf=1000, uf=1000000, f=1000000000
    // - 电阻单位（基准Ω）：Ω=1, kΩ=1000
    parseValueWithUnit(valueStr) {
        if (!valueStr || typeof valueStr !== 'string') return valueStr;

        // 匹配数字+单位后缀的模式
        // 注意：需要先匹配长单位（uf、nf、pf），再匹配短单位（k、m、g、f）
        // 避免 "1uf" 被部分匹配为 "1u"
        const unitMatch = valueStr.match(/^(\d+\.?\d*)\s*(uf|nf|pf|k|m|g|f|Ω|ω|ω|ω)$/i);
        if (unitMatch) {
            const num = parseFloat(unitMatch[1]);
            const unit = unitMatch[2].toLowerCase();

            switch (unit) {
                // 电容单位（统一转换为皮法 pf）
                case 'uf':
                    return num * 1000000;   // 1uf = 1000000pf
                case 'nf':
                    return num * 1000;      // 1nf = 1000pf
                case 'pf':
                    return num;             // 1pf = 1pf
                case 'f':
                    return num * 1000000000; // 1f = 1000000000pf
                // 电阻单位（统一转换为欧姆 Ω）
                case 'ω': // Ω（大写omega）
                case 'ω': // ω（小写omega）
                    return num;             // 1Ω = 1Ω（基准）
                case 'm':
                    // 电阻的M单位（MΩ，兆欧）- 大小写不敏感
                    return num * 1000000;   // 1MΩ = 1000000Ω = 1000kΩ
                case 'k':
                    // 电阻的k单位（kΩ，千欧）
                    return num * 1000;      // 1kΩ = 1000Ω
                case 'g':
                    return num * 1000000000;
            }
        }

        // 如果没有单位后缀，直接返回原值
        return valueStr;
    }

    // 标准化数值文本：将带单位的数值转换为数字字符串
    // 通用单位：例如："1k" -> "1000", "1m" -> "1000000"
    // 电容单位（基准pf）：例如："1pf" -> "1", "1nf" -> "1000", "1uf" -> "1000000", "1f" -> "1000000000"
    // 电阻单位（基准Ω）：例如："100Ω" -> "100", "1kΩ" -> "1000"
    normalizeValueText(valueStr) {
        if (!valueStr || typeof valueStr !== 'string') return valueStr;

        const parsedValue = this.parseValueWithUnit(valueStr);
        if (typeof parsedValue === 'number') {
            return parsedValue.toString();
        }
        return valueStr;
    }

    // 增强的文本匹配函数：支持单位等价性匹配
    // 通用单位：例如："1k" 可以匹配 "1000", "1m" 可以匹配 "1000000"，反之亦然
    // 电容单位：例如："1uf" 可以匹配 "1000000nf" "1000000000pf"，反之亦然
    // 电阻单位：例如："100Ω" 可以匹配 "100.0Ω", "1kΩ" 可以匹配 "1000Ω"，反之亦然
    matchesWithUnitEquivalence(searchText, componentText) {
        // 直接文本匹配
        if (componentText.includes(searchText)) {
            return true;
        }

        // 尝试单位转换匹配（双向匹配）
        try {
            // 提取搜索文本中的所有数值和单位
            const searchValues = this.extractNumericValues(searchText);
            const componentValues = this.extractNumericValues(componentText);

            // 对所有搜索值和组件值都进行标准化，然后比较
            for (const searchValue of searchValues) {
                const normalizedSearch = this.normalizeValueText(searchValue);

                for (const compValue of componentValues) {
                    const normalizedComp = this.normalizeValueText(compValue);

                    // 只有当标准化成功（即至少有一个值发生了转换）时，才进行单位转换匹配
                    // 如果 normalizedSearch === searchValue 且 normalizedComp === compValue，说明没有单位转换发生
                    // 需要至少有一个值包含有效单位
                    const searchHasUnit = normalizedSearch !== searchValue;
                    const compHasUnit = normalizedComp !== compValue;

                    // 如果两个值都没有单位，则不应该进行单位转换匹配
                    if (!searchHasUnit && !compHasUnit) {
                        continue;
                    }

                    // 如果标准化后的值相等，则匹配成功
                    if (normalizedSearch === normalizedComp) {
                        return true;
                    }
                }
            }
        } catch (e) {
            // 转换失败，使用原始匹配
        }

        return false;
    }

    // 从文本中提取所有数值（带单位或纯数字）
    extractNumericValues(text) {
        const values = [];

        // 分别匹配每种单位，确保单位完整且准确
        // 注意：对于非ASCII字符（如Ω），需要使用更灵活的边界匹配
        // 使用 (^|\W|$) 替代 \b，确保匹配到任何非单词字符边界
        const unitPatterns = [
            /(?:^|\W)(\d+\.?\d*uf)(?=\W|$)/gi,  // 微法
            /(?:^|\W)(\d+\.?\d*nf)(?=\W|$)/gi,  // 纳法
            /(?:^|\W)(\d+\.?\d*pf)(?=\W|$)/gi,  // 皮法
            /(?:^|\W)(\d+\.?\d*f)(?=\W|$)/gi,   // 法拉
            /(?:^|\W)(\d+\.?\d*k)(?=\W|$)/gi,   // 千
            /(?:^|\W)(\d+\.?\d*m)(?=\W|$)/gi,   // 兆
            /(?:^|\W)(\d+\.?\d*g)(?=\W|$)/gi,   // 吉
            /(?:^|\W)(\d+\.?\d*[Ωωω])(?=\W|$)/gi,  // 欧姆
        ];

        // 匹配带单位的数值
        for (const pattern of unitPatterns) {
            // 使用 exec 循环获取所有匹配及其捕获组
            let match;
            while ((match = pattern.exec(text)) !== null) {
                // match[1] 是捕获组，包含数字+单位的完整内容
                if (match[1]) {
                    values.push(match[1]);
                }
                // 避免无限循环：如果匹配结果长度为0，手动前进
                if (match[0].length === 0) {
                    pattern.lastIndex++;
                }
            }
        }

        // 匹配纯数字（不带单位的情况）
        // 必须确保数字后不跟任何字母（避免匹配 "50v" 中的 "50"）
        // 使用负向前瞻 (?!\w) 确保数字后不是字母、数字或下划线
        // 同时使用更灵活的边界匹配
        const numberPattern = /(?:^|\W)(\d+\.?\d*)(?!\w)(?=\W|$)/g;
        const numberMatches = text.match(numberPattern);
        if (numberMatches) {
            for (const match of numberMatches) {
                // 提取捕获组中的内容
                const captureMatch = match.match(/(\d+\.?\d*)/);
                if (captureMatch) {
                    const numStr = captureMatch[1];
                    // 检查这个数字匹配是否实际上是某个单位匹配的一部分
                    let isPartOfUnit = false;
                    for (const existing of values) {
                        if (existing.toLowerCase().includes(numStr.toLowerCase())) {
                            isPartOfUnit = true;
                            break;
                        }
                    }
                    if (!isPartOfUnit) {
                        values.push(numStr);
                    }
                }
            }
        }

        return values;
    }

    init() {
        this.loadData();
        this.bindEvents();

        // 恢复上次选择的分类状态
        this.restoreCategoryState();
        this.updateParamFilterFields();
        this.renderSubCategoryFilter();

        // 先尝试从服务端加载元器件和设置，再初始化界面
        Promise.all([
            this.tryLoadFromServer(),
            this.loadSettingsFromServer()
        ]).then(() => {
            this.finishInit();
        }).catch(() => {
            this.finishInit();
        });
    }

    /**
     * 初始化后半部分：渲染界面、加载示例等
     */
    finishInit() {
        this.filterAndRender();
        this.updateStatistics();
        this.initAnimations();

        this.loadHistory();

        if (this.components.length === 0) {
            // 首次访问时加载示例数据（仅一次）
            const sampleDataLoaded = localStorage.getItem('sampleDataLoaded');
            if (!sampleDataLoaded) {
                this.loadSampleData();
                localStorage.setItem('sampleDataLoaded', 'true');
            }
        }
        this.initSampleHistory();

        this.renderCollectionPanel();
        this.initAllCollectionButtonStates();
        this.renderInboundPanel();
        this.initAllInboundButtonStates();
        this.initListTabs();
        this.initCategoryDragSort();
        this.renderCustomCategoryItems();

        // 初始化LCSC订单导入管理器
        if (window.LcscImportManager) {
            this.lcscImportManager = new LcscImportManager();
            this.lcscImportManager.init(this);
        }
    }

    // 加载示例数据
    loadSampleData() {
        const sampleComponents = [
            {
                id: this.generateId(),
                name: '碳膜电阻',
                model: 'CF1/4W-1KΩ-J',
                category: 'resistor',
                value: '1kΩ',
                stock: 150,
                threshold: 20,
                location: 'A1-3',
                notes: '常用1kΩ碳膜电阻，精度±5%',
                image: 'resources/images/resistors/resistor-collection.png',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: '陶瓷电容',
                model: 'CC-104-50V',
                category: 'capacitor',
                value: '0.1μF',
                stock: 8,
                threshold: 10,
                location: 'B2-5',
                notes: '高频陶瓷电容，50V耐压',
                image: 'resources/images/capacitors/capacitor-collection.png',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: '工字电感',
                model: 'DR-101-47μH',
                category: 'inductor',
                value: '47μH',
                stock: 45,
                threshold: 15,
                location: 'C3-2',
                notes: '功率电感，适用于DC-DC转换',
                image: 'https://kimi-web-img.moonshot.cn/img/upload.wikimedia.org/a2f2e16f8969ba3d2db5fb18bd86a57a05f18f6e.jpg',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: 'NPN晶体管',
                model: '2N3904',
                category: 'transistor',
                value: 'NPN',
                stock: 0,
                threshold: 10,
                location: 'D1-8',
                notes: '通用NPN晶体管，TO-92封装',
                image: 'https://kimi-web-img.moonshot.cn/img/www.buerklin.com/9318c346e9c8d3d4e9bc8df611e2bab6cae269f8.jpg',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: '整流二极管',
                model: '1N4007',
                category: 'diode',
                value: '1000V/1A',
                stock: 78,
                threshold: 20,
                location: 'E2-4',
                notes: '通用整流二极管，DO-41封装',
                image: 'https://kimi-web-img.moonshot.cn/img/www.build-electronic-circuits.com/659b68c0c152c997f401ca30d570b2c98614aa04.jpg',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: '运算放大器',
                model: 'LM358N',
                category: 'ic',
                value: '双运放',
                stock: 23,
                threshold: 8,
                location: 'F3-1',
                notes: '双路运算放大器，DIP-8封装',
                image: 'https://kimi-web-img.moonshot.cn/img/pmdway.com/08071a6ded2916069903997d6896664c2d1bbab8.jpg',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: 'MOSFET晶体管',
                model: 'IRF540N',
                category: 'transistor',
                value: 'N沟道',
                stock: 12,
                threshold: 8,
                location: 'D2-3',
                notes: '功率MOSFET，TO-220封装',
                image: 'https://kimi-web-img.moonshot.cn/img/soldered.com/f1799c7b6f80ddb38cae3633c03f80cfc83de248.jpg',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: '稳压二极管',
                model: '1N4742A',
                category: 'diode',
                value: '12V/1W',
                stock: 56,
                threshold: 15,
                location: 'E3-2',
                notes: '12V稳压二极管，DO-41封装',
                image: 'https://kimi-web-img.moonshot.cn/img/www.minder-hightech.com/3c3caac901de4883e95018dbf4568be11ec6dc30.png',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: '可调电阻',
                model: '3296W-10K',
                category: 'resistor',
                value: '10kΩ可调',
                stock: 5,
                threshold: 8,
                location: 'A2-7',
                notes: '精密可调电阻，多圈电位器',
                image: 'https://kimi-web-img.moonshot.cn/img/cdn1.byjus.com/d95c2e166fd48be2acca17b6e74b2ba1a6c99cc7.png',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: '电解电容',
                model: 'EC-470-25V',
                category: 'capacitor',
                value: '470μF',
                stock: 67,
                threshold: 20,
                location: 'B1-4',
                notes: '铝电解电容，25V耐压',
                image: 'https://kimi-web-img.moonshot.cn/img/www.ato.com/270b623670500c34522fc0d5d8c5632d341c336f.jpg',
                createdAt: new Date().toISOString()
            },
            {
                id: this.generateId(),
                name: '磁珠电感',
                model: 'FB-600-1A',
                category: 'inductor',
                value: '600Ω@100MHz',
                stock: 89,
                threshold: 25,
                location: 'C1-9',
                notes: 'EMI抑制磁珠，1A额定电流',
                image: 'https://kimi-web-img.moonshot.cn/img/electronics.koncon.nl/4389a5774de447abd7484006c87d5e493623201c.jpg',
                createdAt: new Date().toISOString()
            }
        ];
        
        this.components = sampleComponents;
        this.saveData();
        this.renderComponents();
        this.updateStatistics();
    }
    
    // 初始化示例历史记录
    initSampleHistory() {
        // 检查是否已有历史记录
        const checkoutHistory = localStorage.getItem('checkoutHistory');
        const inboundHistory = localStorage.getItem('inboundHistory');
        
        if (!checkoutHistory && !inboundHistory && this.components.length > 0) {
            // 创建一些模拟的历史记录
            const sampleCheckoutRecords = [
                {
                    componentName: '碳膜电阻',
                    quantity: 10,
                    beforeStock: 160,
                    afterStock: 150,
                    timestamp: new Date(Date.now() - 86400000 * 2).toISOString()
                },
                {
                    componentName: '陶瓷电容',
                    quantity: 5,
                    beforeStock: 13,
                    afterStock: 8,
                    timestamp: new Date(Date.now() - 86400000).toISOString()
                },
                {
                    componentName: '整流二极管',
                    quantity: 20,
                    beforeStock: 98,
                    afterStock: 78,
                    timestamp: new Date().toISOString()
                }
            ];
            
            const sampleInboundRecords = [
                {
                    componentName: 'NPN晶体管',
                    quantity: 15,
                    beforeStock: 0,
                    afterStock: 15,
                    timestamp: new Date(Date.now() - 86400000 * 3).toISOString()
                },
                {
                    componentName: '电解电容',
                    quantity: 30,
                    beforeStock: 37,
                    afterStock: 67,
                    timestamp: new Date(Date.now() - 86400000 * 1.5).toISOString()
                },
                {
                    componentName: '磁珠电感',
                    quantity: 25,
                    beforeStock: 64,
                    afterStock: 89,
                    timestamp: new Date(Date.now() - 3600000).toISOString()
                }
            ];
            
            localStorage.setItem('checkoutHistory', JSON.stringify(sampleCheckoutRecords));
            localStorage.setItem('inboundHistory', JSON.stringify(sampleInboundRecords));
        }
    }

    // 恢复上次选择的分类状态
    restoreCategoryState() {
        const lastCategory = localStorage.getItem('lastSelectedCategory');
        if (lastCategory) {
            this.currentCategory = lastCategory;

            // 更新UI，移除所有active类，给对应分类添加active类
            document.querySelectorAll('.category-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.category === lastCategory) {
                    item.classList.add('active');
                }
            });
            // 不在这里调用 filterAndRender()，而是在 init() 中统一调用
        }
    }
    
    // 生成唯一ID
    generateId() {
        return 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // HTML 转义工具方法
    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    // 绑定事件
    bindEvents() {
        // 搜索功能（添加防抖优化）
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) { console.warn('searchInput 未找到，跳过事件绑定'); return; }
        searchInput.addEventListener('input', (e) => {
            // 清除之前的防抖定时器
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
            }

            this.searchQuery = e.target.value.toLowerCase();

            // 清除BOM筛选状态
            this.bomFilteredComponentIds = null;

            // 设置新的防抖定时器（300ms延迟）
            this.searchDebounceTimer = setTimeout(() => {
                this.currentPage = 1; // 重置到第一页
                this.filterAndRender();
            }, 300);
        });

        // 分类筛选
        document.querySelectorAll('.category-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.currentCategory = item.dataset.category;
                // 重置子类别筛选
                this.currentSubCategory = '';
                // 清除BOM筛选状态
                this.bomFilteredComponentIds = null;
                // 保存当前分类到 localStorage，实现页面间状态保持
                localStorage.setItem('lastSelectedCategory', this.currentCategory);
                // 更新分化参数筛选字段
                this.updateParamFilterFields();
                // 更新子类别筛选
                this.renderSubCategoryFilter();
                this.filterAndRender();
            });
        });

        // 清除分化参数筛选
        const clearParamBtn = document.getElementById('clearParamFilterBtn');
        if (clearParamBtn) {
            clearParamBtn.addEventListener('click', () => {
                this.paramFilters = {};
                this.paramFilterActive = false;
                this.updateParamFilterFields();
                this.filterAndRender();
            });
        }

        // 库存状态筛选
        document.querySelectorAll('.stock-filter').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.currentStockFilters = Array.from(document.querySelectorAll('.stock-filter:checked'))
                    .map(cb => cb.dataset.status);
                // 清除BOM筛选状态
                this.bomFilteredComponentIds = null;
                this.filterAndRender();
            });
        });

        // 注释：添加元器件按钮现在是链接，直接跳转到 add-component.html 页面
        // document.getElementById('addComponentBtn').addEventListener('click', () => {
        //     this.showAddModal();
        // });

        document.getElementById('addFirstComponent')?.addEventListener('click', () => {
            this.showAddModal();
        });

        // 模态框关闭
        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideModal('componentModal');
        });
        
        document.getElementById('closeAddModal').addEventListener('click', () => {
            this.hideModal('addComponentModal');
        });

        // 元器件变动记录按钮
        document.getElementById('componentHistoryBtn')?.addEventListener('click', () => {
            if (this.editingComponent) {
                this.showComponentHistory(this.editingComponent.name);
            }
        });
        document.getElementById('closeComponentHistory')?.addEventListener('click', () => {
            this.hideModal('componentHistoryModal');
        });

        // 图片链接预览更新
        document.getElementById('componentImage').addEventListener('input', (e) => {
            this.updateImagePreview(e.target.value);
        });
        
        // 数据手册链接预览更新
        document.getElementById('componentDatasheet').addEventListener('input', (e) => {
            this.updateDatasheetPreview(e.target.value);
        });
        
        // 数据手册文件上传事件
        const datasheetFileInput = document.getElementById('componentDatasheetFile');
        if (datasheetFileInput) {
            datasheetFileInput.addEventListener('change', (e) => {
                this.handleDatasheetFileUpload(e);
            });
        }
        
        // 添加页面的数据手册文件上传事件
        const addDatasheetFileInput = document.getElementById('addComponentDatasheetFile');
        if (addDatasheetFileInput) {
            addDatasheetFileInput.addEventListener('change', (e) => {
                this.handleAddDatasheetFileUpload(e);
            });
        }
        
        // 添加模态框的图片链接预览更新
        const addComponentForm = document.getElementById('addComponentForm');
        if (addComponentForm) {
            document.getElementById('addComponentImage').addEventListener('input', (e) => {
                this.updateImagePreview(e.target.value, true);
            });
        }
        
        // 添加模态框 - 一级分类变化时更新二级分类选项
        document.getElementById('addComponentCategory').addEventListener('change', (e) => {
            this.updateSubCategoryOptions('addComponentCategory', 'addComponentSubCategory');
        });
        
        // 编辑模态框 - 一级分类变化时更新二级分类选项
        document.getElementById('componentCategory').addEventListener('change', (e) => {
            this.updateSubCategoryOptions('componentCategory', 'componentSubCategory');
            // 分类变化后重新渲染分化参数（传递当前子类别）
            const subCat = document.getElementById('componentSubCategory')?.value || '';
            this.renderParamFields('paramFields', e.target.value, null, subCat);
        });
        
        // 编辑模态框 - 子类别变化时重新渲染分化参数
        document.getElementById('componentSubCategory').addEventListener('change', (e) => {
            const cat = document.getElementById('componentCategory')?.value || '';
            this.renderParamFields('paramFields', cat, null, e.target.value);
        });
        
        // 表单提交
        document.getElementById('componentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveComponent();
        });

        // 编辑元器件表单 - Enter键提交保存（全局监听，确保任何焦点下都生效）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const modal = document.getElementById('componentModal');
                if (modal && !modal.classList.contains('hidden')) {
                    const tag = document.activeElement?.tagName || '';
                    if (tag !== 'TEXTAREA') {
                        e.preventDefault();
                        this.saveComponent();
                    }
                }
            }
        });

        document.getElementById('addComponentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addComponent();
        });
        
        // 删除按钮
        document.getElementById('deleteComponent').addEventListener('click', () => {
            if (this.editingComponent && confirm('确定要删除这个元器件吗？')) {
                this.deleteComponent(this.editingComponent.id);
                this.hideModal('componentModal');
            }
        });
        
        // 取消按钮
        document.getElementById('cancelAdd').addEventListener('click', () => {
            this.hideModal('addComponentModal');
        });
        
        // 数据操作
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });
        
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        
        // 文件导入
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.importData(e.target.files[0]);
        });
        
        // 侧边栏切换
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });
        
        // 点击模态框背景关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                // 获取模态框内容区域（排除背景遮罩自身）
                const content = modal.querySelector('.modal-content, .modal-content-custom');
                if (!content || e.target === modal || !content.contains(e.target)) {
                    this.hideModal(modal.id);
                }
            });
        });
        
        // 采集清单事件绑定
        const toggleCollectionBtn = document.getElementById('toggleCollectionPanel');
        const clearCollectionBtn = document.getElementById('clearCollectionBtn');
        const batchCheckoutBtn = document.getElementById('batchCheckoutBtn');
        const cancelCheckoutBtn = document.getElementById('cancelCheckout');
        const confirmCheckoutBtn = document.getElementById('confirmCheckout');
        
        if (toggleCollectionBtn) {
            toggleCollectionBtn.addEventListener('click', () => this.toggleCollectionPanel());
        }
        
        if (clearCollectionBtn) {
            clearCollectionBtn.addEventListener('click', () => this.clearCollection());
        }
        
        if (batchCheckoutBtn) {
            batchCheckoutBtn.addEventListener('click', () => this.batchCheckout());
        }
        
        if (cancelCheckoutBtn) {
            cancelCheckoutBtn.addEventListener('click', () => this.cancelCheckout());
        }
        
        if (confirmCheckoutBtn) {
            confirmCheckoutBtn.addEventListener('click', () => this.confirmBatchCheckout());
        }
        
        // 初始化清单面板拖拽功能
        this.initCollectionPanelDrag();
        
        // 入库清单事件绑定
        const batchInboundBtn = document.getElementById('batchInboundBtn');
        const cancelInboundBtn = document.getElementById('cancelInbound');
        const confirmInboundBtn = document.getElementById('confirmInbound');
        const checkoutTab = document.getElementById('checkoutTab');
        const inboundTab = document.getElementById('inboundTab');
        
        if (batchInboundBtn) {
            batchInboundBtn.addEventListener('click', () => this.batchInbound());
        }
        
        if (cancelInboundBtn) {
            cancelInboundBtn.addEventListener('click', () => this.cancelInbound());
        }
        
        if (confirmInboundBtn) {
            confirmInboundBtn.addEventListener('click', () => this.confirmBatchInbound());
        }
        
        if (checkoutTab) {
            checkoutTab.addEventListener('click', () => this.switchListTab('checkout'));
        }
        
        if (inboundTab) {
            inboundTab.addEventListener('click', () => this.switchListTab('inbound'));
        }
        
        // 历史记录按钮
        const historyBtn = document.getElementById('historyBtn');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => this.showHistoryModal());
        }
        
        // 历史记录筛选按钮
        document.getElementById('filterAll').addEventListener('click', () => this.filterHistory('all'));
        document.getElementById('filterCheckout').addEventListener('click', () => this.filterHistory('checkout'));
        document.getElementById('filterInbound').addEventListener('click', () => this.filterHistory('inbound'));
        
        // 清空历史记录按钮
        document.getElementById('clearHistoryAll').addEventListener('click', () => this.clearHistory('all'));
        document.getElementById('clearHistoryCheckout').addEventListener('click', () => this.clearHistory('checkout'));
        document.getElementById('clearHistoryInbound').addEventListener('click', () => this.clearHistory('inbound'));

        // 关闭历史记录模态框
        document.getElementById('closeHistoryModal').addEventListener('click', () => this.hideModal('historyModal'));

        // BOM匹配按钮
        const bomMatchBtn = document.getElementById('bomMatchBtn');
        if (bomMatchBtn) {
            bomMatchBtn.addEventListener('click', () => this.showBomMatchModal());
        }

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && (e.key === 'F' || e.key === 'f')) {
                e.preventDefault();
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }

            // Ctrl+A 弹出/隐藏清单面板
            if (e.ctrlKey && (e.key === 'A' || e.key === 'a')) {
                e.preventDefault();
                this.toggleCollectionPanel();
            }

            // Ctrl+Z 撤回上一个操作
            if (e.ctrlKey && (e.key === 'Z' || e.key === 'z')) {
                e.preventDefault();
                this.undo();
            }

            // Ctrl+B 切换BOM匹配面板的显示/隐藏
            if (e.ctrlKey && (e.key === 'B' || e.key === 'b')) {
                e.preventDefault();
                this.toggleBomMatchModal();
            }

            // Enter键执行批量出库/入库操作
            if (e.key === 'Enter') {
                // 检查清单面板是否可见
                const panel = document.getElementById('collectionPanel');
                if (!panel.classList.contains('translate-x-full')) {
                    // 检查当前激活的标签页
                    const checkoutTab = document.getElementById('checkoutTab');
                    const inboundTab = document.getElementById('inboundTab');
                    
                    if (checkoutTab.classList.contains('active')) {
                        // 出库清单激活，执行批量出库
                        e.preventDefault();
                        this.batchCheckout();
                    } else if (inboundTab.classList.contains('active')) {
                        // 入库清单激活，执行批量入库
                        e.preventDefault();
                        this.batchInbound();
                    }
                }
            }
            
            // ESC 键关闭对话框或隐藏面板
            if (e.key === 'Escape') {
                const confirmModal = document.getElementById('checkoutConfirmModal');
                const inboundModal = document.getElementById('inboundConfirmModal');
                const historyModal = document.getElementById('historyModal');
                const panel = document.getElementById('collectionPanel');
                const bomMatchModal = document.getElementById('bomMatchModal');

                // 优先关闭对话框
                if (!confirmModal.classList.contains('hidden')) {
                    this.cancelCheckout();
                } else if (!inboundModal.classList.contains('hidden')) {
                    this.cancelInbound();
                } else if (!historyModal.classList.contains('hidden')) {
                    this.hideModal('historyModal');
                } else if (!document.getElementById('componentHistoryModal').classList.contains('hidden')) {
                    this.hideModal('componentHistoryModal');
                }
                // 如果没有对话框，检查BOM匹配面板
                else if (bomMatchModal && !bomMatchModal.classList.contains('-translate-x-full')) {
                    this.hideBomMatchModal();
                }
                // 如果BOM面板也没有，则隐藏清单面板
                else if (!panel.classList.contains('translate-x-full')) {
                    panel.classList.add('translate-x-full');
                }
            }
        });

        // 批量编辑按钮
        const bulkEditBtn = document.getElementById('bulkEditBtn');
        if (bulkEditBtn) {
            bulkEditBtn.addEventListener('click', () => {
                this.showBulkEditModal();
            });
        }

        // LCSC订单导入按钮 - 从本地 XLS 文件导入
        const lcscImportBtn = document.getElementById('lcscImportBtn');
        if (lcscImportBtn) {
            lcscImportBtn.addEventListener('click', () => {
                if (this.lcscImportManager) {
                    this.lcscImportManager.openXLSImport();
                } else {
                    this.showNotification('导入模块未初始化', 'error');
                }
            });
        }

        // 批量编辑模态框事件
        document.getElementById('closeBulkEditModal').addEventListener('click', () => {
            this.hideBulkEditModal();
        });

        document.getElementById('bulkEditCancel').addEventListener('click', () => {
            this.hideBulkEditModal();
        });

        document.getElementById('bulkEditSave').addEventListener('click', () => {
            this.bulkEditComponents();
        });

        document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
            this.bulkDeleteComponents();
        });

        document.getElementById('bulkEditSearch').addEventListener('input', () => {
            this.renderBulkEditComponentList();
        });

        document.getElementById('bulkEditCategory').addEventListener('change', () => {
            this.renderBulkEditComponentList();
            this.updateBulkEditSubCategoryOptions();
            this.updateBulkEditParamFields();
        });

        document.getElementById('bulkEditSelectAll').addEventListener('change', (e) => {
            this.toggleSelectAllBulkEdit(e.target.checked);
        });

        document.getElementById('bulkEditClearSelection').addEventListener('click', () => {
            this.clearBulkEditSelection();
        });
    }

    // 渲染侧边栏子类别筛选按钮
    renderSubCategoryFilter() {
        const section = document.getElementById('subCategoryFilterSection');
        const container = document.getElementById('subCategoryFilterContainer');
        if (!section || !container) {
            console.log('[Debug] subCategoryFilter elements not found');
            return;
        }

        const category = this.currentCategory;
        if (!category || category === 'all') {
            section.classList.add('hidden');
            return;
        }

        const subCats = this.getSubCategorySettings()[category] || [];
        if (subCats.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        container.innerHTML = subCats.map(name => `
            <button class="subcategory-filter-btn px-3 py-1 text-xs rounded-full transition-colors
                ${this.currentSubCategory === name
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
                data-subcategory="${name}">
                ${name}
            </button>
        `).join('') + `
            <button class="subcategory-filter-btn px-3 py-1 text-xs rounded-full transition-colors
                ${!this.currentSubCategory
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
                data-subcategory="">
                全部
            </button>
        `;

        // 绑定点击事件 (使用事件委托，先移除旧监听避免重复)
        const clickHandler = (e) => {
            const btn = e.target.closest('.subcategory-filter-btn');
            if (!btn) return;
            const subCat = btn.dataset.subcategory || '';
            console.log('[SubCat] 点击子类别:', subCat);
            this.currentSubCategory = subCat;
            this.renderSubCategoryFilter();
            this.updateParamFilterFields();
            this.filterAndRender();
        };
        // 移除旧监听再添加新监听
        container.removeEventListener('click', this._subCategoryClickHandler);
        container.addEventListener('click', clickHandler);
        this._subCategoryClickHandler = clickHandler;
    }
    
    // 初始化动画
    initAnimations() {
        // 页面加载动画
        anime({
            targets: '.fade-in',
            opacity: [0, 1],
            translateY: [20, 0],
            delay: anime.stagger(100),
            duration: 600,
            easing: 'easeOutQuart'
        });
    }

    // =============== 优化版拖拽排序 ===============

    // 初始化分类拖拽排序
    initCategoryDragSort() {
        const categoryList = document.getElementById('categoryList');
        if (!categoryList) return;

        // 加载自定义排序
        this.loadCategoryOrder();

        // 插入线 - 唯一的视觉指示器
        this.insertLine = this.createInsertLine();
        // 当前插入位置标识
        this.lastInsertKey = null;
        // 当前插入的目标元素引用
        this.insertTargetRef = null;

        // 创建节流版本的拖拽经过处理函数
        this.throttledHandleDragOver = this.throttle((e) => this.handleDragOver(e), 16, 'dragOver');

        // 为每个拖拽手柄添加拖拽事件
        const dragHandles = categoryList.querySelectorAll('.drag-handle[draggable="true"]');
        dragHandles.forEach(handle => {
            handle.addEventListener('dragstart', (e) => this.handleDragStart(e));
            handle.addEventListener('dragend', (e) => this.handleDragEnd(e));
        });

        // 为所有分类项添加放置事件（使用事件委托）
        // preventDefault() 必须每次调用，否则浏览器会阻止 drop
        categoryList.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.throttledHandleDragOver(e);
        });
        categoryList.addEventListener('dragleave', (e) => this.handleDragListLeave(e));
        categoryList.addEventListener('drop', (e) => this.handleDrop(e));
    }

    // 创建插入线
    createInsertLine() {
        const old = document.getElementById('categoryList')?.querySelector('.drag-insert-line');
        if (old) old.remove();
        const line = document.createElement('div');
        line.className = 'drag-insert-line';
        document.getElementById('categoryList').appendChild(line);
        return line;
    }

    // HTML 转义工具方法
    escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    escapeAttr(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // 渲染自定义类别到侧边栏
    renderCustomCategoryItems() {
        console.log('[CustomCat] renderCustomCategoryItems called');
        const customCategories = this.getCustomCategories();
        console.log('[CustomCat] categories:', JSON.stringify(customCategories));
        if (!customCategories.length) return;
        const categoryList = document.getElementById('categoryList');
        if (!categoryList) return;

        // 计算各分类的元器件数量
        const catCounts = {};
        this.components.forEach(c => {
            catCounts[c.category] = (catCounts[c.category] || 0) + 1;
        });

        customCategories.forEach(cat => {
            // 跳过已渲染的
            if (categoryList.querySelector(`[data-category="${cat.key}"]`)) return;

            const count = catCounts[cat.key] || 0;
            const div = document.createElement('div');
            div.className = 'category-item';
            div.dataset.category = cat.key;
            div.innerHTML = `
                <div class="flex items-center justify-between">
                    <span class="drag-handle cursor-move text-gray-500 hover:text-gray-300 mr-2" draggable="true">
                        <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path>
                        </svg>
                    </span>
                    <span class="flex-1">${this.escapeHtml(cat.name)}</span>
                    <span class="text-xs bg-gray-600 px-2 py-1 rounded-full" id="count-${this.escapeAttr(cat.key)}">${count}</span>
                </div>
            `;
            categoryList.appendChild(div);
        });

        // 绑定新建类别项的点击事件
        customCategories.forEach(cat => {
            const item = categoryList.querySelector(`[data-category="${cat.key}"]`);
            if (item) {
                item.addEventListener('click', (e) => {
                    document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    this.currentCategory = cat.key;
                    this.currentSubCategory = '';
                    this.bomFilteredComponentIds = null;
                    localStorage.setItem('lastSelectedCategory', this.currentCategory);
                    this.updateParamFilterFields();
                    this.renderSubCategoryFilter();
                    this.filterAndRender();
                });
            }
        });

        // 重新初始化拖拽排序以包含新项
        this.initCategoryDragSort();
    }

    // 拖拽开始
    handleDragStart(e) {
        const categoryItem = e.target.closest('.category-item');
        if (!categoryItem) return;

        categoryItem.classList.add('dragging');

        // 隐藏浏览器默认的半透明幽灵图，避免视觉干扰
        const blankImg = new Image();
        blankImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(blankImg, 0, 0);

        // 配置拖拽数据传输
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', categoryItem.dataset.category);

        this.draggedItem = categoryItem;

        // 初始化位置追踪
        this.lastInsertKey = null;
        this.insertTargetRef = null;
    }

    // 拖拽结束
    handleDragEnd(e) {
        if (this.draggedItem) {
            this.draggedItem.classList.remove('dragging');
            // 弹入动画
            this.draggedItem.classList.add('spring-in');
            // 动画结束后移除
            const onEnd = () => {
                this.draggedItem?.classList.remove('spring-in');
            };
            this.draggedItem.addEventListener('animationend', onEnd, { once: true });
            // 安全兜底
            setTimeout(onEnd, 500);
        }

        // 清理视觉反馈
        this.hideInsertIndicator();

        // 保存排序（如果 DOM 发生了变化）
        this.saveCategoryOrder();

        // 清理临时变量
        this.draggedItem = null;
        this.lastInsertKey = null;
        this.insertTargetRef = null;
    }

    // 拖拽经过 - 核心逻辑
    handleDragOver(e) {
        e.preventDefault();
        if (!this.draggedItem) return;

        // 找到鼠标下方的分类项
        const dropTarget = e.target.closest('.category-item');
        if (!dropTarget || dropTarget.dataset.category === 'all') {
            this.hideInsertIndicator();
            return;
        }

        // 计算插入位置：用 item 高度的比例来判断上/下
        const rect = dropTarget.getBoundingClientRect();
        const relY = (e.clientY - rect.top) / rect.height;
        const insertAbove = relY < 0.5;

        // 拖拽自身且在自身上方 → 无变化，隐藏指示器
        if (dropTarget === this.draggedItem && insertAbove) {
            this.hideInsertIndicator();
            return;
        }

        // 生成插入位置标识
        const insertKey = `${dropTarget.dataset.category}-${insertAbove ? 'above' : 'below'}`;

        // 位置没变 → 只跳过 DOM 操作，不跳过高亮保持（避免闪烁）
        if (this.lastInsertKey === insertKey) {
            return;
        }

        // 位置变了 → 更新所有视觉指示
        this.lastInsertKey = insertKey;
        this.insertTargetRef = { target: dropTarget, above: insertAbove };

        // 清除旧高亮，添加新高亮
        this.clearDragOver();
        dropTarget.classList.add('drag-over');

        // 更新插入线位置（考虑滚动偏移）
        const list = document.getElementById('categoryList');
        const listRect = list.getBoundingClientRect();
        const lineY = (insertAbove ? rect.top : rect.bottom) - listRect.top + list.scrollTop;
        this.insertLine.style.top = lineY + 'px';
        this.insertLine.classList.add('visible');
    }

    // 隐藏插入指示器
    hideInsertIndicator() {
        this.insertLine?.classList.remove('visible');
        this.clearDragOver();
        this.lastInsertKey = null;
        this.insertTargetRef = null;
    }

    // 拖拽离开列表区域
    handleDragListLeave(e) {
        // 只有当真正离开 #categoryList 才清除
        const list = document.getElementById('categoryList');
        if (!list.contains(e.relatedTarget)) {
            this.hideInsertIndicator();
        }
    }

    // 清除拖拽高亮
    clearDragOver() {
        document.querySelectorAll('.category-item.drag-over').forEach(item => {
            item.classList.remove('drag-over');
        });
    }

    // 放置 - 真正移动 DOM
    handleDrop(e) {
        e.preventDefault();
        if (!this.draggedItem || !this.insertTargetRef) {
            this.hideInsertIndicator();
            return;
        }

        const { target, above } = this.insertTargetRef;

        // 如果拖拽项就是目标，且插入位置在自身下方 → 不需要移动
        if (target === this.draggedItem && !above) {
            // 不变
        } else {
            // 移动 DOM
            if (above) {
                target.before(this.draggedItem);
            } else {
                target.after(this.draggedItem);
            }
        }

        this.hideInsertIndicator();
    }

    // 保存分类排序
    saveCategoryOrder() {
        const categoryList = document.getElementById('categoryList');
        const items = categoryList.querySelectorAll('.category-item');
        const order = Array.from(items).map(item => item.dataset.category).filter(cat => cat !== 'all');
        localStorage.setItem('categoryOrder', JSON.stringify(order));
        this.syncSettingsToServer();
    }
    loadCategoryOrder() {
        const savedOrder = localStorage.getItem('categoryOrder');
        if (!savedOrder) return;

        try {
            const order = JSON.parse(savedOrder);
            const categoryList = document.getElementById('categoryList');
            const items = categoryList.querySelectorAll('.category-item');

            // 创建一个Map来快速查找元素
            const itemMap = new Map();
            items.forEach(item => {
                if (item.dataset.category !== 'all') {
                    itemMap.set(item.dataset.category, item);
                }
            });

            // 按保存的顺序重新排列
            order.forEach(category => {
                const item = itemMap.get(category);
                if (item) {
                    categoryList.appendChild(item);
                }
            });
        } catch (e) {
            console.error('加载分类排序失败:', e);
        }
    }

    // 显示历史记录模态框
    showHistoryModal() {
        document.getElementById('historyModal').classList.remove('hidden');
        this.renderHistoryRecords('all');
    }

    // 显示指定元器件的变动记录
    showComponentHistory(componentName) {
        document.getElementById('componentHistoryTitle').textContent = componentName + ' - 变动记录';

        // 获取该元器件的出入库记录
        const checkoutHistory = JSON.parse(localStorage.getItem('checkoutHistory') || '[]')
            .filter(r => r.componentName === componentName)
            .map(r => ({ ...r, type: 'checkout' }));
        const inboundHistory = JSON.parse(localStorage.getItem('inboundHistory') || '[]')
            .filter(r => r.componentName === componentName)
            .map(r => ({ ...r, type: 'inbound' }));

        // 合并并按时间倒序
        const records = [...checkoutHistory, ...inboundHistory]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const list = document.getElementById('componentHistoryList');
        const empty = document.getElementById('componentHistoryEmpty');

        if (records.length === 0) {
            list.classList.add('hidden');
            empty.classList.remove('hidden');
        } else {
            list.classList.remove('hidden');
            empty.classList.add('hidden');
            list.innerHTML = records.map(record => {
                const date = new Date(record.timestamp);
                const formatted = date.getFullYear() + '-' +
                    String(date.getMonth() + 1).padStart(2, '0') + '-' +
                    String(date.getDate()).padStart(2, '0') + ' ' +
                    String(date.getHours()).padStart(2, '0') + ':' +
                    String(date.getMinutes()).padStart(2, '0');
                const isCheckout = record.type === 'checkout';
                const typeLabel = isCheckout ? '出库' : '入库';
                const typeClass = isCheckout ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400';
                const prefix = isCheckout ? '-' : '+';
                const qtyClass = isCheckout ? 'text-orange-400' : 'text-green-400';
                return '<div class="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700/70 transition-colors">' +
                    '<div class="flex items-center justify-between mb-2">' +
                    '<div class="flex items-center space-x-2">' +
                    '<span class="px-2 py-1 rounded text-xs font-medium ' + typeClass + '">' + typeLabel + '</span>' +
                    '<span class="text-gray-400 text-sm">' + formatted + '</span>' +
                    '</div>' +
                    '<span class="' + qtyClass + ' font-semibold">' + prefix + record.quantity + '</span>' +
                    '</div>' +
                    '<div class="text-gray-400 text-xs">库存：' + record.beforeStock + ' → ' + record.afterStock + '</div>' +
                    '</div>';
            }).join('');
        }

        document.getElementById('componentHistoryModal').classList.remove('hidden');
    }

    // 获取历史记录
    getHistoryRecords() {
        const checkoutHistory = JSON.parse(localStorage.getItem('checkoutHistory') || '[]');
        const inboundHistory = JSON.parse(localStorage.getItem('inboundHistory') || '[]');

        // 合并并添加类型标识
        const allRecords = [
            ...checkoutHistory.map(r => ({ ...r, type: 'checkout' })),
            ...inboundHistory.map(r => ({ ...r, type: 'inbound' }))
        ];

        // 按时间倒序排列，只取前50条
        return allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50);
    }

    // 渲染历史记录
    renderHistoryRecords(filterType = 'all') {
        const historyList = document.getElementById('historyList');
        const historyEmpty = document.getElementById('historyEmpty');
        const records = this.getHistoryRecords();

        // 筛选记录
        const filteredRecords = filterType === 'all'
            ? records
            : records.filter(r => r.type === filterType);
        
        if (filteredRecords.length === 0) {
            historyList.classList.add('hidden');
            historyEmpty.classList.remove('hidden');
            return;
        }
        
        historyList.classList.remove('hidden');
        historyEmpty.classList.add('hidden');
        
        historyList.innerHTML = filteredRecords.map(record => {
            const date = new Date(record.timestamp);
            const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            
            const isCheckout = record.type === 'checkout';
            const typeLabel = isCheckout ? '出库' : '入库';
            const typeClass = isCheckout ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400';
            const quantityPrefix = isCheckout ? '-' : '+';
            const quantityClass = isCheckout ? 'text-orange-400' : 'text-green-400';
            
            return `
                <div class="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700/70 transition-colors">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center space-x-2">
                            <span class="px-2 py-1 rounded text-xs font-medium ${typeClass}">${typeLabel}</span>
                            <span class="text-gray-400 text-sm">${formattedDate}</span>
                        </div>
                        <span class="${quantityClass} font-semibold">${quantityPrefix}${record.quantity}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <h4 class="text-white font-medium truncate" title="${record.componentName}">${record.componentName}</h4>
                            <p class="text-gray-400 text-xs mt-1">库存：${record.beforeStock} → ${record.afterStock}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // 筛选历史记录
    filterHistory(filterType) {
        // 更新按钮样式
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('bg-blue-500', 'text-white');
            btn.classList.add('bg-gray-700', 'text-gray-400');
        });
        
        const activeBtn = document.getElementById(`filter${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`);
        if (activeBtn) {
            activeBtn.classList.remove('bg-gray-700', 'text-gray-400');
            activeBtn.classList.add('bg-blue-500', 'text-white');
        }
        
        // 重新渲染记录
        this.renderHistoryRecords(filterType);
    }
    
    // 清空历史记录
    clearHistory(type) {
        let confirmText = '';
        let clearKeys = [];
        
        if (type === 'all') {
            confirmText = '确定要清空全部历史记录吗？此操作不可恢复！';
            clearKeys = ['checkoutHistory', 'inboundHistory'];
        } else if (type === 'checkout') {
            confirmText = '确定要清空出库历史记录吗？此操作不可恢复！';
            clearKeys = ['checkoutHistory'];
        } else if (type === 'inbound') {
            confirmText = '确定要清空入库历史记录吗？此操作不可恢复！';
            clearKeys = ['inboundHistory'];
        }
        
        if (confirm(confirmText)) {
            clearKeys.forEach(key => localStorage.removeItem(key));
            
            // 重新渲染历史记录
            const currentFilter = document.querySelector('.filter-btn.bg-blue-500')?.id;
            let filterType = 'all';
            if (currentFilter === 'filterCheckout') filterType = 'checkout';
            else if (currentFilter === 'filterInbound') filterType = 'inbound';
            
            this.renderHistoryRecords(filterType);
            
            const typeText = type === 'all' ? '全部' : (type === 'checkout' ? '出库' : '入库');
            this.showNotification(`${typeText}历史记录已清空`, 'success');
        }
    }
    
    // 保存历史记录
    saveHistoryRecord(type, componentName, quantity, beforeStock, afterStock) {
        const key = type === 'checkout' ? 'checkoutHistory' : 'inboundHistory';
        const history = JSON.parse(localStorage.getItem(key) || '[]');
        
        const record = {
            id: Date.now().toString(),
            componentName,
            quantity,
            beforeStock,
            afterStock,
            timestamp: new Date().toISOString()
        };
        
        history.push(record);
        
        // 只保留最近100条
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
        
        localStorage.setItem(key, JSON.stringify(history));
    }

    // 显示添加模态框
    showAddModal() {
        document.getElementById('addComponentModal').classList.remove('hidden');
        document.getElementById('addComponentForm').reset();
        this.addCustomCategoryOptions('addComponentCategory');
        // 初始化二级分类选项
        this.updateSubCategoryOptions('addComponentCategory', 'addComponentSubCategory');
    }
    
    // 为指定分类下拉框添加自定义类别选项
    addCustomCategoryOptions(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const custom = this.getCustomCategories();
        const builtInKeys = ['resistor', 'capacitor', 'inductor', 'transistor', 'mosfet', 'diode', 'led', 'ic', 'switch', 'crystal', 'other'];
        custom.forEach(cat => {
            if (builtInKeys.includes(cat.key)) return;
            if (select.querySelector(`option[value="${cat.key}"]`)) return;
            const opt = document.createElement('option');
            opt.value = cat.key;
            opt.textContent = cat.name;
            select.appendChild(opt);
        });
    }

    // 显示编辑模态框
    showEditModal(component) {
        this.editingComponent = component;
        document.getElementById('modalTitle').textContent = '编辑元器件';
        document.getElementById('componentName').value = component.name;
        document.getElementById('componentModel').value = component.model;
        document.getElementById('componentBrand').value = component.brand || '';
        document.getElementById('componentProductCode').value = component.productCode || '';
        this.addCustomCategoryOptions('componentCategory');
        document.getElementById('componentCategory').value = component.category;
        // 初始化并填充二级分类
        this.updateSubCategoryOptions('componentCategory', 'componentSubCategory');
        document.getElementById('componentSubCategory').value = component.subCategory || '';
        this.renderParamFields('paramFields', component.category, component.params, component.subCategory);
        document.getElementById('componentStock').value = component.stock;
        document.getElementById('componentThreshold').value = component.threshold;
        document.getElementById('componentLocation').value = component.location || '';
        document.getElementById('componentNotes').value = component.notes || '';
        document.getElementById('componentImage').value = component.image || '';
        document.getElementById('componentDatasheet').value = component.datasheet || '';
        document.getElementById('componentPrice').value = component.price != null ? component.price : '';
        
        // 显示图片预览
        this.updateImagePreview(component.image || '');
        
        // 显示数据手册链接预览
        this.updateDatasheetPreview(component.datasheet || '');
        
        // 显示已存储的数据手册文件信息
        this.pendingDatasheetFileData = null;
        (async () => {
            const stored = await getDatasheetFile(component.id);
            const fileInfo = document.getElementById('datasheetFileInfo');
            const fileName = document.getElementById('datasheetFileName');
            if (stored && fileInfo && fileName) {
                fileName.textContent = stored.name + ' (' + this.formatFileSize(stored.size) + ')';
                fileInfo.classList.remove('hidden');
                // 添加下载按钮
                fileInfo.querySelector('[data-action="download-datasheet"]')?.classList.remove('hidden');
            } else if (fileInfo) {
                fileInfo.classList.add('hidden');
            }
        })().catch(err => console.error('读取数据手册失败:', err));
        
        document.getElementById('componentModal').classList.remove('hidden');
        // 锁定背景滚动，弹窗内滚轮只控制弹窗内容
        document.body.style.overflow = 'hidden';
    }

    // 根据ID查找并编辑元器件
    editComponent(id) {
        const component = this.components.find(c => c.id === id);
        if (component) {
            this.showEditModal(component);
        } else {
            console.error('未找到元器件:', id);
        }
    }

    // 更新图片预览
    updateImagePreview(url, isAdd = false) {
        const previewId = isAdd ? 'addImagePreview' : 'imagePreview';
        const previewDiv = document.getElementById(previewId);
        if (!previewDiv) return;
        const imageElement = previewDiv.querySelector('img');
        
        if (url && url.trim()) {
            previewDiv.classList.remove('hidden');
            imageElement.src = url;
            imageElement.onerror = () => {
                // 图片加载失败时隐藏预览
                imageElement.src = '';
                previewDiv.classList.add('hidden');
            };
            
            // 如果不是添加模态框，初始化放大镜效果
            if (!isAdd) {
                this.initMagnifier();
            }
        } else {
            previewDiv.classList.add('hidden');
            imageElement.src = '';
        }
    }
    
    // 初始化放大镜效果（透镜式）
    initMagnifier() {
        const container = document.getElementById('imagePreviewContainer');
        const img = document.getElementById('imagePreviewImg');
        const lensBox = document.getElementById('lensBox');
        const zoomPreview = document.getElementById('zoomPreview');

        if (!container || !img || !lensBox || !zoomPreview) return;

        // 移除旧的事件监听
        const newContainer = container.cloneNode(true);
        container.parentNode.replaceChild(newContainer, container);

        const newLensBox = newContainer.querySelector('#lensBox');
        const newImg = newContainer.querySelector('#imagePreviewImg');

        // 图片加载完成后设置放大镜
        newImg.onload = () => {
            const containerWidth = newContainer.offsetWidth;
            const containerHeight = newContainer.offsetHeight;
            const zoomLevel = this.settings.magnifierZoom || 3; // 放大倍率
            const lensSize = Math.round(192 / zoomLevel); // 框选框大小（根据放大倍率计算，确保放大后填满预览容器）

            // 获取图片的原始尺寸
            const imgNaturalWidth = newImg.naturalWidth;
            const imgNaturalHeight = newImg.naturalHeight;

            // 计算实际显示的图片尺寸（考虑 object-contain 的影响）
            const containerAspect = containerWidth / containerHeight;
            const imgAspect = imgNaturalWidth / imgNaturalHeight;

            let actualImgWidth, actualImgHeight;
            let imgOffsetX, imgOffsetY;

            if (imgAspect > containerAspect) {
                // 图片更宽，以宽度为基准
                actualImgWidth = containerWidth;
                actualImgHeight = containerWidth / imgAspect;
                imgOffsetX = 0;
                imgOffsetY = (containerHeight - actualImgHeight) / 2;
            } else {
                // 图片更高，以高度为基准
                actualImgHeight = containerHeight;
                actualImgWidth = containerHeight * imgAspect;
                imgOffsetX = (containerWidth - actualImgWidth) / 2;
                imgOffsetY = 0;
            }

            // 设置框选框尺寸
            newLensBox.style.width = lensSize + 'px';
            newLensBox.style.height = lensSize + 'px';

            // 设置放大预览的背景图片和尺寸
            zoomPreview.style.backgroundImage = `url(${newImg.src})`;
            zoomPreview.style.backgroundSize = `${actualImgWidth * zoomLevel}px ${actualImgHeight * zoomLevel}px`;
            zoomPreview.style.backgroundRepeat = 'no-repeat';

            // 鼠标移动事件
            newContainer.addEventListener('mousemove', (e) => {
                const rect = newContainer.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // 计算相对于实际图片区域的坐标
                const relativeX = x - imgOffsetX;
                const relativeY = y - imgOffsetY;

                // 检查鼠标是否在实际图片区域内
                if (relativeX < 0 || relativeX > actualImgWidth || relativeY < 0 || relativeY > actualImgHeight) {
                    newLensBox.classList.add('hidden');
                    zoomPreview.classList.add('hidden');
                    return;
                }

                // 计算框选框位置（以鼠标为中心）
                let lensX = x - lensSize / 2;
                let lensY = y - lensSize / 2;

                // 限制框选框在实际图片区域内
                const minLensX = imgOffsetX;
                const maxLensX = imgOffsetX + actualImgWidth - lensSize;
                const minLensY = imgOffsetY;
                const maxLensY = imgOffsetY + actualImgHeight - lensSize;

                lensX = Math.max(minLensX, Math.min(lensX, maxLensX));
                lensY = Math.max(minLensY, Math.min(lensY, maxLensY));

                newLensBox.style.left = lensX + 'px';
                newLensBox.style.top = lensY + 'px';

                // 计算框选框在实际图片中的位置
                const lensInImgX = lensX - imgOffsetX;
                const lensInImgY = lensY - imgOffsetY;

                // 设置背景位置，使框选区域显示在预览区域的左上角
                const bgX = -lensInImgX * zoomLevel;
                const bgY = -lensInImgY * zoomLevel;

                zoomPreview.style.backgroundPosition = `${bgX}px ${bgY}px`;
            });

            // 鼠标进入显示放大效果
            newContainer.addEventListener('mouseenter', () => {
                newLensBox.classList.remove('hidden');
                zoomPreview.classList.remove('hidden');
            });

            // 鼠标离开隐藏放大效果
            newContainer.addEventListener('mouseleave', () => {
                newLensBox.classList.add('hidden');
                zoomPreview.classList.add('hidden');
            });
        };
    }
    
    // 更新数据手册链接预览
    updateDatasheetPreview(url) {
        const previewDiv = document.getElementById('datasheetPreview');
        const linkElement = document.getElementById('datasheetLink');
        
        if (url && url.trim()) {
            previewDiv.classList.remove('hidden');
            linkElement.href = url;
        } else {
            previewDiv.classList.add('hidden');
        }
    }

    // ========== 数据手册本地文件上传/下载/删除 ==========
    
    // 处理数据手册文件上传（编辑弹窗）
    async handleDatasheetFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // 限制文件大小（50MB）
        if (file.size > 50 * 1024 * 1024) {
            alert('文件大小超过限制（最大 50MB）');
            event.target.value = '';
            return;
        }
        
        // 读取文件并暂存（等保存时才写入 IndexedDB）
        const reader = new FileReader();
        reader.onload = (e) => {
            this.pendingDatasheetFileData = {
                file: file,
                data: e.target.result
            };
            // 更新 UI 显示文件信息
            const fileInfo = document.getElementById('datasheetFileInfo');
            const fileName = document.getElementById('datasheetFileName');
            if (fileInfo && fileName) {
                fileName.textContent = file.name + ' (' + this.formatFileSize(file.size) + ')';
                fileInfo.classList.remove('hidden');
            }
        };
        reader.onerror = () => {
            alert('文件读取失败，请重试');
            event.target.value = '';
        };
        reader.readAsArrayBuffer(file);
    }
    
    // 移除暂存的数据手册文件（编辑弹窗）
    removeDatasheetFile() {
        this.pendingDatasheetFileData = null;
        const fileInfo = document.getElementById('datasheetFileInfo');
        if (fileInfo) {
            fileInfo.classList.add('hidden');
        }
        const fileInput = document.getElementById('componentDatasheetFile');
        if (fileInput) fileInput.value = '';
    }
    
    // 下载已存储的数据手册文件到本地
    async downloadDatasheetFile(componentId) {
        const stored = await getDatasheetFile(componentId);
        if (!stored) {
            alert('未找到已存储的数据手册文件');
            return;
        }
        const blob = new Blob([stored.data], { type: stored.type });
        downloadBlob(blob, stored.name);
    }

    // 检查并打开/下载本地数据手册文件（从元器件卡片调用）
    async checkLocalDatasheet(componentId) {
        const component = this.components.find(c => c.id === componentId);
        const stored = await getDatasheetFile(componentId);
        if (stored) {
            // 有本地文件，直接下载
            const blob = new Blob([stored.data], { type: stored.type });
            downloadBlob(blob, stored.name);
        } else if (component && component.datasheet) {
            // 没有本地文件但有在线链接，打开链接
            window.open(component.datasheet, '_blank');
        } else {
            // 都没有，提示用户上传
            this.showNotification('该元器件尚未上传数据手册文件', 'info');
        }
    }
    
    // 格式化文件大小
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    // 添加元器件的文件上传处理（添加页面）
    async handleAddDatasheetFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (file.size > 50 * 1024 * 1024) {
            alert('文件大小超过限制（最大 50MB）');
            event.target.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.pendingAddDatasheetFileData = {
                file: file,
                data: e.target.result
            };
            const fileInfo = document.getElementById('addDatasheetFileInfo');
            const fileName = document.getElementById('addDatasheetFileName');
            if (fileInfo && fileName) {
                fileName.textContent = file.name + ' (' + this.formatFileSize(file.size) + ')';
                fileInfo.classList.remove('hidden');
            }
        };
        reader.onerror = () => {
            alert('文件读取失败，请重试');
            event.target.value = '';
        };
        reader.readAsArrayBuffer(file);
    }
    
    // 移除添加页面的暂存文件
    removeAddDatasheetFile() {
        this.pendingAddDatasheetFileData = null;
        const fileInfo = document.getElementById('addDatasheetFileInfo');
        if (fileInfo) fileInfo.classList.add('hidden');
        const fileInput = document.getElementById('addComponentDatasheetFile');
        if (fileInput) fileInput.value = '';
    }
    
    // 隐藏模态框
    hideModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
        if (modalId === 'componentModal') {
            this.editingComponent = null;
            // 恢复背景滚动
            document.body.style.overflow = '';
        }
    }
    
    // 添加元器件
    addComponent() {
        const category = document.getElementById('addComponentCategory').value;
        const subCategory = document.getElementById('addComponentSubCategory').value;
        const imageUrl = document.getElementById('addComponentImage').value.trim();
        const name = document.getElementById('addComponentName').value.trim();
        if (!name) {
            this.showNotification('元器件名称不能为空', 'error');
            return;
        }
        const stock = parseInt(document.getElementById('addComponentStock').value) || 0;

        const component = {
            id: this.generateId(),
            name: name,
            model: document.getElementById('addComponentModel').value,
            brand: document.getElementById('addComponentBrand').value,
            productCode: document.getElementById('addComponentProductCode').value,
            category: category,
            subCategory: subCategory,
            value: this.collectParams(document.getElementById('addComponentCategory').value, '', 'addComponentValue'),
            params: this.collectParams(document.getElementById('addComponentCategory').value, '', 'addComponentValue'),
            price: parseFloat(document.getElementById('addComponentPrice').value) || 0,
            threshold: parseInt(document.getElementById('addComponentThreshold').value),
            location: document.getElementById('addComponentLocation').value,
            notes: document.getElementById('addComponentNotes').value,
            datasheet: document.getElementById('addComponentDatasheet').value || '',
            image: imageUrl || this.getDefaultImage(category),
            createdAt: new Date().toISOString()
        };

        // 保存历史记录用于撤回
        this.pushHistory('addComponent', {
            componentId: component.id
        });

        this.components.push(component);
        this.saveData();
        // 保存数据手册文件到 IndexedDB
        (async () => {
            if (this.pendingAddDatasheetFileData) {
                await saveDatasheetFile(component.id, this.pendingAddDatasheetFileData.file);
                this.pendingAddDatasheetFileData = null;
            }
        })().catch(err => console.error('数据手册保存失败:', err));
        this.filterAndRender();
        this.updateStatistics();
        this.hideModal('addComponentModal');

        // 如果初始库存大于0，记录入库历史
        if (stock > 0) {
            this.saveHistoryRecord('inbound', component.name, stock, 0, stock);
        }

        // 添加成功动画
        this.showNotification('元器件添加成功！', 'success');
    }
    
    // 保存元器件
    saveComponent() {
        console.log('[saveComponent] 开始保存', this.editingComponent?.name, this.editingComponent?.id);
        if (!this.editingComponent) {
            console.warn('[saveComponent] editingComponent 为空，无法保存');
            this.showNotification('保存失败：未找到正在编辑的元器件', 'error');
            return;
        }

        try {
            const index = this.components.findIndex(c => c.id === this.editingComponent.id);
            console.log('[saveComponent] index:', index);
            if (index === -1) {
                console.warn('[saveComponent] 未在 components 中找到对应元器件');
                this.showNotification('保存失败：元器件数据不存在', 'error');
                return;
            }
            // 保存历史记录用于撤回
            const oldComponent = { ...this.components[index] };
            this.pushHistory('editComponent', {
                componentId: this.editingComponent.id,
                oldComponent: oldComponent
            });

            const imageUrl = document.getElementById('componentImage').value.trim();
            const newStock = parseInt(document.getElementById('componentStock').value) || oldComponent.stock;
            const beforeStock = oldComponent.stock;
            
            this.components[index] = {
                ...this.editingComponent,
                name: document.getElementById('componentName').value,
                model: document.getElementById('componentModel').value,
                brand: document.getElementById('componentBrand').value,
                productCode: document.getElementById('componentProductCode').value,
                category: document.getElementById('componentCategory').value,
                subCategory: document.getElementById('componentSubCategory').value,
                value: this.collectParams(document.getElementById('componentCategory').value, document.getElementById('componentSubCategory').value),
                params: this.collectParams(document.getElementById('componentCategory').value, document.getElementById('componentSubCategory').value),
                stock: newStock,
                price: parseFloat(document.getElementById('componentPrice').value) || 0,
                threshold: parseInt(document.getElementById('componentThreshold').value) || oldComponent.threshold,
                location: document.getElementById('componentLocation').value,
                notes: document.getElementById('componentNotes').value,
                image: imageUrl || oldComponent.image,
                datasheet: document.getElementById('componentDatasheet').value || '',
                updatedAt: new Date().toISOString()
            };

            // 记录出入库历史（如果库存有变化）
            if (newStock !== beforeStock) {
                if (newStock < beforeStock) {
                    // 出库：库存减少
                    const quantity = beforeStock - newStock;
                    this.saveHistoryRecord('checkout', oldComponent.name, quantity, beforeStock, newStock);
                } else {
                    // 入库：库存增加
                    const quantity = newStock - beforeStock;
                    this.saveHistoryRecord('inbound', oldComponent.name, quantity, beforeStock, newStock);
                }
            }

            this.saveData();

            // 保存数据手册文件到 IndexedDB
            (async () => {
                if (this.pendingDatasheetFileData) {
                    await saveDatasheetFile(this.components[index].id, this.pendingDatasheetFileData.file);
                    this.pendingDatasheetFileData = null;
                }
            })().catch(err => console.error('数据手册保存失败:', err));

            this.filterAndRender(false);
            this.updateStatistics();
            this.hideModal('componentModal');

            // 保存成功动画
            this.showNotification('元器件更新成功！', 'success');
        } catch (error) {
            console.error('[saveComponent] 保存失败:', error);
            this.showNotification('保存失败：' + (error.message || '未知错误'), 'error');
        }
    }
    
    // 删除元器件
    deleteComponent(componentId) {
        const component = this.components.find(c => c.id === componentId);

        // 保存历史记录用于撤回
        if (component) {
            this.pushHistory('deleteComponent', {
                component: { ...component }
            });
        }

        this.components = this.components.filter(c => c.id !== componentId);
        this.saveData();
        // 删除关联的数据手册文件
        deleteDatasheetFile(componentId).catch(err => console.error('数据手册删除失败:', err));
        this.filterAndRender(false);
        this.updateStatistics();
        this.showNotification('元器件删除成功！', 'success');
    }
    
    // 更新库存数量
    updateStock(componentId, change) {
        const component = this.components.find(c => c.id === componentId);
        if (component) {
            // 库存不足时阻止出库并提示
            if (change < 0 && component.stock + change < 0) {
                this.showNotification('库存不足，无法出库', 'error');
                return;
            }

            // 保存历史记录用于撤回
            this.pushHistory('updateStock', {
                componentId: componentId,
                oldStock: component.stock,
                oldUpdatedAt: component.updatedAt
            });

            const beforeStock = component.stock;
            component.stock = Math.max(0, component.stock + change);
            const afterStock = component.stock;
            component.updatedAt = new Date().toISOString();

            // 记录出入库历史
            if (change < 0) {
                // 出库：库存减少
                const quantity = beforeStock - afterStock;
                if (quantity > 0) {
                    this.saveHistoryRecord('checkout', component.name, quantity, beforeStock, afterStock);
                }
            } else {
                // 入库：库存增加
                const quantity = afterStock - beforeStock;
                if (quantity > 0) {
                    this.saveHistoryRecord('inbound', component.name, quantity, beforeStock, afterStock);
                }
            }

            this.saveData();
            this.filterAndRender(false);
            this.updateStatistics();

            // 库存变化动画
            this.animateStockChange(componentId, change);
        }
    }
    
    // 库存变化动画
    animateStockChange(componentId, change) {
        const card = document.querySelector(`[data-component-id="${componentId}"]`);
        if (card) {
            const stockElement = card.querySelector('.stock-text');
            if (stockElement) {
                anime({
                    targets: stockElement,
                    scale: [1, 1.2, 1],
                    color: change > 0 ? ['#00ff88', '#ffffff'] : ['#ff4757', '#ffffff'],
                    duration: 600,
                    easing: 'easeOutElastic(1, .8)'
                });
            }
        }
    }
    
    // 获取默认图片
    getDefaultImage(category) {
        const defaultImages = {
            resistor: 'resources/images/resistors/resistor-collection.png',
            capacitor: 'resources/images/capacitors/capacitor-collection.png',
            inductor: 'https://kimi-web-img.moonshot.cn/img/upload.wikimedia.org/a2f2e16f8969ba3d2db5fb18bd86a57a05f18f6e.jpg',
            transistor: 'https://kimi-web-img.moonshot.cn/img/www.buerklin.com/9318c346e9c8d3d4e9bc8df611e2bab6cae269f8.jpg',
            mosfet: 'https://kimi-web-img.moonshot.cn/img/soldered.com/f1799c7b6f80ddb38cae3633c03f80cfc83de248.jpg',
            diode: 'https://kimi-web-img.moonshot.cn/img/www.build-electronic-circuits.com/659b68c0c152c997f401ca30d570b2c98614aa04.jpg',
            led: 'https://kimi-web-img.moonshot.cn/img/www.buerklin.com/9318c346e9c8d3d4e9bc8df611e2bab6cae269f8.jpg',
            ic: 'resources/images/ics/ic-collection.png',
            switch: 'https://kimi-web-img.moonshot.cn/img/www.build-electronic-circuits.com/8f8a7b8c9d0e1f2a3b4c5d6e7f8a9b0c.jpg',
            crystal: 'https://kimi-web-img.moonshot.cn/img/www.build-electronic-circuits.com/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.jpg',
            other: 'resources/images/hero-circuit-board.png'
        };
        // 自定义类别统一返回通用图片
        if (!defaultImages[category]) return 'resources/images/hero-circuit-board.png';
        return defaultImages[category];
    }
    
    // 过滤和渲染
    filterAndRender(resetPage = true) {
        this.filteredComponents = this.components.filter(component => {
            // 如果设置了BOM筛选，只显示匹配的元器件
            if (this.bomFilteredComponentIds && this.bomFilteredComponentIds.length > 0) {
                return this.bomFilteredComponentIds.includes(component.id);
            }

            // 分类过滤
            if (this.currentCategory !== 'all' && component.category !== this.currentCategory) {
                return false;
            }

            // 子类别过滤
            if (this.currentSubCategory && component.subCategory !== this.currentSubCategory) {
                return false;
            }

            // 搜索过滤 - 支持多关键词并行搜索和单位等价性匹配
            if (this.searchQuery) {
                const searchText = `${component.name} ${component.model} ${component.brand || ''} ${this.getComponentValueText(component)} ${this.getCategoryName(component.category)} ${component.subCategory ? this.getSubCategoryName(component.category, component.subCategory) : ''} ${component.productCode || ''}`.toLowerCase();
                // 将搜索查询按空格分割成多个关键词（支持多个空格）
                const keywords = this.searchQuery.trim().split(/\s+/);
                // 所有关键词都必须匹配（AND 逻辑），支持单位等价性匹配
                const allMatch = keywords.every(keyword => this.matchesWithUnitEquivalence(keyword, searchText));
                if (!allMatch) {
                    return false;
                }
            }

            // 库存状态过滤
            const stockStatus = this.getStockStatus(component);
            if (!this.currentStockFilters.includes(stockStatus)) {
                return false;
            }

            // 分化参数范围过滤
            if (!this.checkParamFilter(component)) {
                return false;
            }

            return true;
        });

        // 按位置编号排序
        this.filteredComponents.sort((a, b) => {
            return this.compareLocationNumbers(a.location, b.location);
        });

        // BOM匹配结果：按置信度排序
        if (this.bomFilteredComponentIds && this.bomFilteredComponentIds.length > 0) {
            const orderMap = {};
            this.bomFilteredComponentIds.forEach((id, idx) => orderMap[id] = idx);
            this.filteredComponents.sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999));
        }

        // 根据参数决定是否重置到第一页
        if (resetPage) {
            this.currentPage = 1;
        }
        this.renderComponents();
        this.updateStatistics();
    }

    // 比较位置编号（用于排序）
    compareLocationNumbers(locA, locB) {
        // 如果两个都没有位置编号，保持原顺序
        if (!locA && !locB) return 0;
        // 如果只有a没有位置编号，a排在后面
        if (!locA) return 1;
        // 如果只有b没有位置编号，b排在后面
        if (!locB) return -1;

        // 解析位置编号格式：前缀-数字（如 A-001, B-123）
        const parseLocation = (loc) => {
            const match = loc.match(/^([A-Za-z]+)-(\d+)$/);
            if (match) {
                return {
                    prefix: match[1].toUpperCase(),
                    number: parseInt(match[2], 10)
                };
            }
            // 如果格式不匹配，返回原始字符串用于排序
            return { prefix: loc.toUpperCase(), number: null };
        };

        const parsedA = parseLocation(locA);
        const parsedB = parseLocation(locB);

        // 先按前缀排序
        if (parsedA.prefix !== parsedB.prefix) {
            return parsedA.prefix.localeCompare(parsedB.prefix);
        }

        // 如果前缀相同且都有数字，按数字排序
        if (parsedA.number !== null && parsedB.number !== null) {
            const result = parsedA.number - parsedB.number;
            // 调试日志
            if (locA.includes('A-') && locB.includes('A-')) {
                console.log(`比较: ${locA}(${parsedA.number}) vs ${locB}(${parsedB.number}) = ${result}`);
            }
            return result;
        }

        // 如果只有一个有数字，有数字的排在前面
        if (parsedA.number !== null) return -1;
        if (parsedB.number !== null) return 1;

        // 都没有数字，保持原顺序
        return 0;
    }
    
    // 获取库存状态
    getStockStatus(component) {
        if (component.stock === 0) return 'empty';
        if (component.stock <= component.threshold) return 'warning';
        return 'full';
    }
    
    // 获取库存状态样式
    getStockStatusClass(component) {
        const status = this.getStockStatus(component);
        const classes = {
            full: 'bg-green-500',
            warning: 'bg-yellow-500',
            empty: 'bg-red-500'
        };
        return classes[status];
    }
    
    // 获取库存状态文本
    getStockStatusText(component) {
        const status = this.getStockStatus(component);
        const texts = {
            full: '充足',
            warning: '预警',
            empty: '缺货'
        };
        return texts[status];
    }
    
    // 渲染元器件
    renderComponents() {
        const grid = document.getElementById('componentGrid');
        const emptyState = document.getElementById('emptyState');

        if (this.filteredComponents.length === 0) {
            grid.innerHTML = '';
            emptyState.classList.remove('hidden');
            // 隐藏分页器
            const pagination = document.getElementById('pagination');
            if (pagination) pagination.innerHTML = '';
            // 重置到第一页
            this.currentPage = 1;
            return;
        }

        emptyState.classList.add('hidden');

        // 计算分页并检查当前页是否超出范围
        const totalPages = Math.ceil(this.filteredComponents.length / this.pageSize);
        
        // 如果当前页超出范围，调整到合适的页码
        if (this.currentPage > totalPages) {
            this.currentPage = Math.max(1, totalPages);
        } else if (this.currentPage < 1) {
            this.currentPage = 1;
        }
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const currentPageComponents = this.filteredComponents.slice(startIndex, endIndex);

        // 使用分块渲染，防止大量DOM操作导致GPU/渲染卡顿
        const CHUNK_SIZE = 10;
        grid.innerHTML = '';

        const renderChunk = (start) => {
            const end = Math.min(start + CHUNK_SIZE, currentPageComponents.length);
            const fragment = document.createDocumentFragment();

            for (let i = start; i < end; i++) {
                const component = currentPageComponents[i];
                const cardElement = document.createElement('div');
                cardElement.className = 'component-card p-2 sm:p-3 lg:p-4 fade-in';
                cardElement.setAttribute('data-component-id', component.id);
                cardElement.innerHTML = this.getComponentCardHTML(component);
                fragment.appendChild(cardElement);
            }

            grid.appendChild(fragment);

            if (end < currentPageComponents.length) {
                requestAnimationFrame(() => renderChunk(end));
            } else {
                // 所有块渲染完成后初始化动画
                this.renderPagination(totalPages);
                this.initCardAnimations(grid);
            }
        };

        renderChunk(0);

        // 同步渲染分页器（不依赖卡片DOM）
        this.renderPagination(totalPages);

        // 重新初始化按钮状态
        this.initAllCollectionButtonStates();
        this.initAllInboundButtonStates();
    }

    // 生成单个元器件卡片的HTML（提取为独立方法，便于复用）
    getComponentCardHTML(component) {
        return `
            <div class="flex items-start justify-between mb-1 sm:mb-2 lg:mb-3">
                <div class="flex-1">
                    <h3 class="text-xs sm:text-sm lg:text-base font-semibold text-white mb-0.5">${this.escapeHtml(component.name)}</h3>
                    <p class="text-[10px] sm:text-xs text-gray-400 truncate">${this.escapeHtml(component.model)}</p>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="w-3 h-3 rounded-full ${this.getStockStatusClass(component)}"></div>
                    <span class="text-xs text-gray-400">${this.getStockStatusText(component)}</span>
                </div>
            </div>

            <div class="mb-1 sm:mb-2 lg:mb-3">
                <img src="${this.escapeHtml(component.image)}" alt="${this.escapeHtml(component.name)}"
                     class="w-full h-14 sm:h-16 lg:h-20 object-cover rounded-lg bg-gray-700"
                     loading="lazy"
                     onerror="this.src='resources/images/hero-circuit-board.png'">
                ${component.image ? `<div class="text-[10px] text-gray-500 mt-0.5 truncate"><a href="${this.escapeHtml(component.image)}" target="_blank" class="hover:text-blue-400" title="点击查看原图">查看原图</a></div>` : ''}
            </div>

            <div class="space-y-0.5 sm:space-y-1 lg:space-y-1.5 mb-1 sm:mb-2 lg:mb-3">
                <div class="flex justify-between text-[10px] sm:text-xs">
                    <span class="text-gray-400">类别:</span>
                    <span class="text-white">${this.getCategoryName(component.category)}${component.subCategory ? ' / ' + this.getSubCategoryName(component.category, component.subCategory) : ''}</span>
                </div>
                <div class="flex justify-between text-xs sm:text-sm">
                    <span class="text-gray-400">品牌:</span>
                    <span class="text-white">${this.escapeHtml(component.brand) || '-'}</span>
                </div>
                <div class="flex justify-between text-xs sm:text-sm">
                    <span class="text-gray-400">商品编码:</span>
                    <span class="text-white">${this.escapeHtml(component.productCode) || '-'}</span>
                </div>
                <div class="flex justify-between text-xs sm:text-sm">
                    <span class="text-gray-400">参数:</span>
                    <span class="text-white">${this.getComponentValueText(component)}</span>
                </div>
                <div class="flex justify-between text-xs sm:text-sm">
                    <span class="text-gray-400">位置:</span>
                    <span class="text-white">${this.escapeHtml(component.location) || '-'}</span>
                </div>
                ${component.datasheet ? `
                <div class="flex justify-between text-xs sm:text-sm">
                    <span class="text-gray-400">数据手册:</span>
                    <a href="${this.escapeHtml(component.datasheet)}" target="_blank" class="text-blue-400 hover:text-blue-300 underline truncate max-w-[140px]" title="${this.escapeHtml(component.datasheet)}">查看PDF</a>
                </div>` : ''}
            </div>

            <div class="flex items-center justify-between mb-1 sm:mb-2 lg:mb-3">
                <div class="flex items-center space-x-3">
                    <button class="quantity-btn-compact sm:quantity-btn" onclick="componentManager.updateStock('${component.id}', -1)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path>
                        </svg>
                    </button>
                    <div class="text-center">
                        <div class="stock-text text-sm sm:text-base font-bold text-white">${component.stock}</div>
                        <div class="text-xs text-gray-400">库存</div>
                    </div>
                    <button class="quantity-btn-compact sm:quantity-btn" onclick="componentManager.updateStock('${component.id}', 1)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="stock-indicator h-1 sm:h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1 sm:mb-2 lg:mb-3">
                <div class="h-full ${this.getStockStatusClass(component)} transition-all duration-300"
                     style="width: ${Math.min(100, (component.stock / Math.max(component.threshold * 3, 1)) * 100)}%"></div>
            </div>

            <!-- 入库和出库按钮 -->
            <div class="grid grid-cols-2 gap-1.5 mb-2">
                <button id="collectionBtn-${component.id}"
                        class="py-1 sm:py-1.5 text-xs sm:text-sm rounded-lg border-2 border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-white transition-all duration-300 flex items-center justify-center space-x-1"
                        onclick="componentManager.addToCollection('${component.id}')"
                        title="加入出库清单 (Ctrl+O)">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
                    </svg>
                    <span>出库</span>
                </button>
                <button id="inboundBtn-${component.id}"
                        class="py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border-2 border-green-400 text-green-400 hover:bg-green-400 hover:text-white transition-all duration-300 flex items-center justify-center space-x-1"
                        onclick="componentManager.addToInbound('${component.id}')"
                        title="加入入库清单 (Ctrl+I)">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                    </svg>
                    <span>入库</span>
                </button>
            </div>

            <!-- 查看详情按钮 -->
            <button class="w-full btn-primary py-1.5 sm:py-2 text-xs sm:text-sm" onclick="componentManager.editComponent('${component.id}')">
                查看详情
            </button>
        `;
    }

    // 卡片淡入动画（分块渲染完成后调用）
    initCardAnimations(grid) {
        if (!this.hasInitializedAnimations) {
            this.initAnimations();
            this.hasInitializedAnimations = true;
        } else {
            const cards = grid.querySelectorAll('.component-card');
            cards.forEach((card, index) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                setTimeout(() => {
                    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 30);
            });
        }
    }

    // 渲染分页器
    renderPagination(totalPages) {
        const paginationContainer = document.getElementById('pagination');
        if (!paginationContainer) return;

        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHTML = '<div class="flex items-center justify-center space-x-2 mt-6">';
        
        // 上一页按钮
        paginationHTML += `
            <button onclick="componentManager.goToPage(${this.currentPage - 1})"
                    class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors ${this.currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}"
                    ${this.currentPage === 1 ? 'disabled' : ''}>
                上一页
            </button>
        `;

        // 页码按钮（简化显示，最多显示5个页码）
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);

        if (startPage > 1) {
            paginationHTML += `<button onclick="componentManager.goToPage(1)" class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors">1</button>`;
            if (startPage > 2) {
                paginationHTML += `<span class="text-gray-400">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button onclick="componentManager.goToPage(${i})"
                        class="px-4 py-2 rounded-lg transition-colors ${i === this.currentPage ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}">
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += `<span class="text-gray-400">...</span>`;
            }
            paginationHTML += `<button onclick="componentManager.goToPage(${totalPages})" class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors">${totalPages}</button>`;
        }

        // 下一页按钮
        paginationHTML += `
            <button onclick="componentManager.goToPage(${this.currentPage + 1})"
                    class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors ${this.currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}"
                    ${this.currentPage === totalPages ? 'disabled' : ''}>
                下一页
            </button>
        `;

        paginationHTML += '</div>';

        // 显示分页信息
        const startIndex = (this.currentPage - 1) * this.pageSize + 1;
        const endIndex = Math.min(this.currentPage * this.pageSize, this.filteredComponents.length);
        paginationHTML += `
            <div class="text-center text-gray-400 text-sm mt-2">
                显示 ${startIndex}-${endIndex} / 共 ${this.filteredComponents.length} 个元器件
            </div>
        `;

        paginationContainer.innerHTML = paginationHTML;
    }

    // 跳转到指定页
    goToPage(page) {
        const totalPages = Math.ceil(this.filteredComponents.length / this.pageSize);
        if (page < 1 || page > totalPages) return;

        this.currentPage = page;
        this.renderComponents();
        this.updateStatistics();

        // 滚动到顶部
        const grid = document.getElementById('componentGrid');
        if (grid) {
            grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    // 获取类别名称
    getCategoryName(category) {
        const names = {
            resistor: '电阻',
            capacitor: '电容',
            inductor: '电感',
            transistor: '三极管',
            mosfet: 'MOS管',
            diode: '二极管',
            led: 'LED',
            ic: '集成电路',
            switch: '开关',
            crystal: '晶振',
            other: '其他'
        };
        if (names[category]) return names[category];
        // 自定义类别 fallback
        const custom = this.getCustomCategories().find(c => c.key === category);
        return custom ? custom.name : category;
    }

    // 获取自定义类别列表
    getCustomCategories() {
        const saved = localStorage.getItem('customCategories');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return [];
    }

    // 保存自定义类别
    saveCustomCategories(categories) {
        localStorage.setItem('customCategories', JSON.stringify(categories));
    }

    // 获取自定义分化参数定义
    getCustomParamDefinitions() {
        const saved = localStorage.getItem('customParamDefinitions');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return {};
    }

    // 保存自定义分化参数定义
    saveCustomParamDefinitions(params) {
        localStorage.setItem('customParamDefinitions', JSON.stringify(params));
    }

    // 获取分类颜色（用于侧边栏标签）
    getCategoryColor(category) {
        const colors = {
            'resistor': 'bg-blue-500/20 text-blue-400',
            'capacitor': 'bg-green-500/20 text-green-400',
            'inductor': 'bg-yellow-500/20 text-yellow-400',
            'transistor': 'bg-purple-500/20 text-purple-400',
            'diode': 'bg-red-500/20 text-red-400',
            'ic': 'bg-orange-500/20 text-orange-400',
            'switch': 'bg-cyan-500/20 text-cyan-400',
            'crystal': 'bg-pink-500/20 text-pink-400',
            'mosfet': 'bg-indigo-500/20 text-indigo-400',
            'other': 'bg-gray-500/20 text-gray-400',
        };
        if (colors[category]) return colors[category];
        // 自定义类别 — 使用紫色主题通用样式
        return 'bg-purple-500/20 text-purple-400';
    }
    
    // 获取二级分类名称
    getSubCategoryName(category, subCategory) {
        if (!subCategory) return '';
        return subCategory;
    }

    // 获取子类别配置（从 localStorage 读取，无自定义则返回默认）
    getSubCategorySettings() {
        const saved = localStorage.getItem('subCategorySettings');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('解析子类别配置失败:', e);
            }
        }
        return this.getDefaultSubCategories();
    }

    // 获取默认子类别配置
    getDefaultSubCategories() {
        return {
            resistor: ['贴片电阻', '金属膜电阻', '碳膜电阻', '线绕电阻', '电位器', 'NTC热敏电阻', '可变电阻'],
            capacitor: ['陶瓷电容', '铝电解电容', '钽电容', '薄膜电容', 'MLCC贴片电容', '可变电容', '超级电容'],
            inductor: ['功率电感', '贴片电感', '滤波电感', '射频电感', '变压器', '扼流圈', '磁环电感'],
            transistor: ['NPN三极管', 'PNP三极管', '达林顿管', '光敏三极管', '射频三极管'],
            mosfet: ['N沟道MOS', 'P沟道MOS', '双MOS', 'LDO MOS'],
            diode: ['整流二极管', '肖特基二极管', '稳压二极管', 'TVS二极管', '发光二极管', '光电二极管', '整流桥'],
            led: ['贴片LED', '直插LED', 'RGB LED', '大功率LED', '红外LED', '紫外LED', '数码管'],
            crystal: ['HC49晶振', '贴片晶振', '有源晶振', '温补晶振'],
            ic: ['单片机', '线性稳压器(LDO)', 'DC-DC电源芯片', 'LED驱动', '电池管理', '运算放大器', '逻辑门', '存储器', '接口IC'],
            switch: ['轻触开关', '拨动开关', '旋转开关', 'DIP开关', '微动开关', '船形开关'],
            other: ['连接器', '保险丝', '继电器', '传感器', '线材', 'PCB板']
        };
    }

    // 参数分化定义
    paramDefinitions = {
        resistor: [
            { id: 'p1', label: '阻值', units: ['MΩ', 'kΩ', 'Ω'], defaultUnit: 'Ω' },
            { id: 'p2', label: '额定功率', units: ['W'], defaultUnit: 'W' }
        ],
        capacitor: [
            { id: 'p1', label: '电容值', units: ['F', 'mF', 'μF', 'nF', 'pF'], defaultUnit: 'μF' },
            { id: 'p2', label: '耐压值', units: ['V'], defaultUnit: 'V' }
        ],
        inductor: [
            { id: 'p1', label: '电感量', units: ['H', 'mH', 'μH'], defaultUnit: 'μH' },
            { id: 'p2', label: '额定电流', units: ['A', 'mA'], defaultUnit: 'A' }
        ],
        mosfet: [
            { id: 'p1', label: '漏源击穿电压', units: ['V', 'mV'], defaultUnit: 'V' },
            { id: 'p2', label: '最大漏极电流', units: ['A', 'mA'], defaultUnit: 'A' }
        ],
        diode: [
            { id: 'p1', label: '最大反向重复峰值电压', units: ['V', 'mV'], defaultUnit: 'V' },
            { id: 'p2', label: '平均整流电流', units: ['A', 'mA'], defaultUnit: 'A' },
            { id: 'p3', label: '正向压降', units: ['V', 'mV'], defaultUnit: 'V' },
            { id: 'p4', label: '反向恢复时间', units: ['μs', 'ns'], defaultUnit: 'ns' }
        ],
        transistor: [
            { id: 'p1', label: '集电极-发射极击穿电压', units: ['V', 'mV'], defaultUnit: 'V' },
            { id: 'p2', label: '集电极最大允许电流', units: ['A', 'mA'], defaultUnit: 'A' }
        ],
        led: [
            { id: 'p1', label: '正向压降(Vf)', units: ['V', 'mV'], defaultUnit: 'V' },
            { id: 'p2', label: '正向电流', units: ['mA', 'A'], defaultUnit: 'mA' },
            { id: 'p3', label: '功率', units: ['W', 'mW'], defaultUnit: 'W' },
            { id: 'p4', label: '发光颜色', units: [] },
            { id: 'p5', label: '色温', units: ['K'], defaultUnit: 'K' }
        ],
        crystal: [
            { id: 'p1', label: '标称频率', units: ['MHz', 'kHz', 'Hz'], defaultUnit: 'MHz' },
            { id: 'p2', label: '负载电容', units: ['pF', 'nF', 'μF'], defaultUnit: 'pF' }
        ]
    };

    // 子类别关联的分化参数定义（仅当选中特定子类别时生效）
    subCategoryParamDefinitions = {
        ic: {
            '单片机': [
                { id: 'p1', label: '内核框架', units: [], filterable: false },
                { id: 'p2', label: 'Flash', units: ['B', 'KB', 'MB'], defaultUnit: 'KB' },
                { id: 'p3', label: 'SRAM', units: ['B', 'KB', 'MB'], defaultUnit: 'KB' },
                { id: 'p4', label: '最大主频', units: ['MHz', 'GHz'], defaultUnit: 'MHz' },
                { id: 'p5', label: '通用I/O数目', units: [], numeric: true }
            ]
        }
    };

    // 获取格式化后的参数显示文本
    getComponentValueText(component) {
        // 优先使用 params 字段
        if (component.params) {
            try {
                const params = typeof component.params === 'string' ? JSON.parse(component.params) : component.params;
                if (params && params.length > 0 && params.some(p => p.value)) {
                    return params.filter(p => p.value).map(p => p.value + (p.unit || '')).join('|');
                }
            } catch (e) {}
        }
        // 兼容旧数据：value 可能是 JSON 字符串
        if (component.value) {
            try {
                const parsed = JSON.parse(component.value);
                if (Array.isArray(parsed) && parsed.length > 0 && parsed.some(p => p.value)) {
                    return parsed.filter(p => p.value).map(p => p.value + (p.unit || '')).join('|');
                }
            } catch (e) {}
            return component.value;
        }
        return '-';
    }

    // 单位转换：将 value+fromUnit 转换为 toUnit 的数值
    convertToUnit(value, fromUnit, toUnit) {
        // 标准化单位：u→μ, ohm→Ω, 去除空格
        const normalizeUnit = (u) => {
            if (!u) return '';
            return u.trim().replace(/^u/i, 'μ').replace(/ohm/i, 'Ω').replace(/^uf$/i, 'μF').replace(/^uh$/i, 'μH');
        };
        fromUnit = normalizeUnit(fromUnit);
        toUnit = normalizeUnit(toUnit);
        const unitToBase = {
            'Ω': 1, 'kΩ': 1000, 'MΩ': 1000000,
            'F': 1, 'mF': 0.001, 'μF': 0.000001, 'nF': 0.000000001, 'pF': 0.000000000001,
            'H': 1, 'mH': 0.001, 'μH': 0.000001,
            'V': 1, 'mV': 0.001,
            'A': 1, 'mA': 0.001,
            'W': 1,
            'Hz': 1, 'kHz': 1000, 'MHz': 1000000,
            's': 1, 'ms': 0.001, 'μs': 0.000001, 'ns': 0.000000001
        };
        const baseVal = parseFloat(value) * (unitToBase[fromUnit] || 1);
        return baseVal / (unitToBase[toUnit] || 1);
    }

    // 获取有效的参数定义（优先检查子类别关联，再检查品类定义）
    getEffectiveParamDefs(category, subCategory) {
        console.log('[Defs] 查询参数定义 - category:', category, 'subCategory:', subCategory);
        if (subCategory && this.subCategoryParamDefinitions[category] && this.subCategoryParamDefinitions[category][subCategory]) {
            console.log('[Defs] 找到子类别关联定义:', this.subCategoryParamDefinitions[category][subCategory]);
            return this.subCategoryParamDefinitions[category][subCategory];
        }
        const fallback = this.paramDefinitions[category];
        if (fallback) {
            console.log('[Defs] 回退到品类定义:', fallback);
            return fallback;
        }
        // 自定义分化参数 fallback
        const customParams = this.getCustomParamDefinitions();
        const customDefs = customParams[category];
        if (customDefs) {
            console.log('[Defs] 找到自定义参数定义:', customDefs);
            return customDefs;
        }
        console.log('[Defs] 无参数定义');
        return null;
    }

    // 更新分化参数筛选字段（根据当前选中的品类）
    updateParamFilterFields() {
        const section = document.getElementById('paramFilterSection');
        const container = document.getElementById('paramFilterContainer');
        const clearBtn = document.getElementById('clearParamFilterBtn');
        if (!section || !container) return;

        // 切换品类时重置筛选状态
        this.paramFilterActive = false;

        console.log('[Filter] currentCategory:', this.currentCategory, 'currentSubCategory:', this.currentSubCategory);
        const defs = this.getEffectiveParamDefs(this.currentCategory, this.currentSubCategory);
        console.log('[Filter] 获取到 defs:', defs);
        if (!defs || defs.length === 0) {
            console.log('[Filter] 无定义，隐藏参数筛选区');
            section.classList.add('hidden');
            return;
        }

        console.log('[Filter] 显示参数筛选区，定义数:', defs.length);
        section.classList.remove('hidden');
        container.innerHTML = defs.map(def => {
            // 切换品类时重置该品类的筛选值，不保留上一品类的旧值
            if (this.paramFilters[def.id] && !this.paramFilters[def.id]._fromThisCategory) {
                delete this.paramFilters[def.id];
            }
            // 跳过不需要在筛选区显示的参数（如内核框架）
            if (def.filterable === false) return '';
            const current = this.paramFilters[def.id] || {};
            const hasUnits = def.units && def.units.length > 0;
            return `
                <div class="bg-gray-800/50 rounded-lg p-3">
                    <label class="text-xs text-gray-300 mb-2 block">${def.label}</label>
                    <div class="flex items-center gap-1 mb-1">
                        ${hasUnits || def.numeric ? `
                        <input type="number" step="any" class="param-filter-min flex-1 w-0 min-w-0 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded focus:border-blue-400 focus:outline-none text-white" 
                               data-param-id="${def.id}" placeholder="最小值" value="">
                        <span class="text-gray-500 text-xs">~</span>
                        <input type="number" step="any" class="param-filter-max flex-1 w-0 min-w-0 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded focus:border-blue-400 focus:outline-none text-white" 
                               data-param-id="${def.id}" placeholder="最大值" value="">
                        ${hasUnits ? `
                        <select class="param-filter-unit px-1 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white" data-param-id="${def.id}">
                            ${def.units.map(u => `<option value="${u}" ${u === def.defaultUnit ? 'selected' : ''}>${u}</option>`).join('')}
                        </select>
                        ` : ''}
                        ` : `<span class="text-xs text-gray-500">无数值筛选</span>`}
                    </div>
                </div>
            `;
        }).filter(html => html !== '').join('');

        // 绑定事件
        const self = this;
        container.querySelectorAll('.param-filter-min, .param-filter-max, .param-filter-unit').forEach(el => {
            el.addEventListener('input', function() {
                self.collectParamFilters();
                self.filterAndRender();
            });
            el.addEventListener('change', function() {
                self.collectParamFilters();
                self.filterAndRender();
            });
        });

        // 显示清除按钮（如果有筛选条件）
        const hasFilter = Object.values(this.paramFilters).some(f => f.min || f.max);
        clearBtn.classList.toggle('hidden', !hasFilter);
    }

    // 收集参数筛选条件
    collectParamFilters() {
        this.paramFilters = {};
        document.querySelectorAll('.param-filter-min, .param-filter-max, .param-filter-unit').forEach(el => {
            const id = el.dataset.paramId;
            if (!this.paramFilters[id]) this.paramFilters[id] = {};
            if (el.classList.contains('param-filter-min')) this.paramFilters[id].min = el.value;
            if (el.classList.contains('param-filter-max')) this.paramFilters[id].max = el.value;
            if (el.classList.contains('param-filter-unit')) this.paramFilters[id].unit = el.value;
            this.paramFilters[id]._fromThisCategory = true;
        });
        this.paramFilterActive = Object.values(this.paramFilters).some(f => f.min || f.max);
    }

    // 检查元器件是否通过参数筛选
    checkParamFilter(component) {
        if (!this.paramFilterActive) return true;

        const defs = this.getEffectiveParamDefs(component.category, component.subCategory);
        if (!defs) return true;

        let params = null;
        if (component.params) {
            try {
                params = typeof component.params === 'string' ? JSON.parse(component.params) : component.params;
            } catch(e) { return true; }
        }

        // 兼容旧格式：如果 params 不存在但 value 存在，尝试从 value 中提取数值和单位
        if (!params && component.value) {
            const match = component.value.match(/^([\d.]+)\s*(.*)$/);
            if (match) {
                const oldVal = match[1];
                const oldUnit = match[2];
                // 对第一个参数定义进行筛选（旧格式只有一个值）
                const def = defs[0];
                if (def) {
                    const filter = this.paramFilters[def.id];
                    if (filter && (filter.min || filter.max)) {
                        const filterUnit = filter.unit || def.defaultUnit;
                        const compValue = this.convertToUnit(oldVal, oldUnit, filterUnit);
                        if (filter.min && compValue < parseFloat(filter.min)) return false;
                        if (filter.max && compValue > parseFloat(filter.max)) return false;
                    }
                }
            }
            return true;
        }

        if (!params) return true;

        // 对每个定义的参数字段，检查是否有筛选条件
        for (const def of defs) {
            const filter = this.paramFilters[def.id];
            if (!filter || (!filter.min && !filter.max)) continue;

            // 无单位的参数（如发光颜色）不做数值筛选（除非标记了 numeric: true）
            if ((!def.units || def.units.length === 0) && !def.numeric) continue;

            // 找到元器件中该参数的值（兼容旧数据：有的存 id，有的存 label）
            const param = params.find(p => p.id === def.id) || params.find(p => p.label === def.label) || params[defs.indexOf(def)];
            if (!param || !param.value) return false; // 有筛选条件但元器件无此参数，不符合

            let compValue;
            if (def.numeric) {
                // 无单位的数值参数（如通用I/O数目），直接比较数字
                compValue = parseFloat(param.value);
            } else {
                const filterUnit = filter.unit || def.defaultUnit;
                compValue = this.convertToUnit(param.value, param.unit, filterUnit);
            }

            if (filter.min && compValue < parseFloat(filter.min)) return false;
            if (filter.max && compValue > parseFloat(filter.max)) return false;
        }

        return true;
    }

    // 渲染参数输入字段
    renderParamFields(containerId, category, paramsJson, subCategory) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 子类别关联定义优先
        let defs = null;
        if (subCategory && this.subCategoryParamDefinitions[category] && this.subCategoryParamDefinitions[category][subCategory]) {
            defs = this.subCategoryParamDefinitions[category][subCategory];
        }
        if (!defs) {
            defs = this.paramDefinitions[category];
        }
        // 兼容处理：paramsJson 可能是字符串或对象
        let params = null;
        if (paramsJson) {
            try {
                params = typeof paramsJson === 'string' ? JSON.parse(paramsJson) : paramsJson;
            } catch(e) { params = null; }
        }

        if (!defs) {
            // 无分化定义的分类，显示原有单参数输入
            const val = params && params.length > 0 ? params[0].value : '';
            container.innerHTML = '<div><label class="block text-sm font-medium text-gray-300 mb-2">参数值</label>' +
                '<input type="text" id="componentValue" value="' + val + '" class="w-full px-4 py-3 text-white bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="例如: 10kΩ">' +
                '</div>';
            return;
        }

        let html = '<div class="space-y-3">';
        defs.forEach((def, idx) => {
            const val = params && params[idx] ? params[idx].value : '';
            const unit = params && params[idx] ? params[idx].unit : def.defaultUnit;
            
            html += '<div>' +
                '<label class="block text-sm font-medium text-gray-300 mb-2">' + def.label + '</label>' +
                '<div class="flex space-x-2">' +
                '<input type="text" id="param-' + def.id + '" value="' + val + '" class="flex-1 px-4 py-3 text-white bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="输入' + def.label + '">';
            
            if (def.units && def.units.length > 0) {
                html += '<select id="param-unit-' + def.id + '" class="w-24 px-3 py-3 text-white bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">';
                def.units.forEach(u => {
                    html += '<option value="' + u + '"' + (u === unit ? ' selected' : '') + '>' + u + '</option>';
                });
                html += '</select>';
            }
            
            html += '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    // 收集分化参数值
    collectParams(category, subCategory, inputId) {
        let defs = null;
        if (subCategory && this.subCategoryParamDefinitions[category] && this.subCategoryParamDefinitions[category][subCategory]) {
            defs = this.subCategoryParamDefinitions[category][subCategory];
        }
        if (!defs) {
            defs = this.paramDefinitions[category];
        }
        if (!defs) {
            const id = inputId || 'componentValue';
            const val = document.getElementById(id);
            return val && val.value ? val.value : '';
        }

        const params = defs.map(def => {
            const value = document.getElementById('param-' + def.id)?.value || '';
            const unitEl = document.getElementById('param-unit-' + def.id);
            const unit = unitEl ? (unitEl.value || def.defaultUnit) : '';
            return { id: def.id, label: def.label, value, unit };
        });

        return JSON.stringify(params);
    }

    getSubCategories(category) {
        // 从 localStorage 读取用户配置
        const saved = localStorage.getItem('subCategorySettings');
        let settings = null;
        if (saved) {
            try {
                settings = JSON.parse(saved);
            } catch (e) {}
        }
        
        // 默认配置
        const defaults = {
            resistor: ['贴片电阻', '金属膜电阻', '碳膜电阻', '线绕电阻', '电位器', 'NTC热敏电阻', '可变电阻'],
            capacitor: ['陶瓷电容', '铝电解电容', '钽电容', '薄膜电容', 'MLCC贴片电容', '可变电容', '超级电容'],
            inductor: ['功率电感', '贴片电感', '滤波电感', '射频电感', '变压器', '扼流圈', '磁环电感'],
            transistor: ['NPN三极管', 'PNP三极管', '达林顿管', '光敏三极管', '射频三极管'],
            mosfet: ['N沟道MOS', 'P沟道MOS', '双MOS', 'LDO MOS'],
            diode: ['整流二极管', '肖特基二极管', '稳压二极管', 'TVS二极管', '发光二极管', '光电二极管', '整流桥'],
            led: ['贴片LED', '直插LED', 'RGB LED', '大功率LED', '红外LED', '紫外LED', '数码管'],
            ic: ['单片机', '线性稳压器(LDO)', 'DC-DC电源芯片', 'LED驱动', '电池管理', '运算放大器', '逻辑门', '存储器', '接口IC'],
            switch: ['轻触开关', '拨动开关', '旋转开关', 'DIP开关', '微动开关', '船形开关'],
            crystal: ['HC49晶振', '贴片晶振', '有源晶振', '温补晶振'],
            other: ['连接器', '保险丝', '继电器', '传感器', '线材', 'PCB板']
        };
        
        // 使用用户配置或默认配置
        const items = (settings && settings[category]) ? settings[category] : (defaults[category] || []);
        
        // 转换为 { value, label } 格式（value 使用名称本身）
        return items.map(name => ({ value: name, label: name }));
    }

    // 更新子类别下拉选项
    updateSubCategoryOptions(categorySelectId, subCategorySelectId) {
        const category = document.getElementById(categorySelectId).value;
        const subSelect = document.getElementById(subCategorySelectId);
        if (!subSelect) return;
        
        const subCategories = this.getSubCategories(category);
        subSelect.innerHTML = '<option value="">' + (category ? '选择子类别' : '请先选择类别') + '</option>';
        subCategories.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            subSelect.appendChild(option);
        });
    }
    updateStatistics() {
        // 使用 filterAndRender 的筛选结果，确保统计与显示一致
        let statsComponents = this.filteredComponents || this.components;

        const totalComponents = statsComponents.length;
        const lowStockCount = statsComponents.filter(c => c.stock <= c.threshold && c.stock > 0).length;
        const outOfStockCount = statsComponents.filter(c => c.stock === 0).length;
        const totalValue = statsComponents.reduce((sum, c) => {
            const val = (c.stock || 0) * this.getComponentValue(c);
            return sum + (isFinite(val) ? val : 0);
        }, 0);

        document.getElementById('totalComponents').textContent = totalComponents;
        document.getElementById('lowStockCount').textContent = lowStockCount;
        document.getElementById('outOfStockCount').textContent = outOfStockCount;
        document.getElementById('totalValue').textContent = `¥${isFinite(totalValue) ? totalValue.toFixed(4) : '0.0000'}`;

        // 更新侧边栏分类计数（基于全部元器件，不受当前筛选条件影响）
        const allComponentCount = this.components.length;
        const categoryCounts = this.components.reduce((acc, component) => {
            acc[component.category] = (acc[component.category] || 0) + 1;
            return acc;
        }, {});

        document.getElementById('count-all').textContent = allComponentCount;
        // 遍历所有已知分类，确保数量为 0 的分类也能更新为 0
        const allCategories = ['resistor', 'capacitor', 'inductor', 'transistor', 'mosfet', 'diode', 'led', 'ic', 'switch', 'crystal', 'other'];
        allCategories.forEach(category => {
            const element = document.getElementById(`count-${category}`);
            if (element) {
                element.textContent = categoryCounts[category] || 0;
            }
        });
        // 自定义类别计数
        this.getCustomCategories().forEach(cat => {
            const element = document.getElementById(`count-${cat.key}`);
            if (element) {
                element.textContent = categoryCounts[cat.key] || 0;
            }
        });
    }

    // 从顶部统计卡片切换库存筛选（单选模式）
    toggleStockFilterFromCard(status) {
        // 如果当前已经激活了这个状态，取消筛选
        if (this._activeStockCard === status) {
            this._activeStockCard = null;
            // 恢复checkbox全部勾选
            document.querySelectorAll('.stock-filter').forEach(cb => cb.checked = true);
            this.currentStockFilters = ['full', 'warning', 'empty'];
        } else {
            // 切换到新状态
            this._activeStockCard = status;
            // 更新checkbox状态：只勾选当前状态
            document.querySelectorAll('.stock-filter').forEach(cb => {
                cb.checked = (cb.dataset.status === status);
            });
            this.currentStockFilters = [status];
        }
        this.bomFilteredComponentIds = null;
        this.currentPage = 1;
        this.filterAndRender();
        this.updateStockCardVisuals();
    }

    // 更新顶部库存筛选卡片的视觉高亮
    updateStockCardVisuals() {
        const warningCard = document.getElementById('lowStockCard');
        const emptyCard = document.getElementById('outOfStockCard');
        const active = this._activeStockCard;

        // 清除所有高亮
        if (warningCard) {
            warningCard.classList.remove('border-yellow-500', 'ring-1', 'ring-yellow-500/50', 'bg-yellow-900/20');
            warningCard.classList.add('border-gray-700/50');
        }
        if (emptyCard) {
            emptyCard.classList.remove('border-red-500', 'ring-1', 'ring-red-500/50', 'bg-red-900/20');
            emptyCard.classList.add('border-gray-700/50');
        }

        // 高亮当前激活的卡片
        if (active === 'warning' && warningCard) {
            warningCard.classList.remove('border-gray-700/50');
            warningCard.classList.add('border-yellow-500', 'ring-1', 'ring-yellow-500/50', 'bg-yellow-900/20');
        }
        if (active === 'empty' && emptyCard) {
            emptyCard.classList.remove('border-gray-700/50');
            emptyCard.classList.add('border-red-500', 'ring-1', 'ring-red-500/50', 'bg-red-900/20');
        }
    }

    // 获取元器件单价（用于统计总库存价值）
    getComponentValue(component) {
        return component.price || 0;
    }
    
    // 数据持久化
    saveData() {
        try {
            // 保存前按位置编号排序（拷贝数组避免修改原引用）
            const sorted = [...this.components].sort((a, b) => this.compareLocationNumbers(a.location, b.location));
            localStorage.setItem('electronicComponents', JSON.stringify(sorted));
            // 异步同步到服务端文件（若后端运行）
            this.syncToServer();
        } catch (error) {
            console.error('保存数据失败:', error);
            this.showNotification('数据保存失败，可能是存储空间不足', 'error');
        }
    }

    /**
     * 同步数据到服务端文件
     */
    syncToServer() {
        try {
            // 文件协议下使用绝对URL，http协议下使用相对URL
            const base = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';
            const url = base + '/api/data/components';
            console.log('[Server] 同步数据到:', url);
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ components: this.components })
            }).then(resp => {
                if (resp.ok) {
                    console.log('[Server] 同步成功 ✓');
                } else {
                    console.warn('[Server] 同步失败:', resp.status, resp.statusText);
                }
            }).catch(err => {
                console.warn('[Server] 请求失败:', err.message);
            });
        } catch (e) {
            console.warn('[Server] 同步异常:', e.message);
        }
    }

    /**
     * 同步设置到服务端文件（localStorage 已先写入）
     */
    syncSettingsToServer() {
        try {
            const allSettings = {};
            ['systemSettings', 'subCategorySettings', 'locationPrefixConfig',
             'categoryOrder', 'lastSelectedCategory', 'sampleDataLoaded',
             'customCategories', 'customParamDefinitions'].forEach(key => {
                const val = localStorage.getItem(key);
                if (val) {
                    try { allSettings[key] = JSON.parse(val); }
                    catch (e) { console.warn('Settings key ' + key + ' 数据损坏, 跳过'); }
                }
            });
            if (Object.keys(allSettings).length === 0) return;
            const base = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';
            fetch(base + '/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(allSettings)
            }).then(resp => {
                if (!resp.ok) {
                    console.warn('[Settings] 同步到服务端失败:', resp.status);
                }
            }).catch(err => {
                console.warn('[Settings] 服务端未运行，同步已跳过');
            });
        } catch (e) {
            // 忽略
        }
    }

    /**
     * 从服务端文件加载设置（可选回填）
     */
    async loadSettingsFromServer() {
        try {
            const resp = await fetch('/api/settings');
            if (!resp.ok) return;
            const result = await resp.json();
            if (!result.success || !result.settings) return;
            const serverSettings = result.settings;
            // 仅当 localStorage 中某 key 为空时，从服务端回填
            for (const [key, val] of Object.entries(serverSettings)) {
                if (!localStorage.getItem(key)) {
                    localStorage.setItem(key, JSON.stringify(val));
                    console.log('[Settings] 从服务端回填:', key);
                }
            }
        } catch (e) {
            console.log('[Settings] 服务端未运行，跳过服务端加载');
        }
    }

    /**
     * 尝试从服务端文件加载数据（异步）
     * 仅当 localStorage 为空时才从文件加载（首次访问），
     * 避免删除/修改数据后刷新又被旧文件数据覆盖
     */
    async tryLoadFromServer() {
        try {
            // localStorage 已有数据时，不覆盖（本地可能更新）
            const localData = localStorage.getItem('electronicComponents');
            if (localData && JSON.parse(localData).length > 0) {
                console.log('[Server] 本地已有数据，跳过服务端加载');
                return;
            }

            const resp = await fetch('/api/data/components');
            if (!resp.ok) return;
            const result = await resp.json();
            if (result.success && Array.isArray(result.components) && result.components.length > 0) {
                this.components = result.components;
                localStorage.setItem('electronicComponents', JSON.stringify(this.components));
                console.log('[Server] 从服务端文件加载了', this.components.length, '个元器件');
            }
        } catch (e) {
            console.log('[Server] 服务端未运行，使用本地数据');
        }
    }

    loadData() {
        try {
            const data = localStorage.getItem('electronicComponents');
            if (data) {
                const parsed = JSON.parse(data);
                this.components = Array.isArray(parsed) ? parsed : [];
                console.log('加载了', this.components.length, '个元器件');
                console.log('排序前:', this.components.map(c => c.location).join(', '));
            }
        } catch (error) {
            console.error('加载数据失败:', error);
            this.components = [];
        }
        
        // 加载后立即按位置编号排序
        this.components.sort((a, b) => this.compareLocationNumbers(a.location, b.location));
        console.log('排序后:', this.components.map(c => c.location).join(', '));
        
        // 重新保存以确保顺序正确
        try {
            localStorage.setItem('electronicComponents', JSON.stringify(this.components));
            console.log('已重新保存排序后的数据');
        } catch (error) {
            console.error('保存数据失败:', error);
        }
        
        this.filteredComponents = [...this.components];
    }

    // 加载系统设置
    loadSettings() {
        const defaultSettings = {
            stockAlert: true,
            lazyLoad: true,
            exportMode: 'api',
            defaultThreshold: 10,
            magnifierZoom: 3
        };

        try {
            const saved = localStorage.getItem('systemSettings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch (error) {
            console.error('加载设置失败:', error);
            return defaultSettings;
        }
    }

    // ============ 撤回功能 ============

    // 保存操作到历史栈
    pushHistory(action, data) {
        const historyItem = {
            action: action,
            data: data,
            timestamp: new Date().toISOString()
        };

        this.historyStack.push(historyItem);

        // 限制历史栈大小
        if (this.historyStack.length > this.maxHistorySize) {
            this.historyStack.shift();
        }

        // 保存历史栈到 localStorage
        localStorage.setItem('undoHistory', JSON.stringify(this.historyStack));
        this.syncSettingsToServer();
    }

    // 加载历史栈
    loadHistory() {
        try {
            const historyData = localStorage.getItem('undoHistory');
            if (historyData) {
                this.historyStack = JSON.parse(historyData);
            }
        } catch (e) {
            console.warn('历史栈数据损坏，已重置:', e);
            this.historyStack = [];
        }
    }

    // 执行撤回
    undo() {
        if (this.historyStack.length === 0) {
            this.showNotification('没有可撤回的操作', 'info');
            return;
        }

        const historyItem = this.historyStack.pop();
        const { action, data } = historyItem;

        // 保存当前历史栈
        localStorage.setItem('undoHistory', JSON.stringify(this.historyStack));

        try {
            switch (action) {
                case 'addComponent':
                    this.undoAddComponent(data);
                    break;
                case 'deleteComponent':
                    this.undoDeleteComponent(data);
                    break;
                case 'editComponent':
                    this.undoEditComponent(data);
                    break;
                case 'updateStock':
                    this.undoUpdateStock(data);
                    break;
                case 'batchCheckout':
                    this.undoBatchCheckout(data);
                    break;
                case 'batchInbound':
                    this.undoBatchInbound(data);
                    break;
                case 'importData':
                    this.undoImportData(data);
                    break;
                case 'bulkEdit':
                    this.undoBulkEdit(data);
                    break;
                case 'bulkDelete':
                    this.undoBulkDelete(data);
                    break;
                default:
                    this.showNotification('无法撤回此操作', 'error');
            }
        } catch (error) {
            console.error('撤回操作失败:', error);
            this.showNotification('撤回操作失败', 'error');
        }
    }

    // 撤回添加元器件
    undoAddComponent(data) {
        this.components = this.components.filter(c => c.id !== data.componentId);
        this.saveData();
        this.filterAndRender();
        this.updateStatistics();
        this.showNotification('已撤回添加元器件操作', 'success');
    }

    // 撤回删除元器件
    undoDeleteComponent(data) {
        this.components.push(data.component);
        this.saveData();
        this.filterAndRender();
        this.updateStatistics();
        this.showNotification('已撤回删除元器件操作', 'success');
    }

    // 撤回编辑元器件
    undoEditComponent(data) {
        const index = this.components.findIndex(c => c.id === data.componentId);
        if (index !== -1) {
            this.components[index] = data.oldComponent;
            this.saveData();
            this.filterAndRender();
            this.updateStatistics();
            this.showNotification('已撤回编辑操作', 'success');
        }
    }

    // 撤回更新库存
    undoUpdateStock(data) {
        const component = this.components.find(c => c.id === data.componentId);
        if (component) {
            component.stock = data.oldStock;
            component.updatedAt = data.oldUpdatedAt;
            this.saveData();
            this.filterAndRender();
            this.updateStatistics();
            this.showNotification('已撤回库存更新', 'success');
        }
    }

    // 撤回批量出库
    undoBatchCheckout(data) {
        data.items.forEach(item => {
            const component = this.components.find(c => c.id === item.componentId);
            if (component) {
                component.stock += item.quantity;
            }
        });
        this.saveData();
        this.filterAndRender();
        this.updateStatistics();
        this.showNotification('已撤回批量出库操作', 'success');
    }

    // 撤回批量入库
    undoBatchInbound(data) {
        data.items.forEach(item => {
            const component = this.components.find(c => c.id === item.componentId);
            if (component) {
                component.stock = Math.max(0, component.stock - item.quantity);
            }
        });
        this.saveData();
        this.filterAndRender();
        this.updateStatistics();
        this.showNotification('已撤回批量入库操作', 'success');
    }

    // ============ 批量编辑功能 ============

    // 显示批量编辑模态框
    showBulkEditModal() {
        // 从 localStorage 加载元器件数据
        this.bulkEditComponentsList = [...this.components];
        this.selectedBulkEditIds = new Set();

        // 重置表单
        document.getElementById('bulkEditSearch').value = '';
        document.getElementById('bulkEditCategory').value = '';
        document.getElementById('bulkEditSelectAll').checked = false;
        document.getElementById('bulkEditModel').value = '';
        document.getElementById('bulkEditProductCode').value = '';
        document.getElementById('bulkEditValue').value = '';
        document.getElementById('bulkEditLocation').value = '';
        document.getElementById('bulkEditThreshold').value = '';
        document.getElementById('bulkEditNotes').value = '';
        document.getElementById('bulkEditImage').value = '';
        document.getElementById('bulkEditDatasheet').value = '';
        document.getElementById('bulkEditSubCategory').value = '';
        document.getElementById('bulkEditParamFields').classList.add('hidden');

        // 更新子类别选项和参数字段
        this.updateBulkEditSubCategoryOptions();
        this.updateBulkEditParamFields();

        // 渲染元器件列表
        this.renderBulkEditComponentList();
        this.updateBulkEditSelectedCount();

        // 显示模态框
        document.getElementById('bulkEditModal').classList.remove('hidden');
    }

    // 隐藏批量编辑模态框
    hideBulkEditModal() {
        document.getElementById('bulkEditModal').classList.add('hidden');
        this.bulkEditComponentsList = [];
        this.selectedBulkEditIds = new Set();
    }

    // 渲染批量编辑元器件列表
    renderBulkEditComponentList() {
        const container = document.getElementById('bulkEditComponentList');
        const search = document.getElementById('bulkEditSearch').value.toLowerCase();
        const category = document.getElementById('bulkEditCategory').value;

        let filtered = this.bulkEditComponentsList.filter(comp => {
            const matchSearch = !search || 
                comp.name.toLowerCase().includes(search) || 
                comp.model.toLowerCase().includes(search);
            const matchCategory = !category || comp.category === category;
            return matchSearch && matchCategory;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    没有找到匹配的元器件
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(comp => `
            <div class="flex items-center p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors ${this.selectedBulkEditIds.has(comp.id) ? 'ring-2 ring-blue-500' : ''}"
                 data-component-id="${comp.id}">
                <input type="checkbox" 
                       class="w-4 h-4 mr-3 bulk-edit-checkbox"
                       data-component-id="${comp.id}"
                       ${this.selectedBulkEditIds.has(comp.id) ? 'checked' : ''}
                       onchange="document.getElementById('bulkEditSelectAll').checked = false">
                <div class="flex-1">
                    <div class="text-white font-medium">${this.escapeHtml(comp.name)}</div>
                    <div class="text-sm text-gray-400">${this.escapeHtml(comp.model)} | ${this.escapeHtml(comp.value)} | 库存: ${comp.stock}</div>
                </div>
                <div class="text-xs bg-gray-600 px-2 py-1 rounded-full mr-2">${this.escapeHtml(this.getCategoryName(comp.category))}</div>
                <div class="text-xs text-gray-500">${this.escapeHtml(comp.location) || '未设置'}</div>
            </div>
        `).join('');

        // 绑定复选框事件
        container.querySelectorAll('.bulk-edit-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const componentId = e.target.dataset.componentId;
                if (e.target.checked) {
                    this.selectedBulkEditIds.add(componentId);
                } else {
                    this.selectedBulkEditIds.delete(componentId);
                }
                this.updateBulkEditSelectedCount();
            });
        });

        this.updateBulkEditSelectedCount();
    }

    // 切换全选（选中所有元器件，不受筛选条件影响）
    toggleSelectAllBulkEdit(checked) {
        this.bulkEditComponentsList.forEach(comp => {
            if (checked) {
                this.selectedBulkEditIds.add(comp.id);
            } else {
                this.selectedBulkEditIds.delete(comp.id);
            }
        });
        // 更新界面复选框状态
        const checkboxes = document.querySelectorAll('#bulkEditComponentList input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
        this.updateBulkEditSelectedCount();
    }

    // 清空批量编辑选择
    clearBulkEditSelection() {
        this.selectedBulkEditIds = new Set();
        document.getElementById('bulkEditSelectAll').checked = false;
        this.renderBulkEditComponentList();
        this.updateBulkEditSelectedCount();
    }

    // 更新批量编辑子类别选项
    updateBulkEditSubCategoryOptions() {
        const category = document.getElementById('bulkEditCategory').value;
        const select = document.getElementById('bulkEditSubCategory');
        select.innerHTML = '<option value="">保持不变</option>';
        if (!category) return;
        const subCats = this.getSubCategorySettings()[category] || [];
        subCats.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    }

    // 更新批量编辑分化参数字段
    updateBulkEditParamFields() {
        const category = document.getElementById('bulkEditCategory').value;
        const container = document.getElementById('bulkEditParamFields');
        const fieldsContainer = document.getElementById('bulkEditParamFieldsContainer');
        // 批量编辑：优先用品类定义，若没有则尝试子类别关联定义
        let defs = this.paramDefinitions[category];
        if (!defs || defs.length === 0) {
            const subDefs = this.subCategoryParamDefinitions[category];
            if (subDefs) {
                // 取第一个子类别的定义作为批量编辑的代表
                const firstKey = Object.keys(subDefs)[0];
                defs = subDefs[firstKey];
            }
        }
        
        if (defs && defs.length > 0) {
            container.classList.remove('hidden');
            fieldsContainer.innerHTML = defs.map(def => {
                const hasUnits = def.units && def.units.length > 0;
                return `
                <div>
                    <label class="block text-sm font-medium text-gray-300 mb-2">${def.label}</label>
                    <div class="flex space-x-2">
                        <input type="text" id="bulkEditParam-${def.id}" 
                               class="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:border-blue-400 focus:outline-none" 
                               placeholder="保持不变">
                        ${hasUnits ? `
                        <select id="bulkEditParam-unit-${def.id}" 
                                class="w-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:border-blue-400 focus:outline-none">
                            <option value="">不变</option>
                            ${def.units.map(u => `<option value="${u}" ${u === def.defaultUnit ? '' : ''}>${u}</option>`).join('')}
                        </select>
                        ` : ''}
                    </div>
                </div>
            `}).join('');
        } else {
            container.classList.add('hidden');
        }
    }

    // 更新批量编辑选择计数
    updateBulkEditSelectedCount() {
        document.getElementById('bulkEditSelectedCount').textContent = `已选择 ${this.selectedBulkEditIds.size} 个元器件`;
    }

    // 批量编辑元器件
    bulkEditComponents() {
        if (this.selectedBulkEditIds.size === 0) {
            this.showNotification('请至少选择一个元器件', 'error');
            return;
        }

        // 获取子类别修改
        const subCategory = document.getElementById('bulkEditSubCategory').value;

        // 获取分化参数修改
        const category = document.getElementById('bulkEditCategory').value;
        let paramsUpdate = null;
        // 批量编辑：优先用品类定义，若没有则尝试子类别关联定义
        let defs = this.paramDefinitions[category];
        if (!defs || defs.length === 0) {
            const subDefs = this.subCategoryParamDefinitions[category];
            if (subDefs) {
                const firstKey = Object.keys(subDefs)[0];
                defs = subDefs[firstKey];
            }
        }
        if (defs && defs.length > 0) {
            const paramVals = [];
            let hasParamValue = false;
            defs.forEach(def => {
                const v = document.getElementById('bulkEditParam-' + def.id);
                const u = document.getElementById('bulkEditParam-unit-' + def.id);
                if (v && v.value) {
                    hasParamValue = true;
                    const unit = u && u.value !== '' ? u.value : def.defaultUnit;
                    paramVals.push({ id: def.id, label: def.label, value: v.value, unit: unit });
                }
            });
            if (hasParamValue) {
                paramsUpdate = paramVals;
            }
        }

        // 获取要修改的字段
        const updates = {
            model: document.getElementById('bulkEditModel').value.trim(),
            productCode: document.getElementById('bulkEditProductCode').value.trim(),
            value: document.getElementById('bulkEditValue').value.trim(),
            location: document.getElementById('bulkEditLocation').value.trim(),
            threshold: document.getElementById('bulkEditThreshold').value,
            notes: document.getElementById('bulkEditNotes').value.trim(),
            image: document.getElementById('bulkEditImage').value.trim(),
            datasheet: document.getElementById('bulkEditDatasheet').value.trim()
        };

        // 检查是否有字段要修改
        const hasUpdates = Object.values(updates).some(val => val !== '') || subCategory !== '' || paramsUpdate !== null;
        if (!hasUpdates) {
            this.showNotification('请至少填写一个要修改的字段', 'error');
            return;
        }

        // 保存历史记录（在修改之前保存旧数据）
        const oldComponents = JSON.parse(JSON.stringify(this.components));
        let updateCount = 0;

        // 更新选中的元器件
        this.components.forEach(comp => {
            if (this.selectedBulkEditIds.has(comp.id)) {
                if (updates.model) comp.model = updates.model;
                if (updates.productCode) comp.productCode = updates.productCode;
                if (updates.value) comp.value = updates.value;
                if (updates.location) comp.location = updates.location;
                if (updates.threshold) comp.threshold = parseInt(updates.threshold);
                if (updates.notes) comp.notes = updates.notes;
                if (updates.image) comp.image = updates.image;
                if (updates.datasheet) comp.datasheet = updates.datasheet;
                // 批量更新子类别
                if (subCategory !== '') {
                    comp.subCategory = subCategory;
                }
                // 批量更新分化参数
                if (paramsUpdate !== null) {
                    const paramPairs = {};
                    paramsUpdate.forEach(p => { paramPairs[p.id] = p.value + (p.unit || ''); });
                    // 合并已有参数和新参数
                    let existingParams = [];
                    try {
                        if (comp.params) existingParams = JSON.parse(comp.params);
                    } catch(e) {}
                    const mergedParams = {};
                    existingParams.forEach(p => { mergedParams[p.id] = p.value + (p.unit || ''); });
                    Object.assign(mergedParams, paramPairs);
                    // 重建 params 数组（保留旧参数中未被更新的）
                    const newParams = Object.entries(mergedParams).map(([id, vu]) => {
                        for (const p of paramsUpdate) {
                            if (p.id === id) return { id, label: p.label || '', value: p.value, unit: p.unit };
                        }
                        for (const ep of existingParams) {
                            if (ep.id === id) return ep;
                        }
                        return { id, value: vu.replace(/[A-Za-zμnρ]+$/, ''), unit: vu.replace(/^[\d.]+/, '') };
                    });
                    comp.params = JSON.stringify(newParams);
                    // 同步更新 value 字段（使用 params 的格式化值）
                    comp.value = newParams.map(p => p.value + (p.unit || '')).join('|');
                }

                comp.updatedAt = new Date().toISOString();
                updateCount++;
            }
        });
        this.pushHistory('bulkEdit', {
            oldComponents: oldComponents,
            updatedCount: updateCount
        });

        // 保存到 localStorage
        this.saveData();

        // 刷新显示
        this.filterAndRender();
        this.updateStatistics();

        // 显示成功消息
        this.showNotification(`成功修改 ${updateCount} 个元器件！（按 Ctrl+Z 可撤回）`, 'success');

        // 关闭模态框
        this.hideBulkEditModal();
    }

    // 批量删除元器件
    bulkDeleteComponents() {
        if (this.selectedBulkEditIds.size === 0) {
            this.showNotification('请至少选择一个元器件', 'error');
            return;
        }

        // 确认删除
        if (!confirm(`确定要删除选中的 ${this.selectedBulkEditIds.size} 个元器件吗？此操作不可恢复！`)) {
            return;
        }

        // 保存历史记录（在删除之前保存旧数据）
        const oldComponents = JSON.parse(JSON.stringify(this.components));
        const deletedComponents = [];

        // 删除选中的元器件
        this.components = this.components.filter(comp => {
            if (this.selectedBulkEditIds.has(comp.id)) {
                deletedComponents.push(comp);
                return false;
            }
            return true;
        });

        // 保存到历史栈
        this.pushHistory('bulkDelete', {
            oldComponents: oldComponents,
            deletedComponents: deletedComponents,
            deletedCount: deletedComponents.length
        });

        // 保存到 localStorage
        this.saveData();

        // 刷新显示
        this.filterAndRender();
        this.updateStatistics();

        // 显示成功消息
        this.showNotification(`成功删除 ${deletedComponents.length} 个元器件！（按 Ctrl+Z 可撤回）`, 'success');

        // 关闭模态框
        this.hideBulkEditModal();
    }

    // 撤回导入数据
    undoImportData(data) {
        // 恢复到导入前的状态
        this.components = data.oldComponents;
        this.saveData();
        this.filterAndRender();
        this.updateStatistics();
        this.showNotification(`已撤回导入操作，移除了 ${data.importedCount} 个元器件`, 'success');
    }

    // 撤回批量编辑
    undoBulkEdit(data) {
        // 恢复到批量编辑前的状态
        this.components = data.oldComponents;
        this.saveData();
        this.filterAndRender();
        this.updateStatistics();
        this.showNotification(`已撤回批量编辑操作，恢复 ${data.updatedCount} 个元器件`, 'success');
    }

    // 撤回批量删除
    undoBulkDelete(data) {
        // 恢复被删除的元器件
        this.components = data.oldComponents;
        this.saveData();
        this.filterAndRender();
        this.updateStatistics();
        this.showNotification(`已撤回批量删除操作，恢复 ${data.deletedCount} 个元器件`, 'success');
    }

    // 数据导入导出
    async exportData() {
        const data = {
            components: this.components,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        const content = JSON.stringify(data, null, 2);
        const defaultFileName = `electronic-components-${new Date().toISOString().split('T')[0]}.json`;

        // 根据用户设置选择导出方式
        if (this.settings.exportMode === 'api' && 'showSaveFilePicker' in window) {
            // 使用 File System Access API（Chrome/Edge 支持）
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: defaultFileName,
                    types: [{
                        description: 'JSON 文件',
                        accept: {
                            'application/json': ['.json'],
                        },
                    }],
                });

                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();

                this.showNotification(`数据导出成功！已保存到：${fileHandle.name}`, 'success');
                return;
            } catch (error) {
                // 用户取消了保存操作
                if (error.name === 'AbortError') {
                    this.showNotification('已取消导出', 'info');
                    return;
                }
                // 其他错误，降级到传统下载方式
                console.warn('File System Access API 失败，使用降级方案：', error);
            }
        }

        // 传统下载方式
        try {
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showNotification('数据导出成功！文件已保存到浏览器的默认下载目录', 'success');
        } catch (error) {
            this.showNotification('导出失败：' + error.message, 'error');
        }
    }
    
    importData(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.components && Array.isArray(data.components)) {
                    // 保存导入前的状态到撤回历史栈
                    const oldComponents = [...this.components];
                    this.pushHistory('importData', {
                        oldComponents: oldComponents,
                        importedCount: data.components.length
                    });

                    // 为导入的数据生成新ID
                    const importedComponents = data.components.map(comp => ({
                        ...comp,
                        id: this.generateId(),
                        createdAt: new Date().toISOString()
                    }));

                    this.components = [...this.components, ...importedComponents];
                    this.saveData();
                    // 延迟渲染，避免大量DOM操作瞬间卡顿
                    requestAnimationFrame(() => {
                        this.filterAndRender();
                        this.updateStatistics();
                    });
                    this.showNotification(`成功导入 ${importedComponents.length} 个元器件！（按 Ctrl+Z 可撤回）`, 'success');
                } else {
                    throw new Error('无效的数据格式');
                }
            } catch (error) {
                this.showNotification('导入失败：' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }
    
    // 通知系统
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transform translate-x-full transition-transform duration-300 ${
            type === 'success' ? 'bg-green-600' : 
            type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        } text-white`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // 显示动画
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);
        
        // 自动隐藏
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
    
    // ============ 采集清单管理 ============
    
    // 添加到采集清单
    addToCollection(componentId) {
        const component = this.components.find(c => c.id === componentId);
        if (!component || component.stock <= 0) {
            this.showNotification('库存不足，无法添加到清单', 'error');
            return;
        }
        
        let collection = this.getCollection();
        const existingItem = collection.find(item => item.componentId === componentId);
        
        if (existingItem) {
            // 已存在，增加数量
            if (existingItem.quantity >= component.stock) {
                this.showNotification('已达到最大可出库数量', 'warning');
                return;
            }
            existingItem.quantity += 1;
        } else {
            // 新增
            collection.push({
                componentId: componentId,
                quantity: 1,
                addedAt: new Date().toISOString()
            });
        }
        
        this.saveCollection(collection);
        this.renderCollectionPanel();
        this.showCollectionPanel();
        this.switchListTab('checkout');
        this.updateCollectionButtonState(componentId);
        this.showNotification('已添加到采集清单', 'success');
    }
    
    // 从采集清单移除
    removeFromCollection(componentId) {
        let collection = this.getCollection();
        collection = collection.filter(item => item.componentId !== componentId);
        this.saveCollection(collection);
        this.renderCollectionPanel();
        this.updateCollectionButtonState(componentId);
    }
    
    // 更新采集清单中的数量
    updateCollectionQuantity(componentId, delta) {
        let collection = this.getCollection();
        const item = collection.find(i => i.componentId === componentId);
        const component = this.components.find(c => c.id === componentId);
        
        if (!item || !component) return;
        
        const newQuantity = item.quantity + delta;
        
        if (newQuantity <= 0) {
            this.removeFromCollection(componentId);
            return;
        }
        
        if (newQuantity > component.stock) {
            this.showNotification('数量超过库存上限', 'error');
            return;
        }
        
        item.quantity = newQuantity;
        this.saveCollection(collection);
        this.renderCollectionPanel();
    }

    // 直接设置采集清单中的数量
    setCollectionQuantity(componentId, value) {
        let collection = this.getCollection();
        const item = collection.find(i => i.componentId === componentId);
        const component = this.components.find(c => c.id === componentId);

        if (!item || !component) return;

        const newQuantity = parseInt(value);
        if (isNaN(newQuantity) || newQuantity <= 0) {
            this.showNotification('请输入有效的数量', 'error');
            this.renderCollectionPanel();
            return;
        }

        if (newQuantity > component.stock) {
            this.showNotification('数量超过库存上限', 'error');
            this.renderCollectionPanel();
            return;
        }

        item.quantity = newQuantity;
        this.saveCollection(collection);
        this.renderCollectionPanel();
    }

    // 清空清单（根据当前标签页清空出库或入库清单）
    clearCollection() {
        const checkoutTab = document.getElementById('checkoutTab');
        const isCheckoutActive = checkoutTab.classList.contains('active');

        if (isCheckoutActive) {
            // 清空出库清单
            const collection = this.getCollection();
            if (collection.length === 0) {
                this.showNotification('出库清单已经是空的', 'info');
                return;
            }

            if (confirm('确定要清空出库清单吗？')) {
                // 先保存要重置的元器件ID（清空前保存）
                const componentIds = collection.map(item => item.componentId);

                this.saveCollection([]);
                this.renderCollectionPanel();

                // 重置按钮状态
                componentIds.forEach(id => this.updateCollectionButtonState(id));

                this.showNotification('出库清单已清空', 'success');
            }
        } else {
            // 清空入库清单
            const inbound = this.getInbound();
            if (inbound.length === 0) {
                this.showNotification('入库清单已经是空的', 'info');
                return;
            }

            if (confirm('确定要清空入库清单吗？')) {
                // 先保存要重置的元器件ID（清空前保存）
                const componentIds = inbound.map(item => item.componentId);

                this.saveInbound([]);
                this.renderInboundPanel();

                // 重置按钮状态
                componentIds.forEach(id => this.updateInboundButtonState(id));

                this.showNotification('入库清单已清空', 'success');
            }
        }
    }
    
    // 获取采集清单
    getCollection() {
        try {
            const data = sessionStorage.getItem('componentCollection');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn('出库清单数据损坏，已重置:', e);
            sessionStorage.removeItem('componentCollection');
            return [];
        }
    }
    
    // 保存采集清单
    saveCollection(collection) {
        sessionStorage.setItem('componentCollection', JSON.stringify(collection));
    }
    
    // 渲染采集清单面板
    renderCollectionPanel() {
        const collection = this.getCollection();
        const emptyState = document.getElementById('collectionEmpty');
        const listContainer = document.getElementById('collectionList');
        const countBadge = document.getElementById('collectionCount');
        const totalQuantityEl = document.getElementById('totalQuantity');
        const checkoutBtn = document.getElementById('batchCheckoutBtn');
        
        // 更新计数和总量
        const totalItems = collection.length;
        const totalQuantity = collection.reduce((sum, item) => sum + item.quantity, 0);
        
        countBadge.textContent = `${totalItems}项`;
        totalQuantityEl.textContent = totalQuantity;
        
        // 检查是否有足够的库存
        const hasInsufficientStock = collection.some(item => {
            const component = this.components.find(c => c.id === item.componentId);
            return !component || item.quantity > component.stock;
        });
        
        if (hasInsufficientStock || totalItems === 0) {
            checkoutBtn.disabled = true;
            checkoutBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            checkoutBtn.disabled = false;
            checkoutBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        
        // 渲染列表或空状态
        if (collection.length === 0) {
            emptyState.classList.remove('hidden');
            listContainer.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            listContainer.classList.remove('hidden');
            
            listContainer.innerHTML = collection.map(item => {
                const component = this.components.find(c => c.id === item.componentId);
                if (!component) return '';
                
                const isInsufficientStock = item.quantity > component.stock;
                const hasValue = this.getComponentValueText(component) && this.getComponentValueText(component) !== '-';
                
                const controls = `
                    <div class="flex items-center gap-0.5 flex-shrink-0">
                        <button onclick="componentManager.updateCollectionQuantity('${component.id}', -1)"
                                class="w-4 h-4 flex items-center justify-center rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors text-xs leading-none font-bold">
                            -
                        </button>
                        <input
                            type="number"
                            value="${item.quantity}"
                            min="1"
                            max="${component.stock}"
                            class="w-5 text-center text-xs text-white bg-gray-700 rounded border border-gray-600 focus:border-orange-400 focus:outline-none px-0.5"
                            style="-webkit-appearance: none; -moz-appearance: textfield;"
                            onchange="componentManager.setCollectionQuantity('${component.id}', this.value)"
                        />
                        <button onclick="componentManager.updateCollectionQuantity('${component.id}', 1)"
                                class="w-4 h-4 flex items-center justify-center rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors text-xs leading-none font-bold">
                            +
                        </button>
                        ${isInsufficientStock ? '<span class="text-red-400 font-bold text-xs px-0.5">!</span>' : ''}
                        <button onclick="componentManager.removeFromCollection('${component.id}')" 
                                class="w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors text-xs leading-none">
                            ×
                        </button>
                    </div>
                `;
                
                if (hasValue) {
                    return `
                        <div class="bg-gray-700/50 rounded px-2 py-1">
                            <div class="flex items-center gap-1 text-xs">
                                <span class="text-white font-medium truncate flex-shrink-0">${component.name}</span>
                                <span class="text-gray-400 truncate flex-shrink-0">${component.model ? '·' + component.model : ''}</span>
                                <span class="text-orange-400 flex-shrink-0">${component.location ? '·' + component.location : ''}</span>
                                <span class="${isInsufficientStock ? 'text-red-400' : 'text-emerald-400'} flex-shrink-0">${component.stock}</span>
                            </div>
                            <div class="flex items-center gap-1 text-xs mt-0.5">
                                <span class="text-gray-300 truncate flex-1">${this.getComponentValueText(component)}</span>
                                ${controls}
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="bg-gray-700/50 rounded px-2 py-1 flex items-center gap-1 text-xs">
                            <span class="text-white font-medium truncate flex-shrink-0">${component.name}</span>
                            <span class="text-gray-400 truncate flex-shrink-0">${component.model ? '·' + component.model : ''}</span>
                            <span class="text-orange-400 flex-shrink-0">${component.location ? '·' + component.location : ''}</span>
                            <span class="${isInsufficientStock ? 'text-red-400' : 'text-emerald-400'} flex-shrink-0">${component.stock}</span>
                            ${controls}
                        </div>
                    `;
                }
            }).join('');
        }
    }
    
    // 显示采集清单面板
    showCollectionPanel() {
        const panel = document.getElementById('collectionPanel');
        panel.classList.remove('translate-x-full');
    }
    
    // 隐藏采集清单面板
    hideCollectionPanel() {
        const panel = document.getElementById('collectionPanel');
        panel.classList.add('translate-x-full');
    }
    
    // 切换采集清单面板显示状态（显示/隐藏）
    toggleCollectionPanel() {
        const panel = document.getElementById('collectionPanel');
        
        // 检查是否被拖动过
        const isDragged = panel.dataset.dragged === 'true';
        
        if (isDragged) {
            // 如果拖动过，使用 display 切换，完全隐藏
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? '' : 'none';
        } else {
            // 如果没有拖动过，使用 translate 切换
            panel.classList.toggle('translate-x-full');
        }
    }
    
    // 初始化清单面板拖拽功能
    initCollectionPanelDrag() {
        const panel = document.getElementById('collectionPanel');
        const header = document.getElementById('collectionPanelHeader');
        
        // 如果已经初始化过，不再重复
        if (header.dataset.initialized === 'true') {
            return;
        }
        header.dataset.initialized = 'true';
        
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let panelStartX = 0;
        let panelStartY = 0;
        
        header.addEventListener('mousedown', (e) => {
            // 如果点击的是按钮，不触发拖拽
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                return;
            }
            
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            
            // 获取当前的位置
            const rect = panel.getBoundingClientRect();
            panelStartX = rect.left;
            panelStartY = rect.top;
            
            // 标记已开始拖拽
            panel.dataset.dragged = 'true';
            
            // 移除 transform 和 translate 类，使用 left/top 定位
            panel.style.transform = 'none';
            panel.classList.remove('translate-x-full');
            panel.style.right = 'auto';
            panel.style.display = '';
            panel.style.left = panelStartX + 'px';
            panel.style.top = panelStartY + 'px';
            
            // 添加拖拽样式
            panel.classList.add('dragging');
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            
            // 计算新位置
            let newLeft = panelStartX + deltaX;
            let newTop = panelStartY + deltaY;
            
            // 获取面板尺寸
            const panelRect = panel.getBoundingClientRect();
            const panelWidth = panelRect.width;
            const panelHeight = panelRect.height;
            
            // 获取窗口尺寸
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            // 获取滚动条宽度（通常约17px）
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            
            // 顶部导航栏高度（64px，可拖动到导航栏下边界）
            const headerHeight = 64;
            
            // 边界限制
            // 顶部：不低于导航栏下边界
            newTop = Math.max(headerHeight, newTop);
            
            // 底部：不超出屏幕底部
            newTop = Math.min(newTop, windowHeight - panelHeight);
            
            // 左边：不超出屏幕左边
            newLeft = Math.max(0, newLeft);
            
            // 右边：不超出滚动条左边缘（保留滚动条宽度）
            newLeft = Math.min(newLeft, windowWidth - panelWidth - scrollbarWidth);
            
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                panel.classList.remove('dragging');
                // 标记已拖拽过
                panel.dataset.dragged = 'true';
            }
        });
    }
    
    // 更新采集按钮状态
    updateCollectionButtonState(componentId) {
        const btn = document.getElementById(`collectionBtn-${componentId}`);
        if (!btn) return;

        const collection = this.getCollection();
        const inCollection = collection.some(item => item.componentId === componentId);

        if (inCollection) {
            btn.classList.remove('border-orange-400', 'text-orange-400', 'hover:bg-orange-400', 'hover:text-white');
            btn.classList.add('bg-orange-500', 'text-white', 'border-orange-500');
            btn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>已采集</span>
            `;
        } else {
            btn.classList.add('border-orange-400', 'text-orange-400', 'hover:bg-orange-400', 'hover:text-white');
            btn.classList.remove('bg-orange-500', 'text-white', 'border-orange-500');
            btn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                </svg>
                <span>出库</span>
            `;
        }
    }
    
    // 重置所有采集按钮状态
    resetAllCollectionButtonStates() {
        const collection = this.getCollection();
        collection.forEach(item => {
            this.updateCollectionButtonState(item.componentId);
        });
    }
    
    // 初始化所有采集按钮状态
    initAllCollectionButtonStates() {
        const collection = this.getCollection();
        this.components.forEach(component => {
            const inCollection = collection.some(item => item.componentId === component.id);
            if (inCollection) {
                this.updateCollectionButtonState(component.id);
            }
        });
    }
    
    // 批量出库
    batchCheckout() {
        const collection = this.getCollection();
        
        if (collection.length === 0) {
            this.showNotification('采集清单为空', 'warning');
            return;
        }
        
        // 验证库存
        const insufficientItems = [];
        collection.forEach(item => {
            const component = this.components.find(c => c.id === item.componentId);
            if (!component || item.quantity > component.stock) {
                insufficientItems.push({
                    component: component ? component.name : '未知',
                    requested: item.quantity,
                    available: component ? component.stock : 0
                });
            }
        });
        
        if (insufficientItems.length > 0) {
            this.showNotification('部分元器件库存不足，请检查清单', 'error');
            return;
        }
        
        // 显示确认对话框
        this.showCheckoutConfirmDialog(collection);
    }
    
    // 显示出库确认对话框
    showCheckoutConfirmDialog(collection) {
        const modal = document.getElementById('checkoutConfirmModal');
        const confirmText = document.getElementById('checkoutConfirmText');
        const detailsEl = document.getElementById('checkoutDetails');
        
        const totalItems = collection.length;
        const totalQuantity = collection.reduce((sum, item) => sum + item.quantity, 0);
        
        confirmText.textContent = `即将出库 ${totalItems} 种元器件，共 ${totalQuantity} 个`;
        
        // 生成详情列表
        detailsEl.innerHTML = collection.map(item => {
            const component = this.components.find(c => c.id === item.componentId);
            return `
                <div class="py-2 border-b border-gray-600 last:border-0">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-white font-medium truncate">${this.escapeHtml(component.name)}</p>
                            <p class="text-xs text-gray-400">${this.escapeHtml(component.model) || '无型号'}</p>
                        </div>
                        <div class="text-right ml-4">
                            <p class="text-sm text-orange-400 font-medium">-${item.quantity}</p>
                            <p class="text-xs text-gray-500">剩余: ${component.stock}</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 bg-gray-800/50 rounded p-2 text-xs">
                        <div>
                            <span class="text-gray-500">位置:</span>
                            <span class="text-gray-300 ml-1">${this.escapeHtml(component.location) || '-'}</span>
                        </div>
                        <div>
                            <span class="text-gray-500">分类:</span>
                            <span class="text-gray-300 ml-1">${this.escapeHtml(this.getCategoryName(component.category))}${component.subCategory ? ' / ' + this.escapeHtml(this.getSubCategoryName(component.category, component.subCategory)) : ''}</span>
                        </div>
                        <div class="col-span-2">
                            <span class="text-gray-500">参数:</span>
                            <span class="text-gray-300 ml-1">${this.getComponentValueText(component)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        modal.classList.remove('hidden');
    }
    
    // 确认批量出库
    confirmBatchCheckout() {
        const collection = this.getCollection();

        // 检查库存是否足够
        const insufficientItems = [];
        collection.forEach(item => {
            const component = this.components.find(c => c.id === item.componentId);
            if (!component || component.stock < item.quantity) {
                insufficientItems.push({
                    name: component ? component.name : '未知元器件',
                    needed: item.quantity,
                    available: component ? component.stock : 0
                });
            }
        });

        if (insufficientItems.length > 0) {
            const message = insufficientItems.map(item => 
                `${item.name}: 需要 ${item.needed} 个，库存 ${item.available} 个`
            ).join('\n');
            this.showNotification('库存不足！\n' + message, 'error');
            return;
        }

        // 保存历史记录用于撤回（在扣减库存前保存）
        const itemsSnapshot = collection.map(item => ({
            componentId: item.componentId,
            quantity: item.quantity
        }));
        this.pushHistory('batchCheckout', {
            items: itemsSnapshot
        });

        // 扣减库存并保存历史记录
        collection.forEach(item => {
            const component = this.components.find(c => c.id === item.componentId);
            if (component) {
                const beforeStock = component.stock;
                component.stock -= item.quantity;
                const afterStock = component.stock;
                component.updatedAt = new Date().toISOString();

                // 保存历史记录
                this.saveHistoryRecord('checkout', component.name, item.quantity, beforeStock, afterStock);
            }
        });

        // 保存出库记录到 localStorage（保留原有格式）
        this.saveCheckoutRecord(collection);

        // 保存数据
        this.saveData();

        // 先保存要重置的元器件ID（清空前保存）
        const componentIds = collection.map(item => item.componentId);

        // 清空采集清单
        this.saveCollection([]);

        // 更新界面
        this.renderComponents();
        this.updateStatistics();
        this.renderCollectionPanel();

        // 重置按钮状态
        componentIds.forEach(id => this.updateCollectionButtonState(id));

        // 重新初始化入库按钮状态（因为 renderComponents 会重新渲染HTML）
        this.initAllInboundButtonStates();

        // 隐藏确认对话框
        document.getElementById('checkoutConfirmModal').classList.add('hidden');

        // 自动折叠清单面板
        document.getElementById('collectionPanel').classList.add('translate-x-full');

        this.showNotification('批量出库成功！', 'success');
    }
    
    // 取消出库
    cancelCheckout() {
        document.getElementById('checkoutConfirmModal').classList.add('hidden');
    }
    
    // 保存出库记录
    saveCheckoutRecord(collection) {
        const records = JSON.parse(localStorage.getItem('checkoutRecords') || '[]');
        
        const record = {
            id: 'checkout_' + Date.now(),
            timestamp: new Date().toISOString(),
            items: collection.map(item => {
                const component = this.components.find(c => c.id === item.componentId);
                return {
                    componentId: item.componentId,
                    name: component.name,
                    model: component.model,
                    quantity: item.quantity
                };
            }),
            totalItems: collection.length,
            totalQuantity: collection.reduce((sum, item) => sum + item.quantity, 0)
        };
        
        records.unshift(record);
        
        // 只保留最近100条记录
        if (records.length > 100) {
            records.pop();
        }
        
        localStorage.setItem('checkoutRecords', JSON.stringify(records));
        this.syncSettingsToServer();
    }
    
    // ============ 入库清单管理 ============
    
    // 添加到入库清单
    addToInbound(componentId) {
        const component = this.components.find(c => c.id === componentId);
        if (!component) {
            this.showNotification('元器件不存在', 'error');
            return;
        }
        
        let inbound = this.getInbound();
        const existingItem = inbound.find(item => item.componentId === componentId);
        
        if (existingItem) {
            // 已存在，增加数量
            existingItem.quantity += 1;
        } else {
            // 新增
            inbound.push({
                componentId: componentId,
                quantity: 1,
                addedAt: new Date().toISOString()
            });
        }
        
        this.saveInbound(inbound);
        this.renderInboundPanel();
        this.showCollectionPanel();
        this.switchListTab('inbound');
        this.updateInboundButtonState(componentId);
        this.showNotification('已添加到入库清单', 'success');
    }
    
    // 从入库清单移除
    removeFromInbound(componentId) {
        let inbound = this.getInbound();
        inbound = inbound.filter(item => item.componentId !== componentId);
        this.saveInbound(inbound);
        this.renderInboundPanel();
        this.updateInboundButtonState(componentId);
    }
    
    // 更新入库清单中的数量
    updateInboundQuantity(componentId, delta) {
        let inbound = this.getInbound();
        const item = inbound.find(i => i.componentId === componentId);
        
        if (!item) return;
        
        const newQuantity = item.quantity + delta;
        
        if (newQuantity <= 0) {
            this.removeFromInbound(componentId);
            return;
        }
        
        item.quantity = newQuantity;
        this.saveInbound(inbound);
        this.renderInboundPanel();
    }

    // 直接设置入库清单中的数量
    setInboundQuantity(componentId, value) {
        let inbound = this.getInbound();
        const item = inbound.find(i => i.componentId === componentId);

        if (!item) return;

        const newQuantity = parseInt(value);
        if (isNaN(newQuantity) || newQuantity <= 0) {
            this.showNotification('请输入有效的数量', 'error');
            this.renderInboundPanel();
            return;
        }

        item.quantity = newQuantity;
        this.saveInbound(inbound);
        this.renderInboundPanel();
    }

    // 清空入库清单
    clearInbound() {
        if (this.getInbound().length === 0) {
            this.showNotification('清单已经是空的', 'info');
            return;
        }
        
        if (confirm('确定要清空入库清单吗？')) {
            this.saveInbound([]);
            this.renderInboundPanel();
            this.resetAllInboundButtonStates();
            this.showNotification('清单已清空', 'success');
        }
    }
    
    // 获取入库清单
    getInbound() {
        try {
            const data = sessionStorage.getItem('componentInbound');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn('入库清单数据损坏，已重置:', e);
            sessionStorage.removeItem('componentInbound');
            return [];
        }
    }
    
    // 保存入库清单
    saveInbound(inbound) {
        sessionStorage.setItem('componentInbound', JSON.stringify(inbound));
    }
    
    // 渲染入库清单面板
    renderInboundPanel() {
        const inbound = this.getInbound();
        const emptyState = document.getElementById('inboundEmpty');
        const listContainer = document.getElementById('inboundList');
        const countBadge = document.getElementById('inboundCount');
        const totalQuantityEl = document.getElementById('inboundTotalQuantity');
        const inboundBtn = document.getElementById('batchInboundBtn');
        
        // 更新计数和总量
        const totalItems = inbound.length;
        const totalQuantity = inbound.reduce((sum, item) => sum + item.quantity, 0);
        
        countBadge.textContent = `${totalItems}项`;
        totalQuantityEl.textContent = totalQuantity;
        
        // 检查是否有足够的库存
        const hasInsufficientStock = inbound.some(item => {
            const component = this.components.find(c => c.id === item.componentId);
            return !component;
        });
        
        if (hasInsufficientStock || totalItems === 0) {
            inboundBtn.disabled = true;
            inboundBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            inboundBtn.disabled = false;
            inboundBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        
        // 渲染列表或空状态
        if (inbound.length === 0) {
            emptyState.classList.remove('hidden');
            listContainer.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            listContainer.classList.remove('hidden');
            
            listContainer.innerHTML = inbound.map(item => {
                const component = this.components.find(c => c.id === item.componentId);
                if (!component) return '';
                
                const hasValue = this.getComponentValueText(component) && this.getComponentValueText(component) !== '-';
                
                const controls = `
                    <div class="flex items-center gap-0.5 flex-shrink-0">
                        <button onclick="componentManager.updateInboundQuantity('${component.id}', -1)"
                                class="w-4 h-4 flex items-center justify-center rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors text-xs leading-none font-bold">
                            -
                        </button>
                        <input
                            type="number"
                            value="${item.quantity}"
                            min="1"
                            class="w-5 text-center text-xs text-white bg-gray-700 rounded border border-gray-600 focus:border-green-400 focus:outline-none px-0.5"
                            style="-webkit-appearance: none; -moz-appearance: textfield;"
                            onchange="componentManager.setInboundQuantity('${component.id}', this.value)"
                        />
                        <button onclick="componentManager.updateInboundQuantity('${component.id}', 1)"
                                class="w-4 h-4 flex items-center justify-center rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors text-xs leading-none font-bold">
                            +
                        </button>
                        <button onclick="componentManager.removeFromInbound('${component.id}')" 
                                class="w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors text-xs leading-none">
                            ×
                        </button>
                    </div>
                `;
                
                if (hasValue) {
                    return `
                        <div class="bg-gray-700/50 rounded px-2 py-1">
                            <div class="flex items-center gap-1 text-xs">
                                <span class="text-white font-medium truncate flex-shrink-0">${component.name}</span>
                                <span class="text-gray-400 truncate flex-shrink-0">${component.model ? '·' + component.model : ''}</span>
                                <span class="text-orange-400 flex-shrink-0">${component.location ? '·' + component.location : ''}</span>
                                <span class="text-emerald-400 flex-shrink-0">${component.stock}</span>
                            </div>
                            <div class="flex items-center gap-1 text-xs mt-0.5">
                                <span class="text-gray-300 truncate flex-1">${component.value}</span>
                                ${controls}
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="bg-gray-700/50 rounded px-2 py-1 flex items-center gap-1 text-xs">
                            <span class="text-white font-medium truncate flex-shrink-0">${component.name}</span>
                            <span class="text-gray-400 truncate flex-shrink-0">${component.model ? '·' + component.model : ''}</span>
                            <span class="text-orange-400 flex-shrink-0">${component.location ? '·' + component.location : ''}</span>
                            <span class="text-emerald-400 flex-shrink-0">${component.stock}</span>
                            ${controls}
                        </div>
                    `;
                }
            }).join('');
        }
    }
    
    // 更新入库按钮状态
    updateInboundButtonState(componentId) {
        const btn = document.getElementById(`inboundBtn-${componentId}`);
        if (!btn) return;
        
        const inbound = this.getInbound();
        const inInbound = inbound.some(item => item.componentId === componentId);
        
        if (inInbound) {
            btn.classList.remove('border-green-400', 'text-green-400', 'hover:bg-green-400', 'hover:text-white');
            btn.classList.add('bg-green-500', 'text-white', 'border-green-500');
            btn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>已加入</span>
            `;
        } else {
            btn.classList.add('border-green-400', 'text-green-400', 'hover:bg-green-400', 'hover:text-white');
            btn.classList.remove('bg-green-500', 'text-white', 'border-green-500');
            btn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                </svg>
                <span>入库</span>
            `;
        }
    }
    
    // 重置所有入库按钮状态
    resetAllInboundButtonStates() {
        const inbound = this.getInbound();
        inbound.forEach(item => {
            this.updateInboundButtonState(item.componentId);
        });
    }
    
    // 初始化所有入库按钮状态
    initAllInboundButtonStates() {
        const inbound = this.getInbound();
        this.components.forEach(component => {
            const inInbound = inbound.some(item => item.componentId === component.id);
            if (inInbound) {
                this.updateInboundButtonState(component.id);
            }
        });
    }
    
    // 切换标签页
    switchListTab(tab) {
        const checkoutTab = document.getElementById('checkoutTab');
        const inboundTab = document.getElementById('inboundTab');
        const checkoutContent = document.getElementById('checkoutContent');
        const inboundContent = document.getElementById('inboundContent');
        const collectionFooter = document.getElementById('collectionFooter');
        const inboundFooter = document.getElementById('inboundFooter');
        
        if (tab === 'checkout') {
            checkoutTab.classList.add('active');
            inboundTab.classList.remove('active');
            checkoutContent.classList.remove('hidden');
            inboundContent.classList.add('hidden');
            collectionFooter.classList.remove('hidden');
            inboundFooter.classList.add('hidden');
        } else {
            inboundTab.classList.add('active');
            checkoutTab.classList.remove('active');
            inboundContent.classList.remove('hidden');
            checkoutContent.classList.add('hidden');
            inboundFooter.classList.remove('hidden');
            collectionFooter.classList.add('hidden');
        }
    }
    
    // 初始化标签页
    initListTabs() {
        // 默认显示出库标签页
        this.switchListTab('checkout');
    }
    
    // 批量入库
    batchInbound() {
        const inbound = this.getInbound();
        
        if (inbound.length === 0) {
            this.showNotification('入库清单为空', 'warning');
            return;
        }
        
        // 验证元器件存在性
        const invalidItems = [];
        inbound.forEach(item => {
            const component = this.components.find(c => c.id === item.componentId);
            if (!component) {
                invalidItems.push({
                    componentId: item.componentId,
                    quantity: item.quantity
                });
            }
        });
        
        if (invalidItems.length > 0) {
            this.showNotification('部分元器件已不存在，请检查清单', 'error');
            return;
        }
        
        // 显示确认对话框
        this.showInboundConfirmDialog(inbound);
    }
    
    // 显示入库确认对话框
    showInboundConfirmDialog(inbound) {
        const modal = document.getElementById('inboundConfirmModal');
        const confirmText = document.getElementById('inboundConfirmText');
        const detailsEl = document.getElementById('inboundDetails');
        
        const totalItems = inbound.length;
        const totalQuantity = inbound.reduce((sum, item) => sum + item.quantity, 0);
        
        confirmText.textContent = `即将入库 ${totalItems} 种元器件，共 ${totalQuantity} 个`;
        
        // 生成详情列表
        detailsEl.innerHTML = inbound.map(item => {
            const component = this.components.find(c => c.id === item.componentId);
            return `
                <div class="py-2 border-b border-gray-600 last:border-0">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-white font-medium truncate">${this.escapeHtml(component.name)}</p>
                            <p class="text-xs text-gray-400">${this.escapeHtml(component.model) || '无型号'}</p>
                        </div>
                        <div class="text-right ml-4">
                            <p class="text-sm text-green-400 font-medium">+${item.quantity}</p>
                            <p class="text-xs text-gray-500">当前: ${component.stock}</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 bg-gray-800/50 rounded p-2 text-xs">
                        <div>
                            <span class="text-gray-500">位置:</span>
                            <span class="text-gray-300 ml-1">${this.escapeHtml(component.location) || '-'}</span>
                        </div>
                        <div>
                            <span class="text-gray-500">分类:</span>
                            <span class="text-gray-300 ml-1">${this.getCategoryName(component.category)}${component.subCategory ? ' / ' + this.getSubCategoryName(component.category, component.subCategory) : ''}</span>
                        </div>
                        <div class="col-span-2">
                            <span class="text-gray-500">参数:</span>
                            <span class="text-gray-300 ml-1">${this.getComponentValueText(component)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        modal.classList.remove('hidden');
    }
    
    // 确认批量入库
    confirmBatchInbound() {
        const inbound = this.getInbound();

        // 保存历史记录用于撤回（在增加库存前保存）
        const itemsSnapshot = inbound.map(item => ({
            componentId: item.componentId,
            quantity: item.quantity
        }));
        this.pushHistory('batchInbound', {
            items: itemsSnapshot
        });

        // 增加库存并保存历史记录
        inbound.forEach(item => {
            const component = this.components.find(c => c.id === item.componentId);
            if (component) {
                const beforeStock = component.stock;
                component.stock += item.quantity;
                const afterStock = component.stock;
                component.updatedAt = new Date().toISOString();

                // 保存历史记录
                this.saveHistoryRecord('inbound', component.name, item.quantity, beforeStock, afterStock);
            }
        });

        // 保存入库记录到 localStorage（保留原有格式）
        this.saveInboundRecord(inbound);

        // 保存数据
        this.saveData();

        // 先保存要重置的元器件ID（清空前保存）
        const componentIds = inbound.map(item => item.componentId);

        // 清空入库清单
        this.saveInbound([]);

        // 更新界面
        this.renderComponents();
        this.updateStatistics();
        this.renderInboundPanel();

        // 重置按钮状态
        componentIds.forEach(id => this.updateInboundButtonState(id));

        // 重新初始化出库按钮状态（因为 renderComponents 会重新渲染HTML）
        this.initAllCollectionButtonStates();

        // 隐藏确认对话框
        document.getElementById('inboundConfirmModal').classList.add('hidden');

        // 自动折叠清单面板
        document.getElementById('collectionPanel').classList.add('translate-x-full');

        this.showNotification('批量入库成功！', 'success');
    }
    
    // 取消入库
    cancelInbound() {
        document.getElementById('inboundConfirmModal').classList.add('hidden');
    }
    
    // 保存入库记录
    saveInboundRecord(inbound) {
        const records = JSON.parse(localStorage.getItem('inboundRecords') || '[]');
        
        const record = {
            id: 'inbound_' + Date.now(),
            timestamp: new Date().toISOString(),
            items: inbound.map(item => {
                const component = this.components.find(c => c.id === item.componentId);
                return {
                    componentId: item.componentId,
                    name: component.name,
                    model: component.model,
                    quantity: item.quantity
                };
            }),
            totalItems: inbound.length,
            totalQuantity: inbound.reduce((sum, item) => sum + item.quantity, 0)
        };
        
        records.unshift(record);
        
        // 只保留最近100条记录
        if (records.length > 100) {
            records.pop();
        }
        
        localStorage.setItem('inboundRecords', JSON.stringify(records));
        this.syncSettingsToServer();
    }

    // 显示BOM匹配浮动面板
    showBomMatchModal() {
        const modal = document.getElementById('bomMatchModal');

        // 确保移除 dragging 类
        modal.classList.remove('dragging');

        // 如果从未拖拽过，使用translateX动画
        if (!modal.dataset.dragged) {
            modal.classList.remove('-translate-x-[150%]');
        } else {
            // 拖拽后，使用opacity和translate实现动画效果
            modal.style.display = 'block';

            // 使用requestAnimationFrame确保元素先显示，然后再应用动画
            requestAnimationFrame(() => {
                modal.style.opacity = '0';
                modal.style.transform = 'translateX(-50px)';

                // 再下一个帧应用动画
                requestAnimationFrame(() => {
                    modal.style.opacity = '1';
                    modal.style.transform = 'translateX(0)';
                });
            });
        }

        // 如果有缓存的BOM数据，显示匹配结果；否则显示上传区域
        if (this.currentBomItems.length > 0) {
            document.getElementById('bomUploadArea').classList.add('hidden');
            document.getElementById('bomMatchResults').classList.remove('hidden');
        } else {
            document.getElementById('bomUploadArea').classList.remove('hidden');
            document.getElementById('bomMatchResults').classList.add('hidden');
            document.getElementById('bomFileInput').value = '';
        }

        // 初始化折叠功能（如果还未初始化）
        this.initBomMatchPanel();
    }

    // 隐藏BOM匹配浮动面板
    hideBomMatchModal() {
        const modal = document.getElementById('bomMatchModal');

        // 确保移除 dragging 类
        modal.classList.remove('dragging');

        // 如果从未拖拽过，使用translateX动画隐藏
        if (!modal.dataset.dragged) {
            modal.classList.add('-translate-x-[150%]');
        } else {
            // 拖拽后，使用opacity和translate实现动画效果
            // 先设置动画的起始状态
            modal.style.opacity = '0';
            modal.style.transform = 'translateX(-50px)';

            // 等待CSS transition完成后再隐藏display
            // 使用transitionend事件更准确
            const handleTransitionEnd = () => {
                modal.removeEventListener('transitionend', handleTransitionEnd);
                modal.style.display = 'none';
            };
            modal.addEventListener('transitionend', handleTransitionEnd);

            // 添加超时保护，防止transitionend事件未触发
            setTimeout(() => {
                modal.style.display = 'none';
                modal.removeEventListener('transitionend', handleTransitionEnd);
            }, 350); // 比300ms稍长，确保动画完成
        }
    }

    // 切换BOM匹配浮动面板的显示/隐藏状态
    toggleBomMatchModal() {
        const modal = document.getElementById('bomMatchModal');

        // 检查当前状态：
        // - 如果从未拖拽过，通过 -translate-x-[150%] 类判断
        // - 如果已经拖拽过，通过 display 和 opacity 属性判断
        let isHidden = false;

        if (!modal.dataset.dragged) {
            // 未拖拽模式：检查 class
            isHidden = modal.classList.contains('-translate-x-[150%]');
        } else {
            // 已拖拽模式：检查 display 和 opacity
            isHidden = modal.style.display === 'none' || modal.style.opacity === '0';
        }

        if (isHidden) {
            this.showBomMatchModal();
        } else {
            this.hideBomMatchModal();
        }
    }

    // 初始化BOM匹配面板（拖拽和折叠功能）
    initBomMatchPanel() {
        const toggleBtn = document.getElementById('toggleBomMatchPanel');
        const content = document.getElementById('bomMatchContent');
        const modal = document.getElementById('bomMatchModal');
        const header = document.getElementById('bomMatchHeader');

        // 如果已经初始化过，不再重复
        if (toggleBtn.dataset.initialized === 'true') {
            return;
        }
        toggleBtn.dataset.initialized = 'true';

        // 拖拽功能
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let modalStartX = 0;
        let modalStartY = 0;

        header.addEventListener('mousedown', (e) => {
            // 如果点击的是按钮，不触发拖拽
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                return;
            }

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            // 获取当前的位置
            const rect = modal.getBoundingClientRect();
            modalStartX = rect.left;
            modalStartY = rect.top;

            // 标记已开始拖拽
            modal.dataset.dragged = 'true';

            // 移除transform，使用left/top定位
            modal.style.transform = 'none';
            modal.style.left = modalStartX + 'px';
            modal.style.top = modalStartY + 'px';

            // 添加拖拽样式
            modal.classList.add('dragging');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            e.preventDefault();

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            // 计算新位置
            let newLeft = modalStartX + deltaX;
            let newTop = modalStartY + deltaY;

            // 获取模态框尺寸
            const modalRect = modal.getBoundingClientRect();
            const modalWidth = modalRect.width;
            const modalHeight = modalRect.height;

            // 获取窗口尺寸
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            // 顶部导航栏高度（64px，加上16px的间距）
            const headerHeight = 64;
            const topMargin = 16;

            // 边界限制
            // 顶部：不低于导航栏（headerHeight + topMargin）
            newTop = Math.max(headerHeight + topMargin, newTop);

            // 底部：不超出屏幕底部
            newTop = Math.min(newTop, windowHeight - modalHeight);

            // 左边：不超出屏幕左边
            newLeft = Math.max(0, newLeft);

            // 右边：不超出屏幕右边
            newLeft = Math.min(newLeft, windowWidth - modalWidth);

            modal.style.left = newLeft + 'px';
            modal.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                modal.classList.remove('dragging');
                // 标记已拖拽过
                modal.dataset.dragged = 'true';
            }
        });

        // 折叠/展开功能
        let isCollapsed = false;
        toggleBtn.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            if (isCollapsed) {
                content.style.display = 'none';
                toggleBtn.innerHTML = `
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                `;
            } else {
                content.style.display = 'block';
                toggleBtn.innerHTML = `
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                `;
            }
        });

        // 初始化折叠图标为展开状态
        toggleBtn.innerHTML = `
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
        `;
    }

    // 处理BOM文件上传
    handleBomFileUpload(file) {
        if (!file) return;

        // 检查 XLSX 库是否已加载
        if (typeof XLSX === 'undefined') {
            this.showNotification('XLSX库未加载，请检查网络或刷新页面', 'error');
            console.error('XLSX library not loaded');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // 获取第一个工作表
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // 转换为JSON数据
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (!jsonData || jsonData.length < 2) {
                    this.showNotification('BOM表数据不足（至少需要标题行+1行数据）', 'error');
                    return;
                }

                // 解析BOM数据
                const bomItems = this.parseBomData(jsonData);

                if (bomItems.length === 0) {
                    this.showNotification('BOM表中没有找到有效数据，请检查列名是否匹配（名称/型号/参数/分类）', 'warning');
                    return;
                }

                // 进行智能匹配
                const matchResults = this.performBomMatching(bomItems);

                // 保存到缓存（包括headers用于显示顺序）
                this.currentBomItems = bomItems;
                this.currentBomMatchResults = matchResults;
                this.currentBomHeaders = jsonData[0]; // 保存原始标题行

                // 显示匹配结果
                this.displayBomMatchResults(matchResults);

                // 切换界面
                document.getElementById('bomUploadArea').classList.add('hidden');
                document.getElementById('bomMatchResults').classList.remove('hidden');

                this.showNotification(`成功解析 ${bomItems.length} 个元器件`, 'success');
            } catch (error) {
                console.error('解析BOM文件失败:', error);
                this.showNotification('解析BOM文件失败: ' + (error.message || error), 'error');
            }
        };
        reader.onerror = () => {
            this.showNotification('读取文件失败', 'error');
        };
        reader.readAsArrayBuffer(file);
    }

    // BOM类别映射表（LCSC中文分类 → 系统分类键）
    static get BOM_CATEGORY_MAP() {
        return {
            '电容': 'capacitor', '贴片电容': 'capacitor', '陶瓷电容': 'capacitor',
            '铝电解电容': 'capacitor', '钽电容': 'capacitor', '薄膜电容': 'capacitor',
            '超级电容': 'capacitor', '安规电容': 'capacitor',
            '电阻': 'resistor', '贴片电阻': 'resistor', '金属膜电阻': 'resistor',
            '碳膜电阻': 'resistor', '排阻': 'resistor', '可调电阻': 'resistor',
            '电感': 'inductor', '贴片电感': 'inductor', '功率电感': 'inductor',
            '磁珠': 'inductor', '共模电感': 'inductor', '变压器': 'inductor',
            '电感/线圈/变压器': 'inductor',
            '二极管': 'diode', '肖特基二极管': 'diode', '稳压二极管': 'diode',
            '整流二极管': 'diode', '发光二极管': 'diode', '通用二极管': 'diode',
            '三极管': 'transistor', 'NPN三极管': 'transistor', 'PNP三极管': 'transistor',
            'MOS管': 'mosfet', '场效应管': 'mosfet', 'MOSFET': 'mosfet',
            '三极管/MOS管/晶体管': 'transistor',
            'LED': 'led', '发光二极管': 'led', '光电器件': 'other',
            '晶振': 'crystal', '有源晶振': 'crystal', '无源晶振': 'crystal', '谐振器': 'crystal',
            '晶振/谐振器': 'crystal',
            '集成电路': 'ic', 'IC': 'ic', '芯片': 'ic', '电源管理': 'ic',
            'DC-DC电源芯片': 'ic', '线性稳压器': 'ic', 'LDO': 'ic',
            '运放': 'ic', '接口芯片': 'ic', '驱动芯片': 'ic', '存储芯片': 'ic',
            '单片机': 'ic', 'MCU': 'ic', '逻辑电路': 'ic', '移位寄存器': 'ic',
            '时钟和定时': 'ic', '实时时钟': 'ic', 'RTC': 'ic',
            '连接器': 'connector', '接插件': 'connector', '端子': 'connector',
            '线对板连接器': 'connector', '排母': 'connector',
            '开关': 'switch', '轻触开关': 'switch', '拨码开关': 'switch', '按键': 'switch',
            '传感器': 'sensor',
            '光敏传感器': 'sensor', '温度传感器': 'sensor',
            '红外遥控接收头': 'sensor', 'IRM': 'sensor',
            '继电器': 'relay',
            '保险丝': 'other',
            '电源芯片': 'ic',
            'LED驱动': 'ic', 'LED驱动器': 'ic',
            '光耦': 'other', '光隔离器': 'other'
        };
    }

    // BOM参数名映射表（LCSC Description键名 → 系统paramDefinitions键名和类别）
    static get BOM_PARAM_MAP() {
        return {
            // 电容
            '容值': { category: 'capacitor', defLabel: '电容值' },
            '额定电压': { category: ['capacitor', 'diode'], defLabel: '耐压值' },
            // 电阻
            '阻值': { category: 'resistor', defLabel: '阻值' },
            '功率': { category: ['resistor', 'led'], defLabel: '额定功率' },
            // 电感
            '电感值': { category: 'inductor', defLabel: '电感量' },
            '额定电流': { category: ['inductor', 'diode', 'mosfet', 'transistor'], defLabel: '额定电流' },
            // 二极管
            '正向压降': { category: 'diode', defLabel: '正向压降' },
            '直流反向耐压': { category: 'diode', defLabel: '反向重复峰值电压' },
            '整流电流': { category: 'diode', defLabel: '平均整流电流' },
            '反向恢复时间': { category: 'diode', defLabel: '反向恢复时间' },
            // MOSFET
            '漏源击穿电压': { category: 'mosfet', defLabel: '漏源击穿电压' },
            '最大漏极电流': { category: 'mosfet', defLabel: '最大漏极电流' },
            // 三极管
            '集电极电流': { category: 'transistor', defLabel: '集电极最大允许电流' },
            '集电极-发射极击穿电压': { category: 'transistor', defLabel: '集电极-发射极击穿电压' },
            // 晶振
            '频率': { category: 'crystal', defLabel: '标称频率' },
            '负载电容': { category: 'crystal', defLabel: '负载电容' },
            // LED
            '发光颜色': { category: 'led', defLabel: '发光颜色' },
            '色温': { category: 'led', defLabel: '色温' },
            '正向电流': { category: 'led', defLabel: '正向电流' }
        };
    }

    // 解析LCSC Description键值对
    parseDescription(descText) {
        if (!descText || typeof descText !== 'string') return {};
        const result = {};
        // 按分号分割键值对
        const pairs = descText.split(';');
        for (const pair of pairs) {
            if (!pair.trim()) continue;
            // 按第一个冒号分割
            const colonIdx = pair.indexOf(':');
            if (colonIdx > 0) {
                const key = pair.substring(0, colonIdx).trim();
                let value = pair.substring(colonIdx + 1).trim();
                // 过滤掉空值和占位符
                if (key && value && value !== '-' && value !== '—' && value !== 'N/A') {
                    result[key] = value;
                }
            }
        }
        return result;
    }

    // LCSC 12列标准BOM字段映射说明:
    //   Comment[0] → 类别/子类别/名称 (我方 name 字段)
    //   Footprint[1] → 封装 (C0603=贴片电容+0603, R0603=贴片电阻+0603)
    //   Value[2] → 阻值/容值/电感量/频率 (最重要的匹配字段)
    //   Primary Category[3] → 主分类 (映射到 category)
    //   Secondary Category[4] → 子分类
    //   Description[5] → 键值对参数 (容值:10uF;精度:±10%;)
    //   Quantity[6] → 数量
    //   Supplier Part[7] → 商品编号/立创编号 (精确匹配)
    //   Manufacturer Part[8] → 厂商型号
    //   Name[9] → (同Comment) 类别/子类别/名称
    //   Manufacturer[10] → 品牌
    //   Supplier[11] → 供应商
    // 注意:
    //   - Primary/Category/Comment/Manufacturer Part/Secondary Category
    //     都映射到类别/子类别/名称，不叠加计分
    //   - Value 是最重要的匹配字段
    //   - Manufacturer(品牌) 是辅助匹配信号
    mapLcscCategory(primaryCategory) {
        if (!primaryCategory) return '';
        const lower = primaryCategory.toLowerCase().trim();
        const map = ComponentManager.BOM_CATEGORY_MAP;
        // 精确匹配
        if (map[primaryCategory.trim()]) return map[primaryCategory.trim()];
        // 遍历模糊匹配
        for (const [key, value] of Object.entries(map)) {
            if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
                return value;
            }
        }
        return '';
    }

    // 解析BOM数据（增强版 - 支持LCSC 12列标准格式）
    parseBomData(jsonData) {
        if (!jsonData || !Array.isArray(jsonData) || jsonData.length < 2) return [];

        // 假设第一行是标题行，从第二行开始是数据
        const headers = jsonData[0] && Array.isArray(jsonData[0])
            ? jsonData[0].map(h => String(h || '').trim().toLowerCase())
            : [];

        if (headers.length === 0) return [];

        // 查找可能的列名（增强版）
        const nameColIndex = headers.findIndex(h => h.includes('名称') || h === 'name' || h.includes('器件'));
        const commentColIndex = headers.findIndex(h => h.includes('comment'));
        const modelColIndex = headers.findIndex(h => h.includes('型号') || h === 'model' || h.includes('规格'));
        const valueColIndex = headers.findIndex(h => h.includes('参数') || h === 'value' || h === '值');
        const categoryColIndex = headers.findIndex(h => h.includes('分类') || h === 'category' || h.includes('类型'));
        const quantityColIndex = headers.findIndex(h => h.includes('数量') || h.includes('quantity') || h.includes('qty'));

        // 新增列检测（LCSC标准格式）
        const footprintColIndex = headers.findIndex(h => h.includes('封装') || h.includes('footprint') || h.includes('package') || h === 'pkg');
        const primaryCategoryColIndex = headers.findIndex(h => h.includes('primary category') || h === '主分类' || h.includes('品类'));
        const secondaryCategoryColIndex = headers.findIndex(h => h.includes('secondary category') || h === '子分类');
        const descriptionColIndex = headers.findIndex(h => h === 'description' || h.includes('描述'));
        const supplierPartColIndex = headers.findIndex(h => h.includes('supplier part') || h.includes('立创编号') || h.includes('料号'));
        const manufacturerPartColIndex = headers.findIndex(h => h.includes('manufacturer part') || h.includes('厂商型号') || h === 'mfr part' || h === 'manufacturer pn');
        // Manufacturer列匹配时排除已匹配Manufacturer Part的列, 且放在后面检查
        let manufacturerColIndex = -1;
        for (let i = 0; i < headers.length; i++) {
            const h = headers[i];
            if (i === manufacturerPartColIndex) continue; // 跳过已匹配的厂商型号列
            if (h.includes('manufacturer') && !h.includes('manufacturer part') && !h.includes('supplier') || h.includes('制造商') || h.includes('品牌') || h === 'brand') {
                manufacturerColIndex = i;
                break;
            }
        }
        // Supplier列（第12列，排除已匹配Supplier Part的列）
        let supplierColIndex = -1;
        for (let i = 0; i < headers.length; i++) {
            const h = headers[i];
            if (i === supplierPartColIndex) continue;
            if ((h.includes('supplier') && !h.includes('supplier part')) || h.includes('供应商')) {
                supplierColIndex = i;
                break;
            }
        }

        const bomItems = [];

        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            // 保存原始行的所有值（按照Excel列顺序）
            const originalValues = row.map(cell => {
                const value = cell !== undefined && cell !== null ? String(cell).trim() : '';
                return value;
            });

            // 优先使用Comment列，如果没有则使用Name列
            let nameValue = '';
            if (commentColIndex >= 0) {
                nameValue = String(row[commentColIndex] || '').trim();
            } else if (nameColIndex >= 0) {
                nameValue = String(row[nameColIndex] || '').trim();
            }

            // 获取LCSC料号（用于精确匹配）
            const supplierPart = supplierPartColIndex >= 0 ? String(row[supplierPartColIndex] || '').trim() : '';
            // 获取厂商型号
            const manufacturerPart = manufacturerPartColIndex >= 0 ? String(row[manufacturerPartColIndex] || '').trim() : '';
            // 获取主分类（LCSC中文分类）
            const primaryCategory = primaryCategoryColIndex >= 0 ? String(row[primaryCategoryColIndex] || '').trim() : '';
            // 获取子分类
            const secondaryCategory = secondaryCategoryColIndex >= 0 ? String(row[secondaryCategoryColIndex] || '').trim() : '';
            // 获取Description参数描述
            const description = descriptionColIndex >= 0 ? String(row[descriptionColIndex] || '').trim() : '';
            // 获取封装
            const footprint = footprintColIndex >= 0 ? String(row[footprintColIndex] || '').trim() : '';
            // 获取制造商
            const manufacturer = manufacturerColIndex >= 0 ? String(row[manufacturerColIndex] || '').trim() : '';
            // 获取供应商
            const supplier = supplierColIndex >= 0 ? String(row[supplierColIndex] || '').trim() : '';

            // 解析Description为结构化参数
            const parsedParams = this.parseDescription(description);

            // 从Value列获取值
            const valueText = valueColIndex >= 0 ? String(row[valueColIndex] || '').trim() : '';

            const item = {
                name: nameValue,
                model: modelColIndex >= 0 ? String(row[modelColIndex] || '').trim() : '',
                value: valueText,
                category: categoryColIndex >= 0 ? String(row[categoryColIndex] || '').trim() : '',
                quantity: quantityColIndex >= 0 ? parseInt(row[quantityColIndex]) || 1 : 1,
                // 新增LCSC BOM字段
                primaryCategory: primaryCategory,
                secondaryCategory: secondaryCategory,
                description: description,
                parsedParams: parsedParams,
                supplierPart: supplierPart,
                manufacturerPart: manufacturerPart,
                footprint: footprint,
                manufacturer: manufacturer,
                supplier: supplier,
                originalRow: row,
                originalValues: originalValues
            };

            // 至少要有一个非空字段
            if (item.name || item.model || item.value || item.category || item.supplierPart || item.primaryCategory) {
                bomItems.push(item);
            }
        }

        return bomItems;
    }

    // 执行BOM智能匹配
    performBomMatching(bomItems) {
        const results = [];

        for (const bomItem of bomItems) {
            const matches = this.findMatchingComponents(bomItem);

            results.push({
                bomItem: bomItem,
                matches: matches,
                matched: matches.length > 0
            });
        }

        return results;
    }

    // 提取BOM信息（增强版 - 包含LCSC字段和解析后的参数）
    extractBOMInfo(bomItem) {
        // 映射LCSC主分类到系统分类
        const mappedCategory = this.mapLcscCategory(bomItem.primaryCategory) ||
            (bomItem.category ? bomItem.category.toLowerCase() : '');

        return {
            name: (bomItem.name || '').toString().trim().toLowerCase(),
            model: (bomItem.model || '').toString().trim().toLowerCase(),
            value: (bomItem.value || '').toString().trim().toLowerCase(),
            category: mappedCategory,
            quantity: parseInt(bomItem.quantity) || 1,
            // 新增字段
            primaryCategory: (bomItem.primaryCategory || '').trim(),
            parsedParams: bomItem.parsedParams || {},
            description: (bomItem.description || '').trim(),
            supplierPart: (bomItem.supplierPart || '').trim(),
            manufacturerPart: (bomItem.manufacturerPart || '').trim(),
            footprint: (bomItem.footprint || '').trim(),
            manufacturer: (bomItem.manufacturer || '').trim(),
            supplier: (bomItem.supplier || '').trim()
        };
    }

    // 查找匹配的元器件（恢复版 - 旧版7规则+LCSC预检，全部执行收集）
    findMatchingComponents(bomItem) {
        let allMatches = [];

        // 提取BOM信息并标准化
        const bomInfo = this.extractBOMInfo(bomItem);

        // 智能推断类别（如果没有明确提供且没有LCSC主分类）
        if (!bomInfo.category || bomInfo.category === '') {
            bomInfo.category = this.inferCategory(bomItem);
        }

        // 定义所有匹配规则：LCSC预检 + 旧版7规则 + 类别兜底
        const matchRules = [
            // LCSC预检（最高优先级）
            { rule: () => this.supplierPartMatch(bomInfo), name: 'LCSC料号精确匹配' },
            { rule: () => this.manufacturerPartMatch(bomInfo), name: '厂商型号精确匹配' },
            // 旧版7规则
            { rule: () => this.exactMatch(bomInfo, 0.95), name: '精确匹配' },
            { rule: () => this.categoryExactMatch(bomInfo, 0.88), name: '类别精确匹配' },
            { rule: () => this.modelMatch(bomInfo, 0.85), name: '型号匹配' },
            { rule: () => this.nameModelMatch(bomInfo, 0.75), name: '名称+型号组合匹配' },
            { rule: () => this.valueCategoryMatch(bomInfo, 0.75), name: '规格值+类别匹配' },
            { rule: () => this.semanticMatch(bomInfo, 0.55), name: '语义相似匹配' },
            // 类别兜底
            { rule: () => this.categoryMatch(bomInfo, 0.35), name: '类别匹配（仅供参考）' }
        ];

        // 执行所有匹配规则，收集置信度>=0.7的候选
        for (const { rule, name } of matchRules) {
            const result = rule();
            const results = Array.isArray(result) ? result : (result ? [result] : []);

            for (const match of results) {
                if (match && match.component && match.confidence >= 0.7) {
                    const isDuplicate = allMatches.some(m => m.component.id === match.component.id);
                    if (!isDuplicate) {
                        if (!match.reasons.includes(name)) {
                            match.reasons.push(name);
                        }
                        allMatches.push(match);
                    }
                }
            }
        }

        // 按置信度降序排序
        allMatches.sort((a, b) => b.confidence - a.confidence);

        // ===== 封装排序/过滤：BOM有封装时，按封装匹配度调整顺序 =====
        if (bomInfo.footprint && allMatches.length > 1) {
            const bomFp = this.normalizeFootprint(bomInfo.footprint);
            const bomBase = this.extractBaseFootprint(bomFp);

            // 为每个匹配计算封装匹配分（0-1），加到置信度上作为排序依据
            for (const m of allMatches) {
                const compFp = this.normalizeFootprint(m.component.model || '');
                let fpScore = 0;
                if (bomFp && compFp) {
                    if (bomFp === compFp) {
                        fpScore = 1.0;
                    } else if (compFp.includes(bomFp) || bomFp.includes(compFp)) {
                        fpScore = 0.9;
                    } else if (bomBase && (compFp.includes(bomBase) || bomBase.includes(compFp))) {
                        fpScore = 0.8;
                    }
                }
                m._fpScore = fpScore;
            }

            // Group A（电阻/电容/电感/晶振）：有封装匹配的结果时，过滤掉不匹配的
            if (this.isParametricCategory(bomInfo.category)) {
                const hasFpMatch = allMatches.some(m => m._fpScore >= 0.8);
                if (hasFpMatch) {
                    allMatches = allMatches.filter(m => m._fpScore >= 0.8);
                }
            }

            // 按（封装匹配分, 置信度）降序排列
            allMatches.sort((a, b) => (b._fpScore - a._fpScore) || (b.confidence - a.confidence));
        }

        return allMatches;
    }

    // 标准化封装字符串
    normalizeFootprint(fp) {
        return fp.toLowerCase().replace(/[\s-_]/g, '');
    }

    // 提取基础封装名（如 "SOT-223-3_L6.7-W3.7" → "sot223", "C0805" → "c0805"）
    extractBaseFootprint(fp) {
        if (!fp) return '';
        // 保留 - 和 _ 作为分割符再提取，避免 "SOT-223-3" → "sot2233"
        const normalized = fp.toLowerCase();
        // 匹配字母+分隔符+数字，然后取前两个段（如 sot-223-3 → sot223, c0805 → c0805）
        const match = normalized.match(/^([a-z]+)[-_.]?(\d+)/);
        if (match) return match[1] + match[2];
        // 提取纯数字封装（如 0805, 1206）
        const numMatch = normalized.match(/^(\d{3,4})/);
        if (numMatch) return numMatch[1];
        return normalized.replace(/[\s-_]/g, '');
    }

    // Level 0: LCSC料号精确匹配
    supplierPartMatch(bomInfo) {
        if (!bomInfo.supplierPart) return null;

        const candidates = [];
        const bomSupplier = bomInfo.supplierPart.toLowerCase().trim();

        for (const component of this.components) {
            // 检查组件的 productCode 或 model 或 name 是否匹配
            const compCodes = [
                (component.productCode || '').toLowerCase().trim(),
                (component.model || '').toLowerCase().trim(),
                (component.name || '').toLowerCase().trim()
            ].filter(Boolean);

            for (const code of compCodes) {
                // 标准化后比较
                const normalizedCode = code.replace(/[\s-_]/g, '');
                const normalizedBom = bomSupplier.replace(/[\s-_]/g, '');
                if (normalizedCode === normalizedBom || code === bomSupplier) {
                    candidates.push({
                        component: component,
                        score: 1.0,
                        confidence: 1.0,
                        reasons: ['LCSC料号精确匹配']
                    });
                    break;
                }
            }
        }

        return candidates.length > 0 ? candidates : null;
    }

    // Level 1: 厂商型号精确匹配
    manufacturerPartMatch(bomInfo) {
        if (!bomInfo.manufacturerPart) return null;

        const candidates = [];
        const bomMfr = this.normalizeString(bomInfo.manufacturerPart);

        for (const component of this.components) {
            const compModel = this.normalizeString(component.model || '');

            if (bomMfr && compModel && bomMfr === compModel) {
                candidates.push({
                    component: component,
                    score: 0.95,
                    confidence: 0.95,
                    reasons: ['厂商型号精确匹配']
                });
            }
        }

        return candidates.length > 0 ? candidates : null;
    }

    // 规则1：精确匹配（恢复旧版）
    exactMatch(bomInfo, confidence) {
        const candidates = [];
        for (const component of this.components) {
            const compInfo = this.extractComponentInfo(component);

            // 精确型号匹配
            if (bomInfo.model && compInfo.model) {
                const bomModel = this.normalizeString(bomInfo.model);
                const compModel = this.normalizeString(compInfo.model);
                if (bomModel === compModel) {
                    candidates.push({
                        component: component, score: confidence, confidence: confidence,
                        reasons: ['精确型号匹配']
                    });
                    continue;
                }
            }

            // 精确名称匹配
            if (bomInfo.name && compInfo.name) {
                const bomName = this.normalizeString(bomInfo.name);
                const compName = this.normalizeString(compInfo.name);
                if (bomName === compName) {
                    candidates.push({
                        component: component, score: confidence, confidence: confidence,
                        reasons: ['精确名称匹配']
                    });
                    continue;
                }
            }

            // 规格值+类别匹配（针对电阻、电容等 — 增强版：优先用p1精准匹配）
            if (this.matchCategory(bomInfo.category, compInfo.category) &&
                (bomInfo.value || bomInfo.name)) {
                const bestBomValue = this.getBestBomValue(bomInfo, compInfo.category) || bomInfo.value;
                if (bestBomValue) {
                    // 尝试用 p1 精确匹配（更精准）
                    const primaryParam = this.getPrimaryParamValue(component);
                    if (primaryParam && primaryParam.value) {
                        const compValueStr = primaryParam.value + (primaryParam.unit || '');
                        const bomNorm = this.normalizeValue(bestBomValue);
                        const compNorm = this.normalizeValue(compValueStr);
                        if (compNorm && bomNorm && compNorm === bomNorm) {
                            candidates.push({
                                component: component, score: confidence, confidence: confidence,
                                reasons: ['规格值+类别精确匹配']
                            });
                            continue;
                        }
                    }
                    // 降级：用完整文本对比
                    if (compInfo.value) {
                        const bomValue = this.normalizeValue(bestBomValue);
                        const compValue = this.normalizeValue(compInfo.value);
                        if (bomValue && compValue && bomValue === compValue) {
                            candidates.push({
                                component: component, score: confidence, confidence: confidence,
                                reasons: ['规格值+类别精确匹配']
                            });
                            continue;
                        }
                    }
                }
            }

            // 器件编号匹配（针对AMS1117、BISS0001等芯片）
            if (bomInfo.name && compInfo.model) {
                const bomName = this.normalizeString(bomInfo.name);
                const compModel = this.normalizeString(compInfo.model);
                if (bomName === compModel && (bomName.match(/^[a-z]{3,}\d+/i) || bomName.match(/^\d+[a-z]+/i))) {
                    candidates.push({
                        component: component, score: confidence, confidence: confidence,
                        reasons: ['器件编号匹配']
                    });
                }
            }

            // 品牌匹配（Manufacturer → brand，作为辅助匹配信号）
            if (bomInfo.manufacturer && compInfo.brand &&
                this.normalizeString(bomInfo.manufacturer) === this.normalizeString(compInfo.brand)) {
                // 如果已经有其他匹配结果，加一个品牌匹配的理由
                // 如果没有其他匹配，且品类也匹配，算一个低置信度匹配
                const existingMatch = candidates.find(c => c.component.id === component.id);
                if (existingMatch) {
                    if (!existingMatch.reasons.includes('品牌匹配')) {
                        existingMatch.reasons.push('品牌匹配');
                    }
                } else if (this.matchCategory(bomInfo.category, compInfo.category)) {
                    candidates.push({
                        component: component, score: confidence * 0.7, confidence: confidence * 0.7,
                        reasons: ['品牌+类别匹配']
                    });
                }
            }
        }
        return candidates.length > 0 ? candidates : null;
    }

    // 规则2：型号匹配（恢复旧版，返回多候选）
    modelMatch(bomInfo, confidence) {
        const candidates = [];
        for (const component of this.components) {
            const compInfo = this.extractComponentInfo(component);
            if (!bomInfo.model || !compInfo.model) continue;
            const bomModel = this.normalizeString(bomInfo.model);
            const compModel = this.normalizeString(compInfo.model);
            if (bomModel === compModel || bomModel.includes(compModel) || compModel.includes(bomModel)) {
                const similarity = this.levenshteinDistance(bomModel, compModel);
                candidates.push({
                    component: component, score: confidence * similarity,
                    confidence: confidence * similarity, reasons: ['型号匹配']
                });
            }
        }
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.confidence - a.confidence);
            return candidates;
        }
        return null;
    }

    // 规则3：类别精确匹配（恢复旧版 + 品类感知增强）
    categoryExactMatch(bomInfo, confidence) {
        if (!bomInfo.category || bomInfo.category === '') return null;
        const candidates = [];
        for (const component of this.components) {
            const compInfo = this.extractComponentInfo(component);
            if (!this.matchCategory(bomInfo.category, compInfo.category)) continue;

            // 品类感知匹配：Group A用p1参数对比，Group B用名称对比
            if (this.isParametricCategory(bomInfo.category)) {
                // Group A：用 p1 主参数对比
                const primaryParam = this.getPrimaryParamValue(component);
                const bestBomValue = this.getBestBomValue(bomInfo, bomInfo.category);
                if (primaryParam && primaryParam.value && bestBomValue) {
                    const compValueStr = primaryParam.value + (primaryParam.unit || '');
                    const bomNorm = this.normalizeValue(bestBomValue);
                    const compNorm = this.normalizeValue(compValueStr);
                    if (compNorm && bomNorm && compNorm === bomNorm) {
                        candidates.push({
                            component: component, score: confidence, confidence: confidence,
                            reasons: ['类别+规格精确匹配']
                        });
                        continue;
                    }
                }
                // 降级：用完整文本
                if (bomInfo.value && compInfo.value) {
                    const bomValue = this.normalizeValue(bomInfo.value);
                    const compValue = this.normalizeValue(compInfo.value);
                    if (bomValue === compValue) {
                        candidates.push({
                            component: component, score: confidence * 0.9, confidence: confidence * 0.9,
                            reasons: ['类别+规格匹配(降级)']
                        });
                        continue;
                    }
                }
            } else if (this.isModelNamedCategory(bomInfo.category)) {
                // Group B：名称精确匹配
                if (bomInfo.name && compInfo.name &&
                    this.normalizeString(bomInfo.name) === this.normalizeString(compInfo.name)) {
                    candidates.push({
                        component: component, score: confidence, confidence: confidence,
                        reasons: ['类别+名称精确匹配']
                    });
                    continue;
                }
            }

            // 旧版兜底：名称模糊匹配（所有品类）
            if (bomInfo.name && compInfo.name) {
                const nameScore = this.fuzzyMatchAdvanced(bomInfo.name, compInfo.name);
                if (nameScore > 0.6) {
                    candidates.push({
                        component: component, score: confidence * nameScore,
                        confidence: confidence * nameScore, reasons: ['类别+名称匹配']
                    });
                }
            }
        }
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.confidence - a.confidence);
            return candidates;
        }
        return null;
    }

    // 规则4：名称+型号组合匹配（恢复旧版）
    nameModelMatch(bomInfo, confidence) {
        let bestMatch = null, bestScore = 0;
        for (const component of this.components) {
            const compInfo = this.extractComponentInfo(component);
            let nameScore = 0;
            if (bomInfo.name && compInfo.name) {
                nameScore = this.fuzzyMatchAdvanced(bomInfo.name, compInfo.name);
            }
            let modelScore = 0;
            if (bomInfo.model && compInfo.model) {
                modelScore = this.fuzzyMatchAdvanced(bomInfo.model, compInfo.model);
            }
            const totalScore = (nameScore * 0.4) + (modelScore * 0.6);
            if (totalScore > bestScore && totalScore > 0.6) {
                bestScore = totalScore;
                bestMatch = {
                    component: component, score: totalScore * confidence,
                    confidence: totalScore * confidence,
                    reasons: nameScore > 0 ? ['名称匹配', '型号匹配'] : ['型号匹配']
                };
            }
        }
        return bestMatch;
    }

    // 规则6：语义相似匹配（恢复旧版）
    semanticMatch(bomInfo, confidence) {
        let bestMatch = null, bestScore = 0;
        const bomText = this.buildSearchText(bomInfo);
        for (const component of this.components) {
            const compInfo = this.extractComponentInfo(component);
            const compText = this.buildSearchText(compInfo);
            const score = this.calculateSimilarity(bomText, compText);
            if (score > bestScore && score > 0.5) {
                bestScore = score;
                bestMatch = {
                    component: component, score: score * confidence,
                    confidence: score * confidence,
                    reasons: ['语义匹配 (' + (score * 100).toFixed(0) + '%)']
                };
            }
        }
        return bestMatch;
    }

    // 降级：规格值+类别匹配（增强版：按品类差异化匹配）
    valueCategoryMatch(bomInfo, confidence) {
        let candidates = [];
        const category = bomInfo.category || '';
        const valueSources = [
            bomInfo.value,
            bomInfo.name
        ].filter(v => v && v.length > 0);

        for (const component of this.components) {
            const compInfo = this.extractComponentInfo(component);

            // 如果有品类，必须匹配
            if (category && !this.matchCategory(category, compInfo.category)) continue;

            const detectedCategory = category || compInfo.category;
            const compPrimaryParam = this.getPrimaryParamValue(component);
            const bestBomValue = this.getBestBomValue(bomInfo, detectedCategory);

            // ===== Group A: 参数驱动型（电阻/电容/电感/晶振）=====
            if (this.isParametricCategory(detectedCategory)) {
                // 核心：用 p1（阻值/容值/电感量）+ normalizeValue 对比
                if (compPrimaryParam && compPrimaryParam.value && bestBomValue) {
                    const compValueStr = compPrimaryParam.value + (compPrimaryParam.unit || '');
                    const compNorm = this.normalizeValue(compValueStr);
                    const bomNorm = this.normalizeValue(bestBomValue);
                    if (compNorm && bomNorm && compNorm === bomNorm) {
                        candidates.push({
                            component: component,
                            score: confidence * 0.95,
                            confidence: confidence * 0.95,
                            reasons: [category ? '品类+主规格值匹配' : '主规格值匹配']
                        });
                        continue;
                    }
                }
                // 降级：用完整文本尝试（兼容旧数据或非标格式）
                for (const src of valueSources) {
                    if (!compInfo.value) continue;
                    const bomValue = this.normalizeValue(src);
                    const compValue = this.normalizeValue(compInfo.value);
                    if (bomValue && compValue && bomValue === compValue) {
                        candidates.push({
                            component: component,
                            score: confidence * (category ? 0.85 : 0.8),
                            confidence: confidence * (category ? 0.85 : 0.8),
                            reasons: [category ? '品类+规格值匹配(降级)' : '规格值匹配(降级)']
                        });
                        break;
                    }
                }

            // ===== Group B: 型号命名型（IC/二极管/三极管/MOSFET）=====
            } else if (this.isModelNamedCategory(detectedCategory)) {
                // 优先精确名称匹配（IC 的 name 就是型号）
                if (bomInfo.name && compInfo.name &&
                    this.normalizeString(bomInfo.name) === this.normalizeString(compInfo.name)) {
                    candidates.push({
                        component: component,
                        score: confidence * 0.9,
                        confidence: confidence * 0.9,
                        reasons: ['品类+名称匹配']
                    });
                    continue;
                }
                // 如果有结构化参数，也尝试参数对比
                if (compPrimaryParam && compPrimaryParam.value && bestBomValue) {
                    const compValueStr = compPrimaryParam.value + (compPrimaryParam.unit || '');
                    const compNorm = this.normalizeValue(compValueStr);
                    const bomNorm = this.normalizeValue(bestBomValue);
                    if (compNorm && bomNorm && compNorm === bomNorm) {
                        candidates.push({
                            component: component,
                            score: confidence * 0.85,
                            confidence: confidence * 0.85,
                            reasons: ['品类+规格值匹配']
                        });
                        continue;
                    }
                }

            // ===== Group C: 描述型（开关/LED/其他）=====
            } else {
                // 基础的值对比
                for (const src of valueSources) {
                    if (!compInfo.value) continue;
                    const bomValue = this.normalizeValue(src);
                    const compValue = this.normalizeValue(compInfo.value);
                    if (bomValue && compValue && bomValue === compValue) {
                        candidates.push({
                            component: component,
                            score: confidence * 0.85,
                            confidence: confidence * 0.85,
                            reasons: [category ? '品类+规格值匹配' : '规格值匹配']
                        });
                        break;
                    }
                }
            }
        }

        if (candidates.length > 0) return candidates;
        return null;
    }


    // 智能推断类别
    inferCategory(bomItem) {
        const name = (bomItem.name || '').toLowerCase();
        const model = (bomItem.model || '').toLowerCase();
        const value = (bomItem.value || '').toLowerCase();
        const category = (bomItem.category || '').toLowerCase();
        const combined = `${name} ${model} ${value} ${category}`;

        // 优先使用明确的类别字段
        if (category.includes('电容') || category.includes('capacitor')) {
            return 'capacitor';
        }
        if (category.includes('电阻') || category.includes('resistor')) {
            return 'resistor';
        }
        if (category.includes('电感') || category.includes('inductor')) {
            return 'inductor';
        }
        if (category.includes('二极管') || category.includes('diode')) {
            return 'diode';
        }
        if (category.includes('传感器') || category.includes('sensor')) {
            return 'sensor';
        }
        if (category.includes('三极管') || category.includes('transistor') || category.includes('mosfet')) {
            return category.includes('mos') ? 'mosfet' : 'transistor';
        }
        if (category.includes('电源') || category.includes('稳压') || category.includes('ic') || category.includes('芯片')) {
            return 'ic';
        }
        if (category.includes('开关') || category.includes('switch')) {
            return 'switch';
        }
        if (category.includes('连接器') || category.includes('connector')) {
            return 'connector';
        }

        // 电容关键词
        if (combined.includes('电容') || value.match(/\d+[numkμp]?f/i) ||
            combined.includes('cap') || combined.includes('condenser') ||
            combined.includes('ceramic') || combined.includes('electrolytic')) {
            return 'capacitor';
        }

        // 电阻关键词
        if (combined.includes('电阻') || value.match(/\d+(\.[0-9]+)?[kmgωΩ]?[ωΩ]?/i) ||
            combined.includes('res') || combined.includes('r') ||
            combined.includes('carbon') || combined.includes('film') ||
            combined.includes('potentiometer') || combined.includes('trimmer')) {
            return 'resistor';
        }

        // 电感关键词
        if (combined.includes('电感') || combined.includes('inductor') ||
            value.match(/\d+(\.[0-9]+)?[μnm]h/i) ||
            combined.includes('coil')) {
            return 'inductor';
        }

        // 二极管关键词
        if (combined.includes('二极管') || combined.includes('diode') ||
            model.match(/^1n[0-9]+$/i) || model.match(/^bat\d+/i) ||
            combined.includes('rectifier') || combined.includes('schottky') ||
            combined.includes('zener') || combined.includes('led')) {
            return 'diode';
        }

        // 传感器关键词（映射到 other 分类）
        if (combined.includes('传感器') || combined.includes('sensor') ||
            combined.includes('pir') || combined.includes('thermistor') ||
            combined.includes('photoresistor') || combined.includes('hall')) {
            return 'other';
        }

        // 三极管/MOSFET关键词
        if (combined.includes('三极管') || combined.includes('transistor') ||
            combined.includes('mos') || combined.includes('mosfet') || combined.includes('fet') ||
            combined.includes('bjt') || combined.includes('npn') || combined.includes('pnp')) {
            return model.includes('mos') || combined.includes('mosfet') ? 'mosfet' : 'transistor';
        }

        // IC/集成电路关键词
        if (combined.includes('芯片') || combined.includes('ic') || combined.includes('集成电路') ||
            combined.includes('芯片ic') || combined.includes('稳压') || combined.includes('电源') ||
            combined.includes('dc-dc') || combined.includes('ldo') || combined.includes('opamp') ||
            combined.includes('运算放大') || combined.includes('放大器') ||
            combined.includes('regulator') || combined.includes('converter') ||
            combined.includes('biss') || combined.includes('555') ||
            model.match(/^[a-z]{2,}\d+.*$/i) && model.length < 10) { // 简短型号通常是IC
            return 'ic';
        }

        // 晶振关键词
        if (combined.includes('晶振') || combined.includes('crystal') || combined.includes('oscillator') || combined.includes('xtal')) {
            return 'crystal';
        }

        // 开关关键词
        if (combined.includes('开关') || combined.includes('switch') || combined.includes('sw') ||
            combined.includes('button') || combined.includes('toggle')) {
            return 'switch';
        }

        // 连接器关键词（映射到 other 分类）
        if (combined.includes('连接器') || combined.includes('connector') ||
            combined.includes('header') || combined.includes('terminal') ||
            combined.includes('jack') || combined.includes('plug')) {
            return 'other';
        }

        // 继电器关键词（映射到 other 分类）
        if (combined.includes('继电器') || combined.includes('relay')) {
            return 'other';
        }

        // 变压器关键词（映射到 other 分类）
        if (combined.includes('变压器') || combined.includes('transformer')) {
            return 'other';
        }

        return ''; // 无法推断
    }

    // 规则7：类别匹配（兜底）- 保留原逻辑
    categoryMatch(bomInfo, confidence) {
        for (const component of this.components) {
            const compInfo = this.extractComponentInfo(component);

            if (this.matchCategory(bomInfo.category, compInfo.category)) {
                return {
                    component: component,
                    score: confidence,
                    confidence: confidence,
                    reasons: ['类别匹配（仅供参考）']
                };
            }
        }

        return null;
    }

    // 提取元器件信息
    extractComponentInfo(component) {
        return {
            name: (component.name || '').toLowerCase(),
            model: (component.model || '').toLowerCase(),
            category: (component.category || '').toLowerCase(),
            value: (this.getComponentValueText(component) || '').toLowerCase(),
            stock: component.stock || 0,
            notes: (component.notes || '').toLowerCase(),
            brand: (component.brand || '').toLowerCase()
        };
    }

    // ===== 品类差异化匹配辅助方法 =====

    // 判断是否为参数驱动型品类（Group A：电阻/电容/电感/晶振）
    isParametricCategory(category) {
        if (!category) return false;
        const cat = category.toLowerCase();
        return ['resistor', 'capacitor', 'inductor', 'crystal'].includes(cat);
    }

    // 判断是否为型号命名型品类（Group B：IC/二极管/三极管/MOSFET）
    isModelNamedCategory(category) {
        if (!category) return false;
        const cat = category.toLowerCase();
        return ['ic', 'diode', 'transistor', 'mosfet'].includes(cat);
    }

    // 提取组件的主要参数值（p1），如阻值/电容值/电感量（不含次参数如功率/电压）
    getPrimaryParamValue(component) {
        const extractFromParams = (params) => {
            if (!Array.isArray(params) || params.length === 0) return null;
            // 优先找 p1、或阻值/电容值/电感量标签的参数
            const p1 = params.find(p => p.id === 'p1')
                || params.find(p => p.label && ['阻值', '电容值', '电感量', '电感值', '标称频率'].includes(p.label))
                || params.find(p => p.value && p.value !== '');
            if (p1 && p1.value) {
                return { value: p1.value, unit: p1.unit || '' };
            }
            return null;
        };

        // 优先从 params 字段提取
        if (component.params) {
            try {
                const params = typeof component.params === 'string'
                    ? JSON.parse(component.params) : component.params;
                const result = extractFromParams(params);
                if (result) return result;
            } catch (e) {}
        }
        // 兼容旧数据：从 value 字段提取
        if (component.value) {
            try {
                const parsed = typeof component.value === 'string'
                    ? JSON.parse(component.value) : component.value;
                const result = extractFromParams(parsed);
                if (result) return result;
            } catch (e) {}
        }
        return null;
    }

    // 从BOM提取最佳参数值（优先级：value列 > Description > name列）
    getBestBomValue(bomInfo, category) {
        // 1. Value列（LCSC标准格式中Value列就是阻值/容值/电感量/频率）
        if (bomInfo.value && /[\d.]+/.test(bomInfo.value)) {
            return bomInfo.value;
        }
        // 2. Description 解析参数（如 "容值:10uF;精度:±10%;"）
        if (bomInfo.parsedParams && typeof bomInfo.parsedParams === 'object') {
            const params = bomInfo.parsedParams;
            // 根据品类找对应的 key
            const valueKeyMap = {
                'resistor': ['阻值', '电阻值', 'resistance'],
                'capacitor': ['容值', '电容值', 'capacitance'],
                'inductor': ['电感量', '电感值', 'inductance'],
                'crystal': ['频率', 'freq', 'frequency']
            };
            const keys = valueKeyMap[category] || [];
            for (const key of keys) {
                if (params[key] && /[\d.]+/.test(params[key])) {
                    return params[key];
                }
            }
            // 如未找到品类匹配的key，取第一个有数值的参数
            for (const val of Object.values(params)) {
                if (typeof val === 'string' && /[\d.]+/.test(val)) {
                    return val;
                }
            }
        }
        // 3. name列（最后兜底：Name/Comment通常是类别/名称，但也偶有含参数值的混合情况）
        //    只有 name 以数字+单位开头时才尝试提取（如 "10uF贴片电容" 提取 "10uF"）
        if (bomInfo.name && /^[\d.]+[kKmMμunp]?[ΩωFfHhVvAaWw]?/i.test(bomInfo.name)) {
            return bomInfo.name;
        }
        return null;
    }

    // 构建搜索文本
    buildSearchText(info) {
        return [
            info.name,
            info.model,
            info.value,
            info.notes
        ].filter(Boolean).join(' ').toLowerCase();
    }

    // 字符串标准化
    normalizeString(str) {
        return str.toLowerCase()
                  .replace(/\s+/g, '')
                  .replace(/[-_]/g, '');
    }

    // 数值标准化（带单位换算）
    normalizeValue(value) {
        if (!value) return '';

        // 先做基础替换
        let normalized = value.toLowerCase()
                           .replace(/[μu]/g, 'u')
                           .replace(/[ωΩ]/g, '')
                           .replace(/\s+/g, '')
                           .replace(/,/g, '.');

        // 提取数值和单位部分
        const match = normalized.match(/^([0-9.]+)(.*)$/);

        if (match) {
            let numStr = match[1];
            let unit = match[2];

            // 将数值部分转换为浮点数
            let num = parseFloat(numStr);

            if (!isNaN(num)) {
                // 单位换算系数（按优先级排序，更具体的单位在前面）
                const unitFactors = [
                    // 电容单位（基准：uf - 微法）
                    { unit: 'pf', factor: 0.000001 },    // 皮法 → 微法
                    { unit: 'nf', factor: 0.001 },        // 纳法 → 微法
                    { unit: 'uf', factor: 1 },            // 微法 → 微法（基准）
                    { unit: 'mf', factor: 1000 },         // 毫法 → 微法
                    { unit: 'f', factor: 1000000 },       // 法拉 → 微法

                    // 电阻单位（基准：ohm - 欧姆）
                    { unit: 'meg', factor: 1000000 },     // 兆欧 → 欧姆
                    { unit: 'k', factor: 1000 },          // 千欧 → 欧姆
                    { unit: 'm', factor: 0.001 },         // 毫欧 → 欧姆（注意：要放在最后）

                    // 电感单位（基准：uh - 微亨）
                    { unit: 'ph', factor: 0.000001 },     // 皮亨 → 微亨
                    { unit: 'nh', factor: 0.001 },        // 纳亨 → 微亨
                    { unit: 'uh', factor: 1 },            // 微亨 → 微亨（基准）
                    { unit: 'mh', factor: 1000 },         // 毫亨 → 微亨
                    { unit: 'h', factor: 1000000 },       // 亨利 → 微亨

                    // 电流单位（基准：ma - 毫安）
                    { unit: 'ua', factor: 0.001 },        // 微安 → 毫安
                    { unit: 'ma', factor: 1 },            // 毫安 → 毫安（基准）
                    { unit: 'a', factor: 1000 },          // 安培 → 毫安

                    // 电压单位（基准：v - 伏特）
                    { unit: 'mv', factor: 0.001 },        // 毫伏 → 伏特
                    { unit: 'v', factor: 1 },             // 伏特 → 伏特（基准）
                    { unit: 'kv', factor: 1000 },         // 千伏 → 伏特
                ];

                // 查找匹配的单位系数
                let factor = 1;
                for (const { unit: u, factor: f } of unitFactors) {
                    if (unit.startsWith(u)) {
                        factor = f;
                        // 保留单位后缀（如百分比等）
                        const unitSuffix = unit.slice(u.length);
                        unit = u + unitSuffix;
                        break;
                    }
                }

                // 转换为基准单位的数值
                const convertedNum = num * factor;

                // 根据转换后的数值大小，选择合适的显示单位
                // 电容：转换到微法（uf）
                if (unit.includes('f')) {
                    const baseValue = convertedNum; // 已经是uf
                    if (baseValue >= 1) {
                        num = baseValue;
                        unit = 'uf';
                    } else if (baseValue >= 0.001) {
                        num = baseValue / 0.001;
                        unit = 'nf';
                    } else {
                        num = baseValue / 0.000001;
                        unit = 'pf';
                    }
                }
                // 电阻：转换到欧姆
                else if (unit.includes('k') || unit.includes('m') || unit.includes('meg')) {
                    const baseValue = convertedNum; // 已经是ohm
                    if (baseValue >= 1000000) {
                        num = baseValue / 1000000;
                        unit = 'meg';
                    } else if (baseValue >= 1000) {
                        num = baseValue / 1000;
                        unit = 'k';
                    } else {
                        num = baseValue;
                        unit = '';
                    }
                }
                // 电感：转换到微亨
                else if (unit.includes('h') && !unit.includes('mah') && !unit.includes('uh')) {
                    const baseValue = convertedNum; // 已经是uh
                    if (baseValue >= 1) {
                        num = baseValue;
                        unit = 'uh';
                    } else if (baseValue >= 0.001) {
                        num = baseValue / 0.001;
                        unit = 'nh';
                    } else {
                        num = baseValue / 0.000001;
                        unit = 'ph';
                    }
                }

                // 格式化数值（去掉不必要的小数点）
                if (Number.isInteger(num)) {
                    numStr = num.toString();
                } else {
                    // 最多保留6位小数，避免精度问题
                    numStr = parseFloat(num.toPrecision(10)).toString();
                }

                normalized = numStr + unit;
            }
        }

        return normalized;
    }

    // 高级模糊匹配（使用编辑距离）
    fuzzyMatchAdvanced(str1, str2) {
        if (!str1 || !str2) return 0;

        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();

        if (s1 === s2) return 1;

        if (s1.includes(s2) || s2.includes(s1)) return 0.85;

        // 计算编辑距离
        const distance = this.levenshteinDistance(s1, s2);
        const maxLength = Math.max(s1.length, s2.length);
        return 1 - (distance / maxLength);
    }

    // Levenshtein距离算法
    levenshteinDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,
                        dp[i][j - 1] + 1,
                        dp[i - 1][j - 1] + 1
                    );
                }
            }
        }

        return dp[m][n];
    }

    // 计算相似度
    calculateSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;

        const words1 = text1.split(/\s+/);
        const words2 = text2.split(/\s+/);

        let matches = 0;
        for (const word of words1) {
            if (word.length > 2 && words2.some(w => w.includes(word) || word.includes(w))) {
                matches++;
            }
        }

        return matches / Math.max(words1.length, 1);
    }

    // 分类匹配
    matchCategory(bomCategory, componentCategory) {
        if (!bomCategory || !componentCategory) return false;

        const bomLower = bomCategory.toLowerCase();
        const compLower = componentCategory.toLowerCase();

        // 直接匹配
        if (bomLower === compLower) return true;

        // 电容类别
        if ((bomLower.includes('电容') || bomLower.includes('capacitor')) &&
            (compLower.includes('电容') || compLower.includes('capacitor'))) {
            return true;
        }

        // 电阻类别
        if ((bomLower.includes('电阻') || bomLower.includes('resistor')) &&
            (compLower.includes('电阻') || compLower.includes('resistor'))) {
            return true;
        }

        // 电感类别
        if ((bomLower.includes('电感') || bomLower.includes('inductor')) &&
            (compLower.includes('电感') || compLower.includes('inductor'))) {
            return true;
        }

        // 二极管类别
        if ((bomLower.includes('二极管') || bomLower.includes('diode')) &&
            (compLower.includes('二极管') || compLower.includes('diode'))) {
            return true;
        }

        // IC类别（包括电源、稳压等）
        if ((bomLower.includes('电源') || bomLower.includes('稳压') || bomLower.includes('ic') ||
             bomLower.includes('芯片') || bomLower.includes('集成电路') ||
             bomLower.includes('regulator') || bomLower.includes('converter')) &&
            (compLower.includes('ic'))) {
            return true;
        }

        // 传感器类别
        if ((bomLower.includes('传感器') || bomLower.includes('sensor') || bomLower.includes('pir')) &&
            (compLower.includes('sensor') || compLower.includes('ic'))) {
            return true;
        }

        // 开关/按键类别
        if ((bomLower.includes('开关') || bomLower.includes('switch') || bomLower.includes('按键')) &&
            (compLower.includes('switch') || compLower.includes('按键'))) {
            return true;
        }

        // 晶振/谐振器类别
        if ((bomLower.includes('晶振') || bomLower.includes('crystal') || bomLower.includes('谐振器') || bomLower.includes('oscillator')) &&
            (compLower.includes('crystal') || compLower.includes('oscillator'))) {
            return true;
        }

        // 三极管/MOSFET类别
        if ((bomLower.includes('三极管') || bomLower.includes('transistor') ||
             bomLower.includes('mosfet') || bomLower.includes('mos') || bomLower.includes('场效应')) &&
            (compLower.includes('transistor') || compLower.includes('mosfet'))) {
            return true;
        }

        // 连接器/接插件类别
        if ((bomLower.includes('连接器') || bomLower.includes('connector') || bomLower.includes('接插件') ||
             bomLower.includes('排母') || bomLower.includes('排针') || bomLower.includes('端子')) &&
            (compLower.includes('connector') || compLower.includes('接插件') || compLower.includes('端子'))) {
            return true;
        }

        // LED/光电器件类别
        if ((bomLower.includes('led') || bomLower.includes('发光') || bomLower.includes('光电器件') ||
             bomLower.includes('光耦') || bomLower.includes('光电')) &&
            (compLower.includes('led') || compLower.includes('光'))) {
            return true;
        }

        // 继电器类别
        if ((bomLower.includes('继电器') || bomLower.includes('relay')) &&
            (compLower.includes('relay') || compLower.includes('继电器'))) {
            return true;
        }

        return false;
    }

    // 分类包含关键词
    categoryContainsKeyword(componentCategory, keyword) {
        const categoryKeywords = {
            'resistor': ['电阻', 'resistor', 'res'],
            'capacitor': ['电容', 'capacitor', 'cap', 'c'],
            'inductor': ['电感', 'inductor', 'ind', 'l'],
            'transistor': ['三极管', 'transistor', 'q', 'bjt'],
            'mosfet': ['mos', 'mosfet', '场效应', 'fet'],
            'diode': ['二极管', 'diode', 'd'],
            'ic': ['ic', '集成电路', '芯片', 'chip', 'u'],
            'switch': ['开关', 'switch', 'sw'],
            'crystal': ['晶振', 'crystal', 'oscillator', 'xtal']
        };

        const keywords = categoryKeywords[componentCategory] || [];
        const keywordLower = keyword.toLowerCase();

        return keywords.some(kw => keywordLower.includes(kw.toLowerCase()));
    }

    // 文本匹配
    textMatch(text1, text2) {
        if (!text1 || !text2) return false;

        const t1 = text1.toLowerCase();
        const t2 = text2.toLowerCase();

        // 完全匹配
        if (t1 === t2) return true;

        // 包含匹配
        if (t1.includes(t2) || t2.includes(t1)) return true;

        return false;
    }

    // 参数值匹配
    valueMatch(value1, value2) {
        if (!value1 || !value2) return false;

        const v1 = value1.toLowerCase().replace(/\s/g, '');
        const v2 = value2.toLowerCase().replace(/\s/g, '');

        // 完全匹配
        if (v1 === v2) return true;

        // 包含匹配
        if (v1.includes(v2) || v2.includes(v1)) return true;

        // 提取数字和单位进行比较
        const numMatch1 = v1.match(/(\d+\.?\d*)([kμmunpf]?[ωhzfv]*)/i);
        const numMatch2 = v2.match(/(\d+\.?\d*)([kμmunpf]?[ωhzfv]*)/i);

        if (numMatch1 && numMatch2) {
            const num1 = parseFloat(numMatch1[1]);
            const num2 = parseFloat(numMatch2[1]);
            const unit1 = numMatch1[2].toLowerCase();
            const unit2 = numMatch2[2].toLowerCase();

            if (num1 === num2 && unit1 === unit2) {
                return true;
            }
        }

        return false;
    }

    // 模糊匹配
    fuzzyMatch(bomText, component) {
        let score = 0;
        const compText = `${component.name} ${component.model} ${this.getComponentValueText(component)}`.toLowerCase();

        // 提取关键词
        const bomKeywords = this.extractKeywords(bomText);
        const compKeywords = this.extractKeywords(compText);

        // 计算关键词匹配度
        for (const keyword of bomKeywords) {
            if (compKeywords.some(k => k.includes(keyword) || keyword.includes(k))) {
                score += 0.5;
            }
        }

        return score;
    }

    // 提取关键词
    extractKeywords(text) {
        // 移除特殊字符，分割成单词
        const words = text.replace(/[^\w\u4e00-\u9fa5]/g, ' ').split(/\s+/);
        
        // 过滤掉太短的词和常见停用词
        const stopWords = ['的', '是', '在', '和', '与', 'the', 'and', 'or', 'of', 'in', 'at'];
        
        return words
            .filter(word => word.length > 1 && !stopWords.includes(word.toLowerCase()))
            .filter(word => !/^\d+$/.test(word)); // 移除纯数字
    }

    // 显示BOM匹配结果（增强版 - 显示匹配来源详情）
    displayBomMatchResults(results) {
        const container = document.getElementById('bomMatchList');

        // 统计信息
        const matched = results.filter(r => r.matches.length > 0 && r.matches[0].confidence >= 0.85).length;
        const partial = results.filter(r => r.matches.length > 0 && r.matches[0].confidence >= 0.6 && r.matches[0].confidence < 0.85).length;
        const noMatch = results.filter(r => r.matches.length === 0 || r.matches[0].confidence < 0.6).length;

        // 更新统计数字
        document.getElementById('bomMatchFull').textContent = matched;
        document.getElementById('bomMatchPartial').textContent = partial;
        document.getElementById('bomMatchNone').textContent = noMatch;

        container.innerHTML = '';

        results.forEach((result, index) => {
            const item = result.bomItem;
            const matches = result.matches || [];
            const matchCount = matches.length;

            // 构建显示文本（包含LCSC信息）
            const searchItemParts = [item.name || '未命名'];
            if (item.supplierPart) searchItemParts.push(`料号:${item.supplierPart}`);
            if (item.model) searchItemParts.push(`型号:${item.model}`);
            if (item.value) searchItemParts.push(`参数:${item.value}`);
            if (item.category) searchItemParts.push(`分类:${item.category}`);
            if (item.footprint) searchItemParts.push(item.footprint);
            const searchItemText = searchItemParts.join(' | ');

            const div = document.createElement('div');
            div.className = 'bom-match-item';

            // 根据匹配数量确定状态类（用于边框颜色）
            if (matchCount === 0) {
                div.classList.add('unmatched');
            } else if (matchCount === 1) {
                div.classList.add('matched');
            } else {
                div.classList.add('partial');
            }

            // 匹配数字角标 - 紧凑显示
            let matchBadge = '';
            if (matchCount === 0) {
                matchBadge = '<span class="text-xs font-bold text-red-500 flex-shrink-0 w-4 text-center">0</span>';
            } else if (matchCount === 1) {
                matchBadge = '<span class="text-xs font-bold text-green-500 flex-shrink-0 w-4 text-center">1</span>';
            } else {
                matchBadge = `<span class="text-xs font-bold text-blue-500 flex-shrink-0 w-4 text-center">${matchCount > 9 ? '9+' : matchCount}</span>`;
            }

            div.innerHTML = `
                <div class="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-gray-800/50 rounded transition-colors bom-search-item gap-1" data-bom-index="${index}" title="点击查看匹配的元器件">
                    <div class="flex items-center gap-1 flex-1 min-w-0">
                        <span class="text-xs text-gray-300 truncate leading-tight" title="${searchItemText}">
                            ${item.name || ''}
                            ${item.supplierPart ? `<span class="text-gray-500">#${item.supplierPart}</span>` : ''}
                        </span>
                        ${item.quantity > 1 ? `<span class="text-[10px] bg-gray-700 px-1 py-0.5 rounded flex-shrink-0 leading-none">×${item.quantity}</span>` : ''}
                    </div>
                    ${matchBadge}
                </div>
            `;

            container.appendChild(div);

            // 绑定点击事件
            const searchItem = div.querySelector(`[data-bom-index="${index}"]`);
            if (searchItem) {
                // 点击：跳转到匹配 + 更新可拖动详情窗
                searchItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (matchCount > 0) {
                        this.filterByMatches(matches);
                    }
                    this.updateBomDetailPanel(item);
                });
            }
        });
    }

    // 显示/更新可拖动的待匹配器件详情窗
    updateBomDetailPanel(item) {
        let panel = document.getElementById('bomDetailPanel');
        const panelBody = () => panel.querySelector('.bom-detail-panel-body');

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'bomDetailPanel';
            panel.className = 'bom-detail-panel';
            panel.innerHTML = `
                <div class="bom-detail-panel-header">
                    <span>待匹配器件详情</span>
                    <button class="bom-detail-close-btn">✕</button>
                </div>
                <div class="bom-detail-panel-body"></div>
            `;
            document.body.appendChild(panel);

            // 关闭
            panel.querySelector('.bom-detail-close-btn').addEventListener('click', () => panel.remove());

            // 拖拽
            const header = panel.querySelector('.bom-detail-panel-header');
            let dragging = false, sx, sy, ox, oy;
            header.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('bom-detail-close-btn')) return;
                const r = panel.getBoundingClientRect();
                sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
                dragging = true;
                panel.style.cursor = 'grabbing';
                panel.classList.add('dragging');
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                panel.style.left = (ox + e.clientX - sx) + 'px';
                panel.style.top = (oy + e.clientY - sy) + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            });
            document.addEventListener('mouseup', () => {
                if (dragging) { dragging = false; panel.style.cursor = ''; panel.classList.remove('dragging'); }
            });
        }

        // 构建内容
        const fields = [
            { label: '名称', value: item.name },
            { label: '型号', value: item.model },
            { label: '规格值', value: item.value, hl: true },
            { label: '品类', value: item.category },
            { label: '子分类', value: item.secondaryCategory },
            { label: '封装', value: item.footprint },
            { label: '料号', value: item.supplierPart, hl: true },
            { label: '厂商型号', value: item.manufacturerPart },
            { label: '品牌', value: item.manufacturer },
            { label: '供应商', value: item.supplier },
            { label: '数量', value: item.quantity > 0 ? `×${item.quantity}` : '' }
        ];
        const rows = [];
        for (const f of fields) {
            if (f.value && f.value !== '' && f.value !== '×0') {
                rows.push(`<div class="bom-detail-label">${f.label}</div><div class="bom-detail-value${f.hl ? ' highlight' : ''}">${f.value}</div>`);
            }
        }
        if (item.description) {
            rows.push(`<div class="bom-detail-label" style="align-self:start;margin-top:1px">描述</div><div class="bom-detail-value" style="font-size:11px;color:#9ca3af">${item.description}</div>`);
        }
        panelBody().innerHTML = rows.length > 0
            ? `<div class="bom-detail-grid">${rows.join('')}</div>`
            : '<div style="font-size:12px;color:#9ca3af">暂无详细信息</div>';

        // 首次显示时定位在BOM面板右侧（确保在视口内）
        if (!panel.dataset.positioned) {
            panel.dataset.positioned = '1';
            const bomModal = document.getElementById('bomMatchModal');
            let left = 320, top = 80;
            if (bomModal) {
                const r = bomModal.getBoundingClientRect();
                left = r.right + 12;
                top = r.top;
            }

            // 先显示再计算边界
            panel.style.display = 'block';
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';

            // 确保首次不超出视口
            requestAnimationFrame(() => {
                const pr = panel.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const pad = 8;

                if (pr.right > vw - pad) {
                    if (bomModal) {
                        const r = bomModal.getBoundingClientRect();
                        left = r.left - pr.width - 12;
                    } else {
                        left = vw - pr.width - pad;
                    }
                }
                if (left < pad) left = pad;
                if (pr.bottom > vh - pad) top = vh - pr.height - pad;
                if (top < pad) top = pad;

                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
            });
            return;
        }
        panel.style.display = 'block';
    }

    // 获取字段的中文名称
    getFieldLabel(key) {
        const labelMap = {
            name: '名称',
            model: '型号',
            value: '参数',
            category: '分类',
            quantity: '数量',
            package: '封装',
            manufacturer: '厂商',
            notes: '备注',
            description: '描述',
            partNumber: '料号',
            footprint: '焊盘',
            designator: '位号',
            location: '位置',
            stock: '库存',
            threshold: '阈值',
            unit: '单位',
            price: '价格',
            supplier: '供应商',
            status: '状态',
            date: '日期',
            createdBy: '创建人',
            updatedBy: '更新人',
            createdAt: '创建时间',
            updatedAt: '更新时间',
            id: 'ID'
        };
        
        return labelMap[key] || key;
    }

    // 隐藏BOM项目悬浮提示
    hideBomItemTooltip() {
        const tooltip = document.getElementById('bomItemTooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    // 重置BOM匹配
    resetBomMatch() {
        // 清空缓存
        this.currentBomItems = [];
        this.currentBomMatchResults = [];

        // 清除BOM筛选状态
        this.bomFilteredComponentIds = null;

        document.getElementById('bomUploadArea').classList.remove('hidden');
        document.getElementById('bomMatchResults').classList.add('hidden');
        document.getElementById('bomFileInput').value = '';
        document.getElementById('bomMatchList').innerHTML = '';
        document.getElementById('bomMatchFull').textContent = '0';
        document.getElementById('bomMatchPartial').textContent = '0';
        document.getElementById('bomMatchNone').textContent = '0';
    }

    // 根据匹配结果筛选多个元器件（点击待查找元器件时调用）
    filterByMatches(matches) {
        if (!matches || matches.length === 0) {
            this.showNotification('没有找到匹配的元器件', 'warning');
            return;
        }

        // 获取所有匹配的元器件ID
        const componentIds = matches.map(m => m.component.id);

        // 清空搜索框
        document.getElementById('searchInput').value = '';
        this.searchQuery = '';

        // 重置分类筛选
        document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
        document.querySelector('.category-item[data-category="all"]').classList.add('active');
        this.currentCategory = 'all';

        // 设置临时筛选状态
        this.bomFilteredComponentIds = componentIds;

        // 执行筛选
        this.filterAndRender();

        // 高亮显示所有匹配的元器件卡片
        setTimeout(() => {
            componentIds.forEach((id, idx) => {
                const card = document.querySelector(`[data-component-id="${id}"]`);
                if (card) {
                    if (idx === 0) {
                        // 第一个卡片滚动到视图中央
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    // 高亮动画
                    card.style.animation = 'pulse 2s ease-in-out 3';
                    setTimeout(() => {
                        card.style.animation = '';
                    }, 2000);
                }
            });
        }, 100);

        this.showNotification(`已显示 ${matches.length} 个匹配的元器件`, 'success');
    }

    // 根据元器件ID筛选（从BOM匹配结果中点击查看时调用）
    filterByComponent(componentId) {
        // 清除BOM筛选状态
        this.bomFilteredComponentIds = null;

        // 临时存储筛选状态
        this.bomFilteredComponentId = componentId;

        // 筛选并显示该元器件
        const component = this.components.find(c => c.id === componentId);
        if (component) {
            // 清空搜索框
            document.getElementById('searchInput').value = component.name;
            this.searchQuery = component.name.toLowerCase();

            // 重置分类筛选
            document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
            document.querySelector('.category-item[data-category="all"]').classList.add('active');
            this.currentCategory = 'all';

            // 执行筛选
            this.filterAndRender();

            // 高亮显示该元器件卡片
            setTimeout(() => {
                const card = document.querySelector(`[data-component-id="${componentId}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.style.animation = 'pulse 2s ease-in-out 3';
                    setTimeout(() => {
                        card.style.animation = '';
                    }, 2000);
                }
            }, 100);
        }
    }
}

// 初始化应用
let componentManager;

document.addEventListener('DOMContentLoaded', () => {
    componentManager = new ComponentManager();
    // 暴露 lcscImportManager 到全局，供弹窗中的 onclick 调用
    window.lcscImportManager = componentManager.lcscImportManager;

    // 添加页面加载完成动画
    anime({
        targets: 'header',
        translateY: [-50, 0],
        opacity: [0, 1],
        duration: 800,
        easing: 'easeOutQuart'
    });
    
    anime({
        targets: '.sidebar',
        translateX: [-300, 0],
        opacity: [0, 1],
        duration: 800,
        delay: 200,
        easing: 'easeOutQuart'
    });
    
    anime({
        targets: 'main',
        opacity: [0, 1],
        duration: 1000,
        delay: 400,
        easing: 'easeOutQuart'
    });
    
    anime({
        targets: '.floating-btn',
        scale: [0, 1],
        rotate: [180, 0],
        duration: 600,
        delay: 1000,
        easing: 'easeOutElastic(1, .8)'
    });
});

// 全局函数供HTML调用
window.componentManager = componentManager;