Ext.define('Store.client_objects_list.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Левая панель (фирменный компонент или обычная)
        var navTab;
        if (window.Pilot && Pilot.utils && Pilot.utils.LeftBarPanel) {
            navTab = Ext.create('Pilot.utils.LeftBarPanel', {
                title: l('Список объектов'),
                iconCls: 'fa fa-list',
                iconAlign: 'top',
                minimized: true,
                width: 800,  // ширина для отображения многих колонок
                items: [{
                    xtype: 'container',
                    layout: 'vbox',
                    flex: 1,
                    items: [
                        me.buildToolbar(),
                        me.buildObjectsGrid()
                    ]
                }]
            });
        } else {
            navTab = Ext.create('Ext.panel.Panel', {
                title: l('Список объектов'),
                iconCls: 'fa fa-list',
                width: 800,
                layout: 'vbox',
                items: [
                    me.buildToolbar(),
                    me.buildObjectsGrid()
                ]
            });
        }

        // Правая панель – разделена по горизонтали
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
            items: [{
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Верхняя панель (пусто)</div>',
                cls: 'x-panel-default-framed'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Нижняя панель (пусто)</div>',
                cls: 'x-panel-default-framed'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);
    },

    buildToolbar: function() {
        var me = this;
        return Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: l('Все'),
                stateValue: 'all',
                enableToggle: true,
                toggleGroup: 'statefilter',
                pressed: true,
                handler: function(btn) { me.filterByState(btn, 'all'); }
            }, {
                text: l('Активные'),
                stateValue: 1,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 1); }
            }, {
                text: l('Аварии'),
                stateValue: 2,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 2); }
            }, {
                text: l('Стоянка'),
                stateValue: 3,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 3); }
            }, {
                text: l('Холостой ход'),
                stateValue: 4,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 4); }
            }, '->', {
                xtype: 'textfield',
                emptyText: l('Поиск...'),
                enableKeyEvents: true,
                listeners: {
                    keyup: function(field) {
                        me.applySearchFilter(field.getValue());
                    }
                }
            }]
        });
    },

    buildObjectsGrid: function() {
        var me = this;
        me.gridStore = Ext.create('Ext.data.Store', {
            fields: [],   // будут определены динамически
            data: [],
            proxy: {
                type: 'memory',
                reader: { type: 'json' }
            }
        });

        me.grid = Ext.create('Ext.grid.Panel', {
            flex: 1,
            store: me.gridStore,
            columns: [],
            viewConfig: {
                stripeRows: true,
                loadMask: true
            },
            selModel: {
                type: 'rowmodel',
                mode: 'SINGLE'
            },
            emptyText: l('Загрузка данных...')
        });

        me.loadObjects();
        return me.grid;
    },

    loadObjects: function(stateParam) {
        var me = this;
        var state = (stateParam === 'all') ? 1 : (stateParam || 1);
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: {
                vehs: 1,
                state: state
            },
            success: function(response) {
                var data = Ext.decode(response.responseText);
                var objects = me.extractObjectsFromTree(data);
                if (objects.length === 0) {
                    me.gridStore.removeAll();
                    me.grid.view.emptyText = l('Нет объектов');
                    return;
                }
                me.buildDynamicColumns(objects[0]);
                me.gridStore.loadData(objects);
                me.originalData = objects;
                me.applySearchFilter(me.searchField && me.searchField.getValue());
            },
            failure: function() {
                me.grid.view.emptyText = l('Ошибка загрузки данных');
                me.gridStore.removeAll();
            }
        });
    },

    // Рекурсивный сбор всех объектов (leaf = true или имеющих поля объекта)
    extractObjectsFromTree: function(nodes) {
        var result = [];
        var me = this;
        function traverse(node) {
            // Если узел является транспортным средством (имеет id или text и не является группой)
            // В API группы обычно имеют children, а объекты – нет, либо есть признак leaf.
            if (node.leaf === true || (node.id && !node.children && node.id !== 0)) {
                result.push(node);
            }
            if (node.children && Ext.isArray(node.children)) {
                Ext.each(node.children, function(child) {
                    traverse(child);
                });
            }
        }
        if (Ext.isArray(nodes)) {
            Ext.each(nodes, traverse);
        } else if (typeof nodes === 'object') {
            traverse(nodes);
        }
        return result;
    },

    // Динамическое создание колонок на основе полей первого объекта
    buildDynamicColumns: function(sampleObj) {
        var me = this;
        var columns = [];
        var fieldNames = [];

        // Определяем порядок полей (желательный)
        var preferredOrder = ['id', 'text', 'state', 'last_update', 'equip_type', 'speed', 'course', 'lat', 'lon', 'address', 'plate', 'model', 'sim', 'phone'];
        var existing = [];

        for (var key in sampleObj) {
            if (sampleObj.hasOwnProperty(key) && key !== 'children' && key !== 'leaf') {
                if (preferredOrder.indexOf(key) === -1) fieldNames.push(key);
                else existing.push(key);
            }
        }
        fieldNames = preferredOrder.filter(function(k) { return sampleObj.hasOwnProperty(k); }).concat(fieldNames);

        // Создаём колонки
        Ext.each(fieldNames, function(field) {
            var column = {
                text: l(field),
                dataIndex: field,
                flex: (field === 'text') ? 2 : 1,
                sortable: true
            };
            // Рендереры для специфических полей
            if (field === 'state') {
                column.renderer = function(value) {
                    switch(value) {
                        case 1: return '<i class="fa fa-play-circle" style="color:green;"></i> ' + l('Активен');
                        case 2: return '<i class="fa fa-exclamation-triangle" style="color:red;"></i> ' + l('Авария');
                        case 3: return '<i class="fa fa-pause-circle" style="color:orange;"></i> ' + l('Стоянка');
                        case 4: return '<i class="fa fa-hourglass-half" style="color:gray;"></i> ' + l('Холостой ход');
                        default: return value;
                    }
                };
                column.width = 110;
            } else if (field === 'last_update') {
                column.renderer = function(value) {
                    if (!value) return '—';
                    // Если timestamp в секундах
                    if (typeof value === 'number') return Ext.Date.format(new Date(value * 1000), 'd.m.Y H:i:s');
                    return value;
                };
                column.width = 130;
            } else if (field === 'speed') {
                column.renderer = function(value) {
                    if (!value && value !== 0) return '—';
                    return value + ' ' + (window.uom ? window.uom.speed : 'км/ч');
                };
                column.width = 80;
            } else if (field === 'lat' || field === 'lon') {
                column.renderer = function(value) {
                    return value ? value.toFixed(6) : '—';
                };
            } else if (field === 'address') {
                column.flex = 2;
            }
            columns.push(column);
        });

        // Добавляем колонку действий (опционально)
        columns.push({
            xtype: 'actioncolumn',
            width: 30,
            items: [{
                iconCls: 'fa fa-info-circle',
                tooltip: l('Информация'),
                handler: function(grid, rowIndex, colIndex, item, e, record) {
                    Ext.Msg.alert(l('Объект'), record.get('text') + '\nID: ' + record.get('id'));
                }
            }]
        });

        me.grid.reconfigure(me.gridStore, columns);
        // Обновляем поля хранилища
        var storeFields = fieldNames.map(function(f) { return { name: f }; });
        me.gridStore.setFields(storeFields);
    },

    filterByState: function(btn, stateValue) {
        var me = this;
        me.currentState = stateValue;
        me.loadObjects(stateValue);
    },

    applySearchFilter: function(query) {
        var me = this;
        if (!me.originalData) return;
        if (!query || query.length < 2) {
            me.gridStore.loadData(me.originalData);
            return;
        }
        var lowerQuery = query.toLowerCase();
        var filtered = me.originalData.filter(function(record) {
            var name = record.text || record.name || '';
            return name.toLowerCase().indexOf(lowerQuery) !== -1;
        });
        me.gridStore.loadData(filtered);
    }
});
