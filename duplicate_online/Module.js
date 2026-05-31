Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

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
                    devs: 1,
                    last_update: 1,
                    last_data: 1,
                    with_status: 1,
                    extended: 1
                },
                reader: { type: 'json', rootProperty: '' }
            },
            listeners: {
                load: function(store, records, successful) {
                    if (successful && records.length > 0) {
                        var firstVehicle = me.findFirstVehicle(records);
                        if (firstVehicle) {
                            console.log('=== ДИАГНОСТИКА: поля и значения первого ТС ===');
                            var data = firstVehicle.data;
                            var possibleTimeFields = ['last_update', 'last_data', 'last_online', 'last_pos_time', 'updated', 'timestamp', 'server_time', 'last_time', 'time', 'date'];
                            for (var key in data) {
                                if (data.hasOwnProperty(key)) {
                                    var val = data[key];
                                    // Если значение похоже на timestamp (число от 10^9 до 2^31) или строка с датой
                                    var isTime = false;
                                    if (typeof val === 'number' && (val > 1000000000 && val < 9999999999)) isTime = true;
                                    if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) isTime = true;
                                    if (possibleTimeFields.indexOf(key) !== -1) isTime = true;
                                    if (isTime || key.indexOf('time') !== -1 || key.indexOf('date') !== -1) {
                                        console.log('  ' + key + ' : ' + val + ' (возможно, время)');
                                    } else {
                                        console.log('  ' + key + ' : ' + val);
                                    }
                                }
                            }
                            console.log('=================================================');
                        }
                    }
                }
            }
        });

        me.tree = Ext.create('Ext.tree.Panel', {
            store: me.treeStore,
            rootVisible: false,
            columns: [{
                xtype: 'treecolumn',
                text: 'Объекты',
                dataIndex: 'name',
                flex: 2,
                renderer: function(v, meta, record) {
                    return v || record.get('text') || record.get('id') || '—';
                }
            }, {
                text: 'Статус',
                dataIndex: 'active',
                width: 100,
                renderer: function(v, meta, record) {
                    if (!record.isLeaf()) return '';
                    var active = record.get('active');
                    var on = record.get('on');
                    if (active === 1 && on === 1) return '<span style="color:green;">● Активен</span>';
                    if (active === 1 && on === 0) return '<span style="color:orange;">⏸ Офлайн</span>';
                    if (active === 0) return '<span style="color:gray;">◯ Неактивен</span>';
                    return '—';
                }
            }, {
                text: 'Обновление',
                dataIndex: 'last_update',
                width: 140,
                renderer: function(v, meta, record) {
                    if (!record.isLeaf()) return '';
                    // Функция для поиска времени в record
                    var getTime = function(rec) {
                        var possibleFields = ['last_update', 'last_data', 'last_online', 'last_pos_time', 'updated', 'timestamp', 'server_time', 'last_time', 'time'];
                        for (var i = 0; i < possibleFields.length; i++) {
                            var val = rec.get(possibleFields[i]);
                            if (val) {
                                if (typeof val === 'number') return val;
                                if (typeof val === 'string') {
                                    var parsed = Date.parse(val);
                                    if (!isNaN(parsed)) return parsed / 1000;
                                }
                            }
                        }
                        return null;
                    };
                    var timeValue = getTime(record);
                    if (timeValue) {
                        if (typeof timeValue === 'number') {
                            if (timeValue > 10000000000) timeValue = timeValue / 1000; // если миллисекунды
                            return Ext.Date.format(new Date(timeValue * 1000), 'd.m.Y H:i:s');
                        }
                        return timeValue;
                    }
                    return '—';
                }
            }, {
                text: 'Тип оборудования',
                dataIndex: 'configuration',
                width: 100,
                renderer: function(v) { return v || '—'; }
            }, {
                text: 'IMEI',
                dataIndex: 'uniqid',
                width: 150,
                renderer: function(v) { return v || '—'; }
            }],
            style: 'border: 1px solid #ccc;'
        });
        return me.tree;
    },

    findFirstVehicle: function(records) {
        for (var i = 0; i < records.length; i++) {
            var node = records[i];
            if (node.isLeaf()) return node;
            if (node.childNodes && node.childNodes.length) {
                var found = this.findFirstVehicle(node.childNodes);
                if (found) return found;
            }
        }
        return null;
    },

    applySearchFilter: function(query) {
        var root = this.treeStore.getRootNode();
        if (!root) return;
        root.cascadeBy(function(node) { node.set('visible', true); });
        if (!query || query.length < 2) return;
        var lower = query.toLowerCase();
        root.cascadeBy(function(node) { if (node !== root) node.set('visible', false); });
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = (node.get('name') || node.get('text') || '').toLowerCase();
                if (text.indexOf(lower) !== -1) {
                    node.set('visible', true);
                    var p = node.parentNode;
                    while (p && p !== root) { p.set('visible', true); p = p.parentNode; }
                }
            }
        });
    },

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
