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
                itemId: 'treeContainer',
                layout: 'fit'
                // дерево будет добавлено позже
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
            me.loadFullData(navTab); // передаём navTab для последующего добавления дерева
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

    // Загрузка данных из двух источников
    loadFullData: function(navTab) {
        var me = this;
        Ext.Ajax.request({
            url: '/backend/ax/tree.php',
            params: {
                vehs: 1, state: 1, objects: 1, vehicles: 1, full: 1
            },
            success: function(treeResponse) {
                var treeData = Ext.decode(treeResponse.responseText);
                // Запрашиваем актуальные статусные данные
                Ext.Ajax.request({
                    url: '/backend/ax/current_data.php',
                    method: 'POST',
                    params: {
                        cmd: 'getData',
                        vehicles: 1,
                        with_last: 1
                    },
                    success: function(statusResponse) {
                        var statusData = Ext.decode(statusResponse.responseText);
                        me.processAndDisplayData(treeData, statusData, navTab);
                    },
                    failure: function() {
                        console.error('Не удалось загрузить статусные данные, отображаем только дерево.');
                        me.processAndDisplayData(treeData, {}, navTab);
                    }
                });
            },
            failure: function() {
                console.error('Не удалось загрузить данные дерева.');
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные.');
            }
        });
    },

    // Построение дерева с объединёнными данными
    processAndDisplayData: function(treeData, statusData, navTab) {
        var me = this;
        if (!me.treeStore) {
            me.treeStore = Ext.create('Ext.data.TreeStore', { root: { expanded: true, children: [] } });
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
                    dataIndex: 'last_connection',
                    width: 140,
                    renderer: function(v) {
                        if (!v) return '—';
                        var ts = (typeof v === 'number') ? v : parseInt(v);
                        if (isNaN(ts)) return v;
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
            // Добавляем дерево в контейнер левой панели
            var container = navTab.down('#treeContainer');
            if (container) {
                container.add(me.tree);
                navTab.updateLayout();
            }
        }

        var root = me.treeStore.getRootNode();
        root.removeAll();
        me.buildTreeNodes(root, treeData, statusData);
        root.expandChildren(true, false);
        if (me.tree.getView()) me.tree.getView().refresh();
        if (me.tree.setHeight) me.tree.setHeight(navTab.getHeight() - 50);
    },

    // Рекурсивное построение узлов
    buildTreeNodes: function(parentNode, children, statusData) {
        if (!Ext.isArray(children)) children = [children];
        var me = this;
        Ext.each(children, function(item) {
            var isVehicle = item.vehid && item.active !== undefined;
            var nodeConfig = {
                name: item.name || item.text || item.id || '—',
                leaf: isVehicle || !item.children || item.children.length === 0,
                expanded: false,
                id: item.id,
                vehid: item.vehid,
                active: item.active,
                on: item.on,
                configuration: item.configuration,
                uniqid: item.uniqid
            };
            // Если есть статусные данные для этого ТС
            if (statusData && statusData[item.vehid]) {
                nodeConfig.last_connection = statusData[item.vehid].last_connection ||
                                               statusData[item.vehid].last_data;
            }
            var node = parentNode.appendChild(nodeConfig);
            if (item.children && item.children.length) {
                me.buildTreeNodes(node, item.children, statusData);
            }
        });
    },

    // Поиск по названию объекта
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

    // Инициализация карты в правой верхней панели
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
