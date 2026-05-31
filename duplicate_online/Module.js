Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    // Интервал обновления в миллисекундах (15 секунд)
    refreshIntervalMs: 15000,
    // Хранилище объектов для последующей фильтрации и обновления
    currentVehiclesMap: {},
    // Флаг, указывающий, что обновление запущено и активно
    isRefreshEnabled: true,
    // Хранилище элементов treeStore для корректного обновления
    treeStore: null,
    tree: null,

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

        // Загружаем структуру дерева и запускаем автообновление
        me.loadFullData(navTab);

        // Запускаем таймер для периодического обновления статусов
        me.startAutoRefresh(navTab);

        setTimeout(function() { me.initMap(); }, 200);
    },

    startAutoRefresh: function(navTab) {
        var me = this;
        if (me.refreshTask) return;

        me.refreshTask = Ext.TaskManager.start({
            run: function() {
                if (me.isRefreshEnabled) {
                    me.refreshOnlyStatusData(navTab);
                }
            },
            interval: me.refreshIntervalMs,
            scope: me
        });
    },

    stopAutoRefresh: function() {
        var me = this;
        if (me.refreshTask) {
            Ext.TaskManager.stop(me.refreshTask);
            me.refreshTask = null;
        }
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

    loadFullData: function(navTab) {
        var me = this;
        Ext.Ajax.request({
            url: '/backend/ax/tree.php',
            params: {
                vehs: 1, state: 1, objects: 1, vehicles: 1, full: 1
            },
            success: function(treeResponse) {
                var treeData = Ext.decode(treeResponse.responseText);
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

                    var container = navTab.down('#treeContainer');
                    if (container) {
                        container.add(me.tree);
                        navTab.updateLayout();
                    }
                }

                var root = me.treeStore.getRootNode();
                me.currentTreeRoot = root;
                root.removeAll();
                me.buildTreeNodes(root, treeData);
                root.expandChildren(true, false);

                // После загрузки структуры запрашиваем статусы для наполнения данных
                me.refreshOnlyStatusData(navTab);
            },
            failure: function() {
                console.error('Не удалось загрузить данные дерева.');
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные.');
            }
        });
    },

    // Строим дерево, сохраняя ссылки на транспортные средства в me.currentVehiclesMap
    buildTreeNodes: function(parentNode, children) {
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
            var node = parentNode.appendChild(nodeConfig);
            if (nodeConfig.vehid) {
                me.currentVehiclesMap[nodeConfig.vehid] = node;
            }
            if (item.children && item.children.length) {
                me.buildTreeNodes(node, item.children);
            }
        });
    },

    refreshOnlyStatusData: function(navTab) {
        var me = this;
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
                if (statusData && me.currentVehiclesMap) {
                    // Обновляем узлы новыми статусами
                    for (var vehid in statusData) {
                        var node = me.currentVehiclesMap[vehid];
                        if (node && statusData[vehid]) {
                            var status = statusData[vehid];
                            node.set('active', status.active);
                            node.set('on', status.on);
                            node.set('last_connection', status.last_connection || status.last_data);
                            if (status.configuration) node.set('configuration', status.configuration);
                            if (status.uniqid) node.set('uniqid', status.uniqid);
                        }
                    }
                    // Применяем текущий поиск (если есть)
                    if (me.searchField && me.searchField.getValue()) {
                        me.applySearchFilter(me.searchField.getValue());
                    } else {
                        // Обновляем отображение дерева
                        if (me.tree && me.tree.getView()) me.tree.getView().refresh();
                    }
                }
            },
            failure: function() {
                console.warn('Не удалось обновить статусные данные');
            }
        });
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
