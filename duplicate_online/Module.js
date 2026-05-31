Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // 1. Левая панель (с поддержкой динамических колонок)
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Дубликат Онлайн',
            iconCls: 'fa fa-copy',
            width: 950,
            layout: 'border',
            items: [{
                region: 'north',
                height: 40,
                items: [me.buildToolbar()]
            }, {
                region: 'center',
                items: [me.buildTree()]
            }]
        });

        // 2. Правая панель (карта + пусто)
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [{
                xtype: 'panel',
                flex: 1,
                layout: 'fit',
                html: '<div id="dup-online-map" style="width:100%;height:100%;"></div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center;">Нижняя панель (пусто)</div>'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        if (skeleton.navigation.setActiveTab) skeleton.navigation.setActiveTab(navTab);
        if (skeleton.mapframe) skeleton.mapframe.add(mainPanel);

        setTimeout(function() {
            skeleton.navigation.updateLayout();
            if (skeleton.mapframe) skeleton.mapframe.updateLayout();
            navTab.updateLayout();
            me.treeStore.load({
                callback: function() {
                    var root = me.treeStore.getRootNode();
                    if (root) {
                        root.expandChildren(true, false);
                        me.tree.getView().refresh();
                        me.tree.setHeight(navTab.getHeight() - 50);
                    }
                }
            });
        }, 100);

        setTimeout(function() { me.initMap(); }, 200);
    },

    // Тулбар только с поиском
    buildToolbar: function() {
        var me = this;
        return Ext.create('Ext.toolbar.Toolbar', {
            items: ['->', {
                xtype: 'textfield',
                emptyText: 'Поиск...',
                enableKeyEvents: true,
                width: 200,
                listeners: {
                    keyup: function(field) {
                        me.applySearchFilter(field.getValue());
                    }
                }
            }]
        });
    },

    buildTree: function() {
        var me = this;
        // Обновленный прокси с дополнительными параметрами
        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] },
            proxy: {
                type: 'ajax',
                url: '/backend/ax/tree.php',
                extraParams: {
                    vehs: 1,
                    state: 1,
                    objects: 1,
                    vehicles: 1,
                    full: 1,
                    units: 1,
                    devs: 1
                },
                reader: { type: 'json', rootProperty: '' }
            }
        });

        // Динамическое создание колонок
        me.tree = Ext.create('Ext.tree.Panel', {
            store: me.treeStore,
            rootVisible: false,
            columns: [{
                xtype: 'treecolumn',
                text: 'Объекты',
                dataIndex: 'text',
                flex: 2,
                renderer: function(v, meta, record) {
                    return v || record.get('name') || record.get('id') || '—';
                }
            }],
            style: 'border: 1px solid #ccc;'
        });

        // Обработчик загрузки для динамического добавления колонок
        me.treeStore.on('load', function(store, records, successful) {
            if (successful && records.length > 0) {
                // Ищем первый узел-транспортное средство, чтобы определить поля
                var sampleNode = me.findFirstVehicleNode(records);
                if (sampleNode) {
                    var fields = ['state', 'last_update', 'equip_type', 'imei', 'sim', 'device_id', 'plate', 'model'];
                    var columns = me.tree.columns.slice(); // начинаем с существующих колонок

                    fields.forEach(function(field) {
                        if (sampleNode.get(field) !== undefined) {
                            var column = {
                                text: me.getColumnTitle(field),
                                dataIndex: field,
                                width: me.getColumnWidth(field),
                                renderer: me.getColumnRenderer(field)
                            };
                            columns.push(column);
                        }
                    });

                    // Обновляем колонки в дереве
                    me.tree.reconfigure(store, columns);
                }
            }
        });

        return me.tree;
    },

    // Поиск первого узла, который является транспортным средством (имеет state или speed)
    findFirstVehicleNode: function(nodes) {
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.isLeaf() || node.get('state') !== undefined || node.get('speed') !== undefined) {
                return node;
            }
            if (node.childNodes && node.childNodes.length > 0) {
                var found = this.findFirstVehicleNode(node.childNodes);
                if (found) return found;
            }
        }
        return null;
    },

    // Преобразование имени поля в читаемый заголовок
    getColumnTitle: function(field) {
        var titles = {
            'state': 'Статус',
            'last_update': 'Обновление',
            'equip_type': 'Тип оборудования',
            'imei': 'IMEI',
            'sim': 'SIM-карта',
            'device_id': 'ID устройства',
            'plate': 'Госномер',
            'model': 'Модель'
        };
        return titles[field] || field;
    },

    // Настройка ширины колонок
    getColumnWidth: function(field) {
        var widths = {
            'state': 100,
            'last_update': 140,
            'equip_type': 120,
            'imei': 140,
            'sim': 120,
            'device_id': 120,
            'plate': 120,
            'model': 120
        };
        return widths[field] || 100;
    },

    // Рендереры для разных типов полей
    getColumnRenderer: function(field) {
        var me = this;
        switch(field) {
            case 'state':
                return function(v, meta, record) {
                    if (!record.isLeaf()) return '';
                    switch(v) {
                        case 1: return '<span style="color:green;">● Активен</span>';
                        case 2: return '<span style="color:red;">⚠ Авария</span>';
                        case 3: return '<span style="color:orange;">⏸ Стоянка</span>';
                        case 4: return '<span style="color:gray;">⏳ Холостой ход</span>';
                        default: return '—';
                    }
                };
            case 'last_update':
                return function(v) {
                    if (!v) return '—';
                    if (typeof v === 'number') return Ext.Date.format(new Date(v * 1000), 'd.m.Y H:i:s');
                    return v;
                };
            default:
                return function(v) { return v || '—'; };
        }
    },

    // Поиск по дереву
    applySearchFilter: function(query) {
        var root = this.treeStore.getRootNode();
        if (!root) return;
        root.cascadeBy(function(node) { node.set('visible', true); });
        if (!query || query.length < 2) return;
        var lower = query.toLowerCase();
        root.cascadeBy(function(node) { if (node !== root) node.set('visible', false); });
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = (node.get('text') || node.get('name') || '').toLowerCase();
                if (text.indexOf(lower) !== -1) {
                    node.set('visible', true);
                    var p = node.parentNode;
                    while (p && p !== root) { p.set('visible', true); p = p.parentNode; }
                }
            }
        });
    },

    // Инициализация карты
    initMap: function() {
        var container = document.getElementById('dup-online-map');
        if (!container) return;
        if (window.MapContainer) {
            this.map = new MapContainer('dup_map');
            this.map.init(55.75, 37.65, 10, 'dup-online-map', false);
        } else if (typeof L !== 'undefined') {
            this.map = L.map('dup-online-map').setView([55.75, 37.65], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        } else {
            container.innerHTML = '<div style="padding:20px;">Карта не доступна</div>';
        }
    }
});
