  // 组件库 - 版本更新日志数据
  // 添加新版本时，在此数组顶部添加新对象，保持从新到旧的顺序
  /*版本模板
      {
          version: "v2.3.1",
          date: "2026-06-13",
          badge: "LATEST",//STABLE
          categories: [
              {
                  title: "新功能",
                  color: "text-green-400",
                  items: [
                      "子类别系统：每个元器件品类可设置二级分类，更精细化管理",
                      "分化参数：电阻/电容/电感/MOS管/二极管/三极管/LED/晶振 支持专属参数输入"
                  ]
              },
              {
                  title: "UI/UX 改进",
                  color: "text-blue-400",
                  items: [
                      "元器件展示增加子类别显示（如\"电阻 / 贴片电阻\"）",
                      "参数显示格式优化：如\"1kΩ|1/4W\"紧凑展示"
                  ]
              },
              {
                  title: "Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复批量编辑子类别不显示和分化参数不出现的问题",
                      "修复电容值单位缺少 pF 选项"
                  ]
              }
          ]
      },
    */
  window.CHANGELOG_DATA = [
    {
        version: "v2.3.11",
        date: "2026-08-31",
        badge: "LATEST",//STABLE
        categories: [
            {
                title: "新功能",
                color: "text-green-400",
                items: [
                    "增加LCSC订单导入功能"
                ]
            }
        ]
    },
    {
        version: "v2.3.10",
        date: "2026-07-08",
        badge: "STABLE",
        categories: [
            {
                title: "新功能",
                color: "text-green-400",
                items: [
                    "在元器件详情中增加历史记录按钮，显示该元器件的出入库记录"
                ]
            },
            {
                title: "UI/UX 改进",
                color: "text-blue-400",
                items: [
                    "在类别配置中，显示类别和子类别下的元器件数量，方便管理"
                ]
            },
            {
                title: "Bug 修复",
                color: "text-red-400",
                items: [
                    "在添加元器件时，未选择类别，则参数区域显示灰化的“请先选择类别”提示文本，输入框不可用",
                    "元器件价格精度放宽"
                ]
            }
        ]
    },
    {
          version: "v2.3.9",
          date: "2026-07-04",
          badge: "STABLE",//STABLE
          categories: [
              {
                  title: "新功能",
                  color: "text-green-400",
                  items: [
                      "增加添加/编辑类别功能"
                  ]
              },
              {
                  title: "UI/UX 改进",
                  color: "text-blue-400",
                  items: [
                      "设置「配置类别与子类别」按钮 — 统一入口",
                      "优化类别拖拽手感",
                      "主页查看详情卡片弹窗，进行鼠标滚轮滑动，只控制弹窗的滑块上下滑动"
                  ]
              },
              {
                  title: "Bug 修复",
                  color: "text-red-400",
                  items: [
                      "添加元器件时，卡片不会再显示价格，与主页元器件卡片一致",
                      "修复实时预览里相应内容并没有实时显示问题"
                  ]
              }
          ]
      },
    {
          version: "v2.3.8",
          date: "2026-06-27",
          badge: "STABLE",//STABLE
          categories: [
            {
                  title: "新功能",
                  color: "text-green-400",
                  items: [
                      "元器件详情增加元器件单价这一项"
                  ]
              },
              {
                  title: "UI/UX 改进",
                  color: "text-blue-400",
                  items: [
                      "统计卡片可点击筛选 — “低库存预警”和“缺货元器件”两个卡片现在可以点击，点击后主网格只显示对应状态的元器件，卡片会高亮（黄色/红色发光边框+半透明背景）表示已激活，再次点击取消筛选。两个卡片互斥，只能同时有一个处于高亮状态",
                      "统计数值随筛选实时变化 — 点击左上角“低库存预警”或“缺货元器件”卡片后，左侧边栏的库存状态checkbox会同步联动更新勾选状态，两者保持一致。",
                      "统计数值跟随筛选条件实时变化 — 四个统计卡片（总元器件、低库存预警、缺货元器件、总库存价值）的数字现在会根据当前选中的元器件分类、子类别、搜索关键词和库存状态筛选条件动态计算，不再显示全部数据。切换分类、搜索或库存状态后数字即时更新，无需刷新页面。"
                  ]
              },
              {
                  title: "Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复本地保存的设置配置导入格式错误问题",
                      "修复新增子类别，已添加子类别名称问题",
                      "修复子类别配置修改保存问题",
                      "点击“重置为默认”后恢复默认子类别列表，而不是清空",
                      "修复侧边栏分类计数不实时更新的问题"
                  ]
              }
          ]
      },
      {
          version: "v2.3.7",
          date: "2026-06-26",
          badge: "STABLE",//STABLE
          categories: [
              {
                  title: "Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复设置偏好导入时，子类别和位置编号未正确导入的问题",
                      "修复了设置偏好在node.js环境下没有实时保存在电脑本地的问题"
                  ]
              }
          ]
      },
      {
          version: "v2.3.6",
          date: "2026-06-22",
          badge: "STABLE",//STABLE
          categories: [
              {
                  title: "UI/UX 改进",
                  color: "text-blue-400",
                  items: [
                      "BOM匹配优化"
                  ]
              },
              {
                  title: "Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复批量删除无法全部删除问题"
                  ]
              }
          ]
      },
      {
          version: "v2.3.5",
          date: "2026-06-20",
          badge: "STABLE",//STABLE
          categories: [
              {
                  title: "新功能",
                  color: "text-green-400",
                  items: [
                      "数据存储与备份 — 新增服务端文件存储（data/components.json）",
                      "系统设置 — 新增 LCSC 导入配置（半成品）"
                  ]
              }
          ]
      },
      {
          version: "v2.3.4",
          date: "2026-06-14",
          badge: "STABLE",//STABLE
          categories: [
              {
                  title: " 新功能",
                  color: "text-green-400",
                  items: [
                      "查看详情时支持窗体外点击关闭"
                  ]
              }
          ]
      },
      {
          version: "v2.3.3",
          date: "2026-06-14",
          badge: "STABLE",//STABLE
          categories: [
              {
                  title: " Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复无法搜索品牌的问题"
                  ]
              }
          ]
      },
      {
          version: "v2.3.2",
          date: "2026-06-14",
          badge: "STABLE",
          categories: [
              {
                  title: " UI/UX 改进",
                  color: "text-blue-400",
                  items: [
                      "缩小元器件卡片，提升信息密度，同时缩小左边栏宽度，增加展示空间"
                  ]
              },
              {
                  title: " Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复版本号不更新的问题",
                      "修复无法搜索品牌的问题"
                  ]
              }
          ]
      },
      {
          version: "v2.3.1",
          date: "2026-06-13",
          badge: "STABLE",
          categories: [
              {
                  title: " 新功能",
                  color: "text-green-400",
                  items: [
                      "添加商品编码参数"
                  ]
              },
              {
                  title: " Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复快速模板中参数显示不全问题"
                  ]
              }
          ]
      },      
      {
          version: "v2.3.0",
          date: "2026-04-27",
          badge: "STABLE",
          categories: [
              {
                  title: " 新功能",
                  color: "text-green-400",
                  items: [
                      "子类别系统：每个元器件品类可设置二级分类，更精细化管理",
                      "分化参数：电阻/电容/电感/MOS管/二极管/三极管/LED/晶振 支持专属参数输入",
                      "批量编辑：支持批量修改子类别和分化参数",
                      "设置页面支持自定义子类别名称（增删改）"
                  ]
              },
              {
                  title: " UI/UX 改进",
                  color: "text-blue-400",
                  items: [
                      "元器件展示增加子类别显示（如\"电阻 / 贴片电阻\"）",
                      "参数显示格式优化：如\"1kΩ|1/4W\"紧凑展示",
                      "添加页面和编辑弹窗均支持分化参数输入",
                      "统计页面新增子类别分布图表"
                  ]
              },
              {
                  title: "🐛 Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复批量编辑子类别不显示和分化参数不出现的问题",
                      "修复电容值单位缺少 pF 选项"
                  ]
              }
          ]
      },
      {
          version: "v2.2.7",
          date: "2026-04-15",
          badge: "STABLE",
          categories: [
              {
                  title: "🎨 UI/UX 改进",
                  color: "text-purple-400",
                  items: [
                      "清单管理面板布局优化：面板宽度从384px缩小至320px，更紧凑",
                      "标题精简：从\"清单管理\"改为\"清单\"，标签页从\"出库清单/入库清单\"改为\"出库/入库\"",
                      "清单项两行布局：无参数时单行显示，有参数时双行显示（参数在第二行）",
                      "数量控制按钮位置调整：无参数时在第一行，有参数时在第二行（与参数同行）",
                      "按钮尺寸优化：从20x20px缩小至16x16px，输入框从w-7缩小至w-5"
                  ]
              },
              {
                  title: "🎨 颜色优化",
                  color: "text-blue-400",
                  items: [
                      "名称：白色高亮显示",
                      "型号：浅灰色显示，带分隔符 · ",
                      "位置：橙色高亮显示，便于快速识别",
                      "库存：翠绿色显示",
                      "参数：亮灰色显示"
                  ]
              },
              {
                  title: "🐛 Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复浏览器缓存问题：更新script标签版本号强制刷新",
                      "修复清单项参数判断逻辑：使用trim()避免空字符串导致的空白行"
                  ]
              }
          ]
      },
      {
          version: "v2.2.6",
          date: "2026-01-25",
          badge: "STABLE",
          categories: [
              {
                  title: "✨ 新功能",
                  color: "text-green-400",
                  items: [
                      "新增 MQTT 通信功能，支持与外部系统集成",
                      "MQTT 连接管理：支持加密/非加密连接，自动重连",
                      "主题订阅：支持通配符订阅（+ 和 #）",
                      "消息发布：支持文本和 JSON 格式消息",
                      "实时监控：消息记录实时显示，支持收发历史查看"
                  ]
              },
              {
                  title: "🐛 修复",
                  color: "text-blue-400",
                  items: [
                      "修复 MQTT 通信面板无法显示的问题，添加 mqtt-manager.js 引用"
                  ]
              },
              {
                  title: "🎨 UI/UX 改进",
                  color: "text-purple-400",
                  items: [
                      "设置页面新增 MQTT 通信配置面板",
                      "使用文档新增 MQTT 通信详细说明"
                  ]
              }
          ]
      },
      {
          version: "v2.2.5",
          date: "2026-01-20",
          badge: "STABLE",
          categories: [
              {
                  title: "🐛 Bug 修复",
                  color: "text-red-400",
                  items: [
                      "BOM匹配优化：修复无Category字段时无法基于Value匹配的bug",
                      "单位识别增强：扩展电容单位识别范围，支持pF、nF、uF、mF、kF",
                      "字段映射优化：支持Comment字段作为名称使用，优先级高于Name字段"
                  ]
              },
              {
                  title: "✨ 功能优化",
                  color: "text-green-400",
                  items: [
                      "BOM面板重构：移除匹配结果显示，只显示待查找列表",
                      "悬停提示功能：鼠标悬停1秒显示完整BOM信息",
                      "匹配策略提升：提高valueCategoryMatch置信度至0.75"
                  ]
              },
              {
                  title: "🎨 UI/UX 改进",
                  color: "text-purple-400",
                  items: [
                      "文字样式调整：待查找项文字透明度调整为text-gray-400",
                      "布局优化：查找项占一行，匹配数字显示更醒目",
                      "交互增强：点击待查找项可在主页筛选显示所有匹配项"
                  ]
              }
          ]
      },
      {
          version: "v2.2.4",
          date: "2026-01-19",
          badge: "STABLE",
          categories: [
              {
                  title: "🐛 Bug 修复",
                  color: "text-red-400",
                  items: [
                      "修复 BOM 匹配只显示单个候选的 bug，现在支持显示所有置信度 ≥70% 的候选",
                      "修复 parseBomData 函数缺少空值检查的问题，防止无效文件导致系统崩溃",
                      "修复 saveData 和 loadData 函数缺少错误处理的问题，防止 localStorage 异常导致程序中断",
                      "修复 loadSettings 函数解析失败时未返回默认设置的问题",
                      "修复 confirmBatchCheckout 函数未验证库存充足性的问题，防止库存扣减为负数"
                  ]
              },
              {
                  title: "✨ 功能优化",
                  color: "text-green-400",
                  items: [
                      "多候选匹配：BOM 匹配现在可以同时显示多个候选匹配（如 22uf、22uf 16v 等），按置信度排序",
                      "置信度阈值提升：将候选匹配置信度阈值从 50% 提升至 70%，提高匹配准确性",
                      "匹配策略增强：新增类别精确匹配规则，增强类别推断与匹配逻辑，调整规则顺序与置信度计算",
                      "数值标准化：去除不必要的小数点（如 6.0 转为 6），统一数值格式，提高匹配准确性",
                      "单位智能换算：支持电容、电阻、电感、电流、电压等单位自动转换（如 0.1uf 和 100nf 视为相同）"
                  ]
              },
              {
                  title: "🎨 UI/UX 改进",
                  color: "text-purple-400",
                  items: [
                      "BOM 面板优化：面板固定在左侧，宽度 320px，头部更扁平，关闭后完全移出屏幕",
                      "匹配结果布局：头部采用两行布局（第一行标题与按钮，第二行统计信息）",
                      "交互优化：点击匹配卡片直接触发筛选，弹窗保持打开状态"
                  ]
              }
          ]
      },
      {
          version: "v2.2.3",
          date: "2026-01-18",
          badge: "STABLE",
          categories: [
              {
                  title: "✨ 新功能",
                  color: "text-green-400",
                  items: [
                      "添加新元器件时自动记录入库历史（初始库存 > 0 时）",
                      "编辑元器件时支持按 Enter 键快速保存",
                      "add-component.html 页面支持按 Enter 键快速添加元器件"
                  ]
              },
              {
                  title: "🐛 修复",
                  color: "text-blue-400",
                  items: [
                      "修复点击入库清单按钮时出库清单按钮不变暗的问题",
                      "修复添加新元器件时出入库记录不同步的问题"
                  ]
              },
              {
                  title: "🎨 优化",
                  color: "text-purple-400",
                  items: [
                      "统一标签页按钮悬停效果为蓝色边框"
                  ]
              }
          ]
      },
      {
          version: "v2.2.2",
          date: "2026-01-18",
          badge: "STABLE",
          categories: [
              {
                  title: "🎨 优化",
                  color: "text-purple-400",
                  items: [
                      "删除系统设置中的\"自动备份\"开关和\"自动备份间隔\"选项",
                      "系统已采用实时自动保存机制，无需定期备份功能"
                  ]
              }
          ]
      },
      {
          version: "v2.2.1",
          date: "2026-01-17",
          badge: "STABLE",
          categories: [
              {
                  title: "✨ 新功能",
                  color: "text-green-400",
                  items: [
                      "导出数据功能升级：Chrome/Edge 浏览器支持选择文件保存位置",
                      "使用 File System Access API 实现文件保存位置自定义",
                      "智能降级机制：不支持该API的浏览器自动使用传统下载方式"
                  ]
              },
              {
                  title: "🎨 优化",
                  color: "text-purple-400",
                  items: [
                      "优化导出体验：用户可自由选择保存路径和修改文件名",
                      "首页导出和系统设置导出功能保持一致"
                  ]
              }
          ]
      },
      {
          version: "v2.2.0",
          date: "2026-01-16",
          badge: "STABLE",
          categories: [
              {
                  title: "🎨 优化",
                  color: "text-purple-400",
                  items: [
                      "优化 help.html 返回按钮跳转逻辑，点击后返回至 settings.html 页面",
                      "简化 settings.html 页面功能，移除\"数据备份\"栏目及相关代码",
                      "优化系统信息展示，移除存储使用进度的冗余显示"
                  ]
              }
          ]
      },
      {
          version: "v2.1.0",
          date: "2026-01-16",
          badge: "STABLE",
          categories: [
              {
                  title: "✨ 新功能",
                  color: "text-green-400",
                  items: [
                      "新增数据手册链接功能，详情页支持一键打开",
                      "编辑模态框图片预览支持2倍局部放大镜效果（跟随鼠标移动）",
                      "分类列表支持拖拽排序功能，仅通过左侧手柄触发",
                      "优化拖拽体验：磁吸吸附效果（阈值25px）、动态插入线提示、弹簧缓动动画",
                      "新增分类：开关、三极管（原晶体管）、MOS管、晶振、其他"
                  ]
              },
              {
                  title: "🐛 修复",
                  color: "text-blue-400",
                  items: [
                      "修复PC端右下角浮动添加按钮不可见问题",
                      "修复分类列表拖拽影响分类筛选点击的问题"
                  ]
              },
              {
                  title: "🎨 优化",
                  color: "text-purple-400",
                  items: [
                      "元器件图片上传方式改为URL链接输入，移除文件上传功能",
                      "优化搜索功能，支持多关键词并行搜索（空格分隔，AND逻辑）",
                      "优化侧边栏分类列表显示，设置固定高度（max-h-96）并启用滚动",
                      "拖拽功能添加防抖/节流机制，优化性能",
                      "编辑模态框图片预览尺寸调整为192x192，提升显示效果",
                      "移除\"连接器\"分类及相关代码"
                  ]
              }
          ]
      },
      {
          version: "v2.0.0",
          date: "2026-01-16",
          badge: "STABLE",
          categories: [
              {
                  title: "✨ 新功能",
                  color: "text-green-400",
                  items: [
                      "新增入库清单功能，与出库清单保持对称设计",
                      "添加出入库历史记录查看功能，支持实时更新",
                      "出入库清单采用标签页设计，便于切换管理",
                      "清单面板支持点击数量输入框直接修改数量",
                      "新增 Ctrl+Z 撤回功能，支持撤回多种操作"
                  ]
              },
              {
                  title: "🐛 修复",
                  color: "text-blue-400",
                  items: [
                      "修复删除元器件后页面不实时更新的问题",
                      "修复编辑元器件后统计数据不更新的问题"
                  ]
              },
              {
                  title: "🎨 优化",
                  color: "text-purple-400",
                  items: [
                      "优化入库/出库清单输入框样式，移除上下箭头",
                      "元器件卡片按钮布局优化：入库/出库在上，详情在下",
                      "清单面板折叠逻辑改为完全隐藏"
                  ]
              }
          ]
      },
      {
          version: "v1.0.0",
          date: "2026-01-15",
          badge: "STABLE",
          categories: [
              {
                  title: "✨ 新功能",
                  color: "text-green-400",
                  items: [
                      "元器件增删改查基础功能",
                      "分类筛选功能（电阻、电容、电感等）",
                      "库存管理（添加、减少、预警）",
                      "搜索功能（支持名称、型号、参数搜索）",
                      "数据统计和可视化图表",
                      "批量出库清单功能",
                      "数据导入导出功能",
                      "系统设置界面"
                  ]
              }
          ]
      }
  ];

  