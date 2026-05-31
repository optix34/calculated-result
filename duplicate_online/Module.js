Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Левая панель (вкладка)
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

        // Правая панель: карта сверху, пустая панель снизу
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
        }, 100);

        setTimeout(function() { me.initMap(); }, 200);

        // АВТООБНОВЛЕНИЕ: перезагружаем дерево каждые 15 секунд
        me.startAutoRefresh();
    },

    startAutoRefresh: function() {
        var me = this;
        if (me.refreshInterval) clearInterval(me.refreshInterval);
        me.refreshInterval = setInterval(function() {
            if (me.treeStore) {
                me.treeStore.load({
                    callback: function() {
                        var root = me.treeStore.getRootNode();
                        if (root) {
                            root.expandChildren(true, false);
                            if (me.tree.view) me.tree.view.refresh();
                        }
                    }
                });
            }
        }, 15000);
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
                    vehs: 1, state: 1, objects: 1, vehicles: 1, full: 1,
                    units: 1, devs: 1, last_update: 1, last_data: 1,
                    with_status: 1, extended: 1
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
                dataIndex: 'status_display',
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
                dataIndex: 'last_display',
                width: 140,
                renderer: function(v, meta, record) {
                    if (!record.isLeaf()) return '';
                    // Пытаемся получить last_update или last_data
                    var last = record.get('last_update') || record.get('last_data') || record.get('created_time');
                    if (!last) return '—';
                    var ts = (typeof last === 'number') ? last : parseInt(last);
                    if (isNaN(ts)) return last;
                    if (ts > 10000000000) ts = ts / 1000;
                    return Ext.Date.format(new Date(ts * 1000), 'd.m.Y H:i:s');
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

    applySearchFilter: function(query) {
        var root = this.treeStore ? this.treeStore.getRootNode() : null;
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
