Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Левая панель
        var navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 900,
            layout: 'vbox',
            border: false,
            items: [
                me.buildFilterToolbar(),
                me.buildGridPanel()   // используем грид вместо дерева для надёжности
            ]
        });

        // Правая панель – разделена по горизонтали
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
        me.searchField = toolbar.items.last();
        return toolbar;
    },

    // Грид для отображения объектов (плоский список)
    buildGridPanel: function() {
        var me = this;
        me.gridStore = Ext.create('Ext.data.Store', {
            fields: [], // будут определены динамически
            data: []
        });

        me.grid = Ext.create('Ext.grid.Panel', {
            flex: 1,
            store: me.gridStore,
            columns: [],
            viewConfig: { stripeRows: true, loadMask: true },
            emptyText: l('Загрузка данных...')
        });

        me.loadObjects('all');
        return me.grid;
    },

    // Загрузка объектов с сервера
    loadObjects: function(stateValue) {
        var me = this;
        var stateParam = (stateValue === 'all') ? 1 : stateValue;

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: stateParam },
            success: function(response) {
                var data;
                try {
                    data = Ext.decode(response.responseText);
                } catch(e) {
                    Ext.Msg.alert(l('Ошибка'), l('Неверный JSON от сервера'));
                    console.error('JSON error', response.responseText);
                    return;
                }

                console.log('Ответ сервера (полный):', data);
                // Извлекаем все объекты (транспортные средства) из иерархии
                var objects = me.extractAllObjects(data);
                console.log('Извлечено объектов:', objects.length, objects);

                if (objects.length === 0) {
                    me.gridStore.removeAll();
                    me.grid.view.emptyText = l('Нет объектов для отображения');
                    return;
                }

                // Динамически строим колонки на основе полей первого объекта
                me.buildColumnsFromData(objects[0]);
                me.gridStore.loadData(objects);
                me.originalData = objects;
                me.applySearchFilter(me.searchField.getValue());
            },
            failure: function(response) {
                Ext.Msg.alert(l('Ошибка'), l('HTTP ') + response.status + ': ' + response.statusText);
                console.error('Request failed', response);
            }
        });
    },

    // Рекурсивный сбор всех листовых узлов (транспортных средств) из дерева
    extractAllObjects: function(nodes, result) {
        if (!result) result = [];
        if (!nodes) return result;

        var processNode = function(node) {
            // Если узел является транспортным средством (нет детей или есть признак leaf)
            var isVehicle = (!node.children || node.children.length === 0) || node.leaf === true;
            if (isVehicle && node.id && node.id > 0) {
                // Копируем все поля
                var obj = {};
                for (var key in node) {
                    if (node.hasOwnProperty(key) && key !== 'children') {
                        obj[key] = node[key];
                    }
                }
                // Убедимся, что есть текстовое поле
                if (!obj.text) obj.text = obj.name || obj.title || ('ID ' + obj.id);
                result.push(obj);
            }
            if (node.children && node.children.length) {
                Ext.each(node.children, function(child) {
                    processNode(child);
                });
            }
        };

        if (Ext.isArray(nodes)) {
            Ext.each(nodes, processNode);
        } else {
            processNode(nodes);
        }
        return result;
    },

    // Динамическое создание колонок на основе полей объекта
    buildColumnsFromData: function(sample) {
        var me = this;
        var columns = [];
        // Желаемый порядок колонок
        var order = ['id', 'text', 'state', 'last_update', 'equip_type', 'speed', 'course', 'lat', 'lon', 'address', 'plate', 'model'];

        var fields = [];
        for (var key in sample) {
            if (sample.hasOwnProperty(key) && key !== 'children' && key !== 'leaf') {
                fields.push(key);
            }
        }
        // Сортируем по order
        fields.sort(function(a,b) {
            var ia = order.indexOf(a);
            var ib = order.indexOf(b);
            if (ia === -1) ia = 999;
            if (ib === -1) ib = 999;
            return ia - ib;
        });

        Ext.each(fields, function(field) {
            var column = {
                text: l(field),
                dataIndex: field,
                flex: (field === 'text') ? 2 : 1,
                sortable: true
            };
            // Рендереры для типовых полей
            if (field === 'state') {
                column.renderer = function(v) {
                    switch(v) {
                        case 1: return '<i class="fa fa-play-circle" style="color:green;"></i> ' + l('Активен');
                        case 2: return '<i class="fa fa-exclamation-triangle" style="color:red;"></i> ' + l('Авария');
                        case 3: return '<i class="fa fa-pause-circle" style="color:orange;"></i> ' + l('Стоянка');
                        case 4: return '<i class="fa fa-hourglass-half" style="color:gray;"></i> ' + l('Холостой ход');
                        default: return v || '—';
                    }
                };
                column.width = 110;
            } else if (field === 'last_update' || field === 'updated') {
                column.renderer = function(v) {
                    if (!v) return '—';
                    if (typeof v === 'number') return Ext.Date.format(new Date(v * 1000), 'd.m.Y H:i:s');
                    return v;
                };
                column.width = 140;
            } else if (field === 'speed') {
                column.renderer = function(v) {
                    if (v === undefined) return '—';
                    return v + ' ' + (window.uom ? window.uom.speed : 'км/ч');
                };
                column.width = 90;
            } else if (field === 'lat' || field === 'lon') {
                column.renderer = function(v) { return v ? v.toFixed(6) : '—'; };
                column.width = 100;
            }
            columns.push(column);
        });

        // Добавляем колонку действий
        columns.push({
            xtype: 'actioncolumn',
            width: 30,
            items: [{
                iconCls: 'fa fa-info-circle',
                tooltip: l('Информация'),
                handler: function(grid, rowIndex) {
                    var rec = grid.getStore().getAt(rowIndex);
                    Ext.Msg.alert(l('Объект'), rec.get('text') + '\nID: ' + rec.get('id'));
                }
            }]
        });

        me.grid.reconfigure(me.gridStore, columns);
        var storeFields = fields.map(function(f) { return { name: f }; });
        me.gridStore.setFields(storeFields);
    },

    // Фильтрация по состоянию
    filterByState: function(btn, stateValue) {
        this.loadObjects(stateValue);
    },

    // Поиск по тексту (клиентский)
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
