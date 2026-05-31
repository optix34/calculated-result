Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // ---- Левая панель (вкладка) в стиле PILOT ----
        // Используем фирменный компонент для левой панели, чтобы автоматически получить правильный стиль.
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'Дубликат Онлайн',
            iconCls: 'x-fa fa-copy', // Используем стандартный класс иконок Font Awesome
            iconAlign: 'top',
            minimized: true,
            width: 950,
            items: [{
                xtype: 'container',
                layout: 'vbox',
                flex: 1,
                items: [me.buildToolbar(), me.buildTree()]
            }]
        });

        // ---- Правая панель (карта + пусто) ----
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
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

        // ---- Связь и добавление в интерфейс ----
        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        if (skeleton.navigation.setActiveTab) skeleton.navigation.setActiveTab(navTab);
        if (skeleton.mapframe) skeleton.mapframe.add(mainPanel);

        // Небольшая задержка для стабильности рендеринга
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

        // Инициализация карты
        setTimeout(function() { me.initMap(); }, 200);
    },

    // ---- Тулбар с поиском ----
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

    // ---- Дерево объектов с расширенными колонками ----
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
                    last_data: 1,    // Явно запрашиваем поле last_data
                    last_update: 1,  // И last_update
                    with_status: 1,
                    extended: 1
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
                dataIndex: 'last_data', // Ищем это поле в первую очередь
                width: 140,
                renderer: function(v, meta, record) {
                    if (!record.isLeaf()) return '';

                    // Список полей для поиска в порядке приоритета
                    var timeFields = ['last_data', 'last_update', 'last_online', 'last_pos_time', 'updated', 'server_time'];
                    var timestamp = null;

                    // Ищем первое непустое поле из списка
                    for (var i = 0; i < timeFields.length; i++) {
                        var fieldValue = record.get(timeFields[i]);
                        if (fieldValue) {
                            timestamp = fieldValue;
                            break;
                        }
                    }

                    // Если ничего не нашли, используем created_time как запасной вариант
                    if (!timestamp) {
                        timestamp = record.get('created_time') || record.get('created_date');
                    }

                    if (timestamp && typeof timestamp === 'number') {
                        // Преобразуем Unix timestamp (в секундах) в читаемый формат
                        return Ext.Date.format(new Date(timestamp * 1000), 'd.m.Y H:i:s');
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
            }]
        });
        return me.tree;
    },

    // ---- Поиск по дереву ----
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

    // ---- Инициализация карты ----
    initMap: function() {
        var container = document.getElementById('dup-online-map');
        if (!container) return;
        if (window.MapContainer) {
            this.map = new MapContainer('dup_map');
            this.map.init(55.75, 37.65, 10, 'dup-online-map', false);
            console.log('[duplicate_online] Карта создана через MapContainer');
        } else if (typeof L !== 'undefined') {
            this.map = L.map('dup-online-map').setView([55.75, 37.65], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
            console.log('[duplicate_online] Карта создана через Leaflet');
        } else {
            container.innerHTML = '<div style="padding:20px;">Карта не доступна</div>';
            console.error('[duplicate_online] MapContainer и Leaflet не определены');
        }
    }
});
