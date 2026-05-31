Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        var navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 900,
            layout: 'vbox',
            border: false,
            items: [
                me.buildFilterToolbar(),
                me.buildGridPanel()
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
            items: [{
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Верхняя панель (пусто)</div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Нижняя панель (пусто)</div>'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);
    },

    buildFilterToolbar: function() {
        var me = this;
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: l('Все'), stateValue: 'all', enableToggle: true, toggleGroup: 'statefilter', pressed: true,
                handler: function(btn) { me.filterByState(btn, 'all'); }
            }, {
                text: l('Активные'), stateValue: 1, enableToggle: true, toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 1); }
            }, {
                text: l('Аварии'), stateValue: 2, enableToggle: true, toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 2); }
            }, {
                text: l('Стоянка'), stateValue: 3, enableToggle: true, toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 3); }
            }, {
                text: l('Холостой ход'), stateValue: 4, enableToggle: true, toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 4); }
            }, '->', {
                xtype: 'textfield', emptyText: l('Поиск...'), enableKeyEvents: true,
                listeners: { keyup: function(field) { me.applySearchFilter(field.getValue()); } }
            }]
        });
        me.searchField = toolbar.items.last();
        return toolbar;
    },

    buildGridPanel: function() {
        var me = this;
        me.gridStore = Ext.create('Ext.data.Store', { fields: [], data: [] });
        me.grid = Ext.create('Ext.grid.Panel', {
            flex: 1, store: me.gridStore, columns: [],
            viewConfig: { stripeRows: true, loadMask: true },
            emptyText: l('Загрузка данных...')
        });
        me.loadObjects('all');
        return me.grid;
    },

    loadObjects: function(stateValue) {
        var me = this;
        var stateParam = (stateValue === 'all') ? 1 : stateValue;
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: stateParam },
            success: function(response) {
                var data;
                try { data = Ext.decode(response.responseText); } catch(e) { Ext.Msg.alert('Ошибка', 'Неверный JSON'); return; }
                console.log('Полный ответ сервера:', data);

                // Выведем глубокую структуру первого узла (если есть)
                if (data && data.length > 0) {
                    console.log('ПОЛНАЯ СТРУКТУРА ПЕРВОГО УЗЛА (JSON):', JSON.stringify(data[0], null, 2));
                }

                var objects = me.extractAllObjects(data);
                console.log('Извлечено объектов:', objects.length, objects);

                if (objects.length === 0) {
                    me.gridStore.removeAll();
                    me.grid.view.emptyText = l('Объекты не найдены. Проверьте консоль.');
                    return;
                }
                me.buildColumnsFromData(objects[0]);
                me.gridStore.loadData(objects);
                me.originalData = objects;
                me.applySearchFilter(me.searchField.getValue());
            },
            failure: function(response) { Ext.Msg.alert('Ошибка', 'HTTP ' + response.status); }
        });
    },

    extractAllObjects: function(nodes, result) {
        if (!result) result = [];
        if (!nodes) return result;
        if (!Ext.isArray(nodes)) nodes = [nodes];

        var me = this;
        Ext.each(nodes, function(node) {
            if (!node || typeof node !== 'object') return;
            console.log('Обрабатывается узел:', node.name || node.text || node.id, 'ключи:', Object.keys(node));

            // Ищем любой массив внутри узла (кроме null)
            var childArray = null;
            for (var key in node) {
                if (node.hasOwnProperty(key) && Ext.isArray(node[key]) && node[key].length > 0) {
                    childArray = node[key];
                    console.log('Найден массив по ключу "' + key + '" с длиной', node[key].length);
                    break;
                }
            }

            // Если есть массив детей – рекурсивно обрабатываем его
            if (childArray) {
                me.extractAllObjects(childArray, result);
            } else {
                // Нет детей – считаем узел объектом (транспортным средством)
                // Но только если у него есть id или характерные поля
                if (node.id || node.lat !== undefined || node.lon !== undefined || node.speed !== undefined || node.state !== undefined) {
                    var obj = {};
                    for (var prop in node) {
                        if (node.hasOwnProperty(prop) && !Ext.isArray(node[prop]) && typeof node[prop] !== 'object') {
                            obj[prop] = node[prop];
                        }
                    }
                    if (!obj.text && !obj.name) obj.text = node.name || node.text || ('ID ' + node.id);
                    result.push(obj);
                } else {
                    // Если нет id и характерных полей, возможно, это группа без детей – игнорируем
                    console.log('Узел пропущен (нет id и нет детей):', node.name || node.text);
                }
            }
        });
        return result;
    },

    buildColumnsFromData: function(sample) {
        var me = this;
        var columns = [];
        var order = ['id', 'text', 'name', 'state', 'last_update', 'updated', 'equip_type', 'type', 'speed', 'course', 'lat', 'lon', 'address'];
        var fields = Object.keys(sample);
        fields.sort(function(a,b) {
            var ia = order.indexOf(a), ib = order.indexOf(b);
            if (ia === -1) ia = 999; if (ib === -1) ib = 999;
            return ia - ib;
        });

        Ext.each(fields, function(field) {
            var column = { text: l(field), dataIndex: field, flex: (field === 'text' || field === 'name') ? 2 : 1, sortable: true };
            if (field === 'state') {
                column.renderer = function(v) {
                    switch(v) {
                        case 1: return '<i class="fa fa-play-circle" style="color:green;"></i> Активен';
                        case 2: return '<i class="fa fa-exclamation-triangle" style="color:red;"></i> Авария';
                        case 3: return '<i class="fa fa-pause-circle" style="color:orange;"></i> Стоянка';
                        case 4: return '<i class="fa fa-hourglass-half" style="color:gray;"></i> Холостой ход';
                        default: return v || '—';
                    }
                };
                column.width = 110;
            } else if (field === 'last_update' || field === 'updated') {
                column.renderer = function(v) { return v ? (typeof v === 'number' ? Ext.Date.format(new Date(v*1000), 'd.m.Y H:i:s') : v) : '—'; };
                column.width = 140;
            } else if (field === 'speed') {
                column.renderer = function(v) { return v !== undefined ? v + ' ' + (window.uom ? window.uom.speed : 'км/ч') : '—'; };
                column.width = 90;
            } else if (field === 'lat' || field === 'lon') {
                column.renderer = function(v) { return v ? v.toFixed(6) : '—'; };
                column.width = 100;
            }
            columns.push(column);
        });
        columns.push({
            xtype: 'actioncolumn', width: 30,
            items: [{ iconCls: 'fa fa-info-circle', tooltip: 'Информация',
                handler: function(grid, rowIndex) { var rec = grid.getStore().getAt(rowIndex); Ext.Msg.alert('Объект', rec.get('text') || rec.get('name') || rec.get('id')); }
            }]
        });

        me.grid.reconfigure(me.gridStore, columns);
        var storeFields = fields.map(function(f) { return { name: f }; });
        me.gridStore.setFields(storeFields);
    },

    filterByState: function(btn, stateValue) { this.loadObjects(stateValue); },
    applySearchFilter: function(query) {
        var me = this;
        if (!me.originalData) return;
        if (!query || query.length < 2) { me.gridStore.loadData(me.originalData); return; }
        var lowerQuery = query.toLowerCase();
        var filtered = me.originalData.filter(function(record) {
            var name = record.text || record.name || '';
            return name.toLowerCase().indexOf(lowerQuery) !== -1;
        });
        me.gridStore.loadData(filtered);
    }
});
