(function() {
  function waitForCM(retries) {
    var cm = window.componentManager;
    if (cm) {
      setup(cm);
    } else if (retries > 0) {
      setTimeout(function() { waitForCM(retries - 1); }, 500);
    } else {
      console.error('请在 component-hub 页面加载完成后运行');
    }
  }

  function setup(cm) {
    window._diag = window._diag || {};
    _diag.cm = cm;
    _diag.steps = {
      1: 'saveData',
      2: 'filterAndRender',
      3: 'updateStatistics',
      4: 'saveData+filterAndRender+updateStatistics',
      5: 'create 50 + render',
      6: 'create 100 + render',
      7: 'create 200 + render',
      8: 'anime animation',
      9: 'ECharts redraw',
      10: 'cleanup'
    };
    console.log('=== 导入诊断工具已加载 ===');
    console.log('输入 _diag.run(N) 执行步骤 (N=1-10)');
    console.log('每步执行后观察屏幕是否有白块');
    for (var n in _diag.steps) console.log('  ' + n + ' = ' + _diag.steps[n]);
    console.log('输入 _diag.run(1) 开始');

    _diag.gen = function(count) {
      var cats = ['resistor','capacitor','inductor','diode','transistor','mosfet','led','ic','crystal','other'];
      var result = [];
      for (var i = 0; i < count; i++) {
        result.push({
          id: 'diag_' + Date.now() + '_' + i,
          name: '诊断测试_' + (i + 1),
          model: 'DIAG-' + String(i + 1).padStart(4, '0'),
          brand: ['Murata','Yageo','Samsung','TDK'][i % 4],
          category: cats[i % cats.length],
          subCategory: '',
          stock: Math.floor(Math.random() * 500),
          price: parseFloat((Math.random() * 10).toFixed(4)),
          threshold: 10,
          location: 'D-' + String(i + 1).padStart(3, '0'),
          notes: '',
          params: '[]',
          image: 'resources/images/hero-circuit-board.png',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      return result;
    };

    _diag.run = function(step) {
      console.log('>>> 执行步骤 ' + step + ': ' + (_diag.steps[step] || '?'));
      try {
        switch (step) {
          case 1: cm.saveData(); console.log('OK: saveData'); break;
          case 2: cm.filterAndRender(false); console.log('OK: filterAndRender'); break;
          case 3: cm.updateStatistics(); console.log('OK: updateStatistics'); break;
          case 4:
            cm.saveData();
            cm.filterAndRender(false);
            cm.updateStatistics();
            console.log('OK: full chain');
            break;
          case 5: case 6: case 7:
            var n = {5:50,6:100,7:200}[step];
            var comps = _diag.gen(n);
            cm.components.push.apply(cm.components, comps);
            cm.saveData();
            cm.filterAndRender(false);
            cm.updateStatistics();
            console.log('OK: created ' + n + ' + render');
            break;
          case 8:
            if (typeof anime !== 'undefined') {
              var els = document.querySelectorAll('.component-card');
              if (els.length > 0) {
                anime({ targets: els, opacity: [0, 1], translateY: [20, 0], delay: anime.stagger(50), duration: 400, easing: 'easeOutQuart' });
                console.log('OK: anime animation');
              } else { console.log('no cards'); }
            } else { console.log('anime not loaded'); }
            break;
          case 9:
            var chartEl = document.getElementById('categoryChart');
            if (chartEl && typeof echarts !== 'undefined') {
              var chart = echarts.getInstanceByDom(chartEl) || echarts.init(chartEl);
              chart.setOption({ series: [{ type: 'pie', data: [{value:15,name:'电阻'},{value:12,name:'电容'},{value:8,name:'电感'},{value:5,name:'IC'},{value:10,name:'其他'}] }] });
              console.log('OK: ECharts');
            } else { console.log('chart not found'); }
            break;
          case 10:
            var count = cm.components.filter(function(c) { return c.id && c.id.startsWith('diag_'); }).length;
            cm.components = cm.components.filter(function(c) { return !c.id || !c.id.startsWith('diag_'); });
            cm.saveData();
            cm.filterAndRender(false);
            cm.updateStatistics();
            console.log('OK: cleaned ' + count + ' test items');
            break;
          default: console.log('unknown step');
        }
      } catch(e) { console.error('Error:', e.message); }
      console.log('观察屏幕，有没有出现白块？');
      console.log('输入 _diag.run(' + (step + 1) + ') 执行下一步');
    };
  }

  waitForCM(10);
})();