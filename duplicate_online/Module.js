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
            me.loadTreeData();
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
            }, {
                xtype: 'button',
                text: 'Обновить',
                handler: function() { me.loadTreeData(); }
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
                    devs: 1
                },
                reader: { type: 'json', rootProperty: '' }
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
                dataIndex: 'last_update',  // пытаемся использовать last_update
                width: 140,
                renderer: function(v, meta, record) {
                    // Если last_update отсутствует, используем created_time или другие поля
                    var updateTime = v || record.get('created_time') || record.get('msg_time');
                    if (!updateTime) return '—';
                    if (typeof updateTime === 'number') return Ext.Date.format(new Date(updateTime * 1000), 'd.m.Y H:i:s');
                    return updateTime;
                }
            }, {
                text: 'Тип оборудования',
                dataIndex: 'configuration',
                width: 100,
                renderer: function(v) {
                    return v || '—';
                }
            }, {
                text: 'IMEI',
                dataIndex: 'uniqid',
                width: 150,
                renderer: function(v) {
                    return v || '—';
                }
            }],
            style: 'border: 1px solid #ccc;'
        });

        // Логируем первое полученное транспортное средство, чтобы увидеть доступные поля
        me.treeStore.on('load', function(store, records) {
            var firstVehicle = me.findFirstVehicleNode(records);
            if (firstVehicle) {
                console.log('Пример полей объекта:', firstVehicle.getData());
            }
        });

        return me.tree;
    },

    // Поиск первого узла-транспортного средства
    findFirstVehicleNode: function(nodes) {
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.isLeaf()) return node;
            if (node.childNodes && node.childNodes.length) {
                var found = this.findFirstVehicleNode(node.childNodes);
                if (found) return found;
            }
        }
        return null;
    },

    loadTreeData: function() {
        var me = this;
        if (me.treeStore) {
            me.treeStore.load({
                callback: function() {
                    var root = me.treeStore.getRootNode();
                    if (root) {
                        root.expandChildren(true, false);
                        me.tree.getView().refresh();
                    }
                }
            });
        }
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
