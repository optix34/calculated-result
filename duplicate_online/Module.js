Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Левая панель (вкладка) с деревом
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

        // Загружаем дерево и запускаем автообновление статусов
        me.loadTreeData();
        me.startAutoRefresh();
    },

    // Построение тулбара (только поиск)
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

    // Создание дерева с колонками (без привязки к данным, store будет заполнен позже)
    buildTree: function() {
        var me = this;
        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] }
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
                dataIndex: 'last_update_display',
                width: 140,
                renderer: function(v, meta, record) {
                    var last = record.get('last_connection') || record.get('last_data');
                    if (!last) return '—';
                    var ts = (typeof last === 'number') ? last : parseInt(last, 10);
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

    // Загрузка иерархии из tree.php
    loadTreeData: function() {
        var me = this;
        Ext.Ajax.request({
            url: '/backend/ax/tree.php',
            params: { vehs: 1, state: 1, objects: 1, vehicles: 1, full: 1 },
            success: function(response) {
                var data = Ext.decode(response.responseText);
                var root = me.treeStore.getRootNode();
                root.removeAll();
                me.buildTreeNodes(root, data);
                root.expandChildren(true, false);
                // После построения дерева обновляем статусы
                me.refreshStatuses();
            },
            failure: function() {
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить дерево объектов');
            }
        });
    },

    // Рекурсивное построение узлов дерева с сохранением vehid для последующего обновления
    buildTreeNodes: function(parentNode, children) {
        if (!Ext.isArray(children)) children = [children];
        var me = this;
        Ext.each(children, function(item) {
            var isVehicle = item.vehid && item.active !== undefined;
            var nodeConfig = {
                name: item.name || item.text || item.id || '—',
                leaf: isVehicle || !item.children || item.children.length === 0,
                expanded: false,
                vehid: item.vehid,
                active: item.active,
                on: item.on,
                configuration: item.configuration,
                uniqid: item.uniqid,
                last_connection: null,   // будет заполнено из current_data.php
                last_data: null
            };
            var node = parentNode.appendChild(nodeConfig);
            if (item.children && item.children.length) {
                me.buildTreeNodes(node, item.children);
            }
        });
    },

    // Автообновление статусов каждые 15 секунд
    startAutoRefresh: function() {
        var me = this;
        if (me.refreshTask) return;
        me.refreshTask = setInterval(function() {
            if (me.treeStore) me.refreshStatuses();
        }, 15000);
    },

    // Запрос актуальных статусов из current_data.php
    refreshStatuses: function() {
        var me = this;
        var currentTimestamp = Math.floor(Date.now() / 1000);
        Ext.Ajax.request({
            url: '/backend/ax/current_data.php',
            method: 'POST',
            params: {
                vehs: 1,
                state: 1,
                page: 1,
                start: 0,
                limit: 500,
                unixTimestamp: currentTimestamp,
                user_id: 0,
                c: 6,
                n: ''
            },
            success: function(response) {
                var data = Ext.decode(response.responseText);
                var objects = (data && data.objects) ? data.objects : (data.data ? data.data : null);
                if (!objects || !objects.length) return;
                // Строим карту vehid -> статус
                var statusMap = {};
                Ext.each(objects, function(obj) {
                    if (obj.vehid) {
                        statusMap[obj.vehid] = {
                            active: obj.active,
                            on: obj.on,
                            last_connection: obj.last_connection || obj.last_data,
                            configuration: obj.configuration,
                            uniqid: obj.uniqid
                        };
                    }
                });
                // Обновляем узлы дерева
                me.updateTreeStatuses(statusMap);
                // Применяем поиск, если активен
                if (me.searchField && me.searchField.getValue()) {
                    me.applySearchFilter(me.searchField.getValue());
                }
            },
            failure: function() {
                // игнорируем ошибки обновления
            }
        });
    },

    // Обход дерева и обновление полей актив/онлайн/время у листьев
    updateTreeStatuses: function(statusMap) {
        var root = this.treeStore.getRootNode();
        if (!root) return;
        root.cascadeBy(function(node) {
            if (node.isLeaf() && node.get('vehid')) {
                var vehid = node.get('vehid');
                var status = statusMap[vehid];
                if (status) {
                    node.set('active', status.active);
                    node.set('on', status.on);
                    node.set('last_connection', status.last_connection);
                    if (status.configuration) node.set('configuration', status.configuration);
                    if (status.uniqid) node.set('uniqid', status.uniqid);
                }
            }
        });
        // Обновляем отображение
        if (this.tree && this.tree.getView()) {
            this.tree.getView().refresh();
        }
    },

    // Поиск по названию объекта (клиентский)
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
