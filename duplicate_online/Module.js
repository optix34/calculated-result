Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        let me = this;
        console.log('[duplicate_online] initModule started'); // Лог для проверки

        // ---- 1. ЛЕВАЯ ПАНЕЛЬ (ВКЛАДКА В НАВИГАЦИИ) ----
        // Используем стандартную Ext.panel.Panel вместо Pilot.utils.LeftBarPanel для надежности.
        let navTab = Ext.create('Ext.panel.Panel', {
            title: 'Дубликат Онлайн',
            iconCls: 'fa fa-copy',
            width: 750,
            layout: 'vbox',
            border: true,
            items: [
                me.buildToolbar(),   // тулбар с кнопками и поиском
                me.buildTree()       // дерево объектов
            ]
        });

        // ---- 2. ПРАВАЯ ПАНЕЛЬ ----
        let mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
            items: [{
                xtype: 'panel',
                flex: 1,
                layout: 'fit',
                html: '<div id="duplicate-online-map" style="width:100%;height:100%;"></div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Нижняя панель (пусто)</div>'
            }]
        });

        // ---- 3. ИНИЦИАЛИЗАЦИЯ КАРТЫ ПОСЛЕ РЕНДЕРА ----
        mainPanel.on('afterrender', function() {
            me.initMap();
        }, me, { single: true });

        // ---- 4. СВЯЗЫВАНИЕ ЛЕВОЙ И ПРАВОЙ ПАНЕЛИ ----
        navTab.map_frame = mainPanel;

        // ---- 5. ДОБАВЛЕНИЕ В ИНТЕРФЕЙС PILOT ----
        if (skeleton && skeleton.navigation) {
            skeleton.navigation.add(navTab);
            console.log('[duplicate_online] Панель добавлена в navigation');
        } else {
            console.error('[duplicate_online] skeleton.navigation not found');
            return;
        }
        
        // Используем mapframe или map_frame в зависимости от того, что доступно
        let mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe && mapframe.add) {
            mapframe.add(mainPanel);
            console.log('[duplicate_online] Панель добавлена в mapframe');
        } else {
            console.error('[duplicate_online] skeleton.mapframe / map_frame not found');
        }
    },

    // ---- ТУЛБАР С ФИЛЬТРАМИ И ПОИСКОМ ----
    buildToolbar: function() {
        let me = this;
        let toolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: 'Все',
                enableToggle: true,
                toggleGroup: 'statefilter',
                pressed: true,
                handler: function() { me.filterByState('all'); }
            }, {
                text: 'Активные',
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function() { me.filterByState(1); }
            }, {
                text: 'Аварии',
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function() { me.filterByState(2); }
            }, {
                text: 'Стоянка',
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function() { me.filterByState(3); }
            }, {
                text: 'Холостой ход',
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function() { me.filterByState(4); }
            }, '->', {
                xtype: 'textfield',
                emptyText: 'Поиск...',
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

    // ---- ДЕРЕВО ОБЪЕКТОВ ----
    buildTree: function() {
        let me = this;
        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: { vehs: 1, state: 1 },
                reader: { type: 'json', rootProperty: '' }
            }
        });

        me.tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: me.treeStore,
            rootVisible: false,
            useArrows: true,
            lines: true,
            columns: [{
                xtype: 'treecolumn',
                text: 'Объекты',
                dataIndex: 'text',
                flex: 2,
                renderer: function(v, meta, record) {
                    return v || record.get('name') || record.get('id') || '—';
                }
            }, {
                text: 'Статус',
                dataIndex: 'state',
                width: 110,
                renderer: function(v, meta, record) {
                    if (!record.isLeaf()) return '';
                    switch(v) {
                        case 1: return '<span style="color:green;">● Активен</span>';
                        case 2: return '<span style="color:red;">⚠ Авария</span>';
                        case 3: return '<span style="color:orange;">⏸ Стоянка</span>';
                        case 4: return '<span style="color:gray;">⏳ Холостой ход</span>';
                        default: return '—';
                    }
                }
            }, {
                text: 'Обновлено',
                dataIndex: 'last_update',
                width: 140,
                renderer: function(v) {
                    if (!v) return '—';
                    if (typeof v === 'number') return Ext.Date.format(new Date(v * 1000), 'd.m.Y H:i:s');
                    return v;
                }
            }, {
                text: 'Тип оборудования',
                dataIndex: 'equip_type',
                width: 120,
                renderer: function(v) { return v || '—'; }
            }, {
                text: 'Скорость',
                dataIndex: 'speed',
                width: 90,
                renderer: function(v, meta, record) {
                    if (!record.isLeaf() || v === undefined) return '—';
                    return v + ' км/ч';
                }
            }],
            viewConfig: { stripeRows: true, loadMask: true, emptyText: 'Загрузка данных...' }
        });

        return me.tree;
    },

    // ---- ФИЛЬТРАЦИЯ ПО СОСТОЯНИЮ (ПЕРЕЗАГРУЗКА ДЕРЕВА) ----
    filterByState: function(stateValue) {
        let me = this;
        let proxy = me.treeStore.getProxy();
        if (stateValue === 'all') {
            proxy.setExtraParam('state', 1);
        } else {
            proxy.setExtraParam('state', stateValue);
        }
        me.treeStore.load();
    },

    // ---- КЛИЕНТСКИЙ ПОИСК ПО ТЕКСТУ ----
    applySearchFilter: function(query) {
        let root = this.treeStore.getRootNode();
        if (!root) return;

        root.cascadeBy(function(node) { node.set('visible', true); });
        if (!query || query.length < 2) return;

        let lower = query.toLowerCase();
        root.cascadeBy(function(node) { if (node !== root) node.set('visible', false); });
        root.cascadeBy(function(node) {
            if (node !== root) {
                let text = (node.get('text') || node.get('name') || '').toLowerCase();
                if (text.indexOf(lower) !== -1) {
                    node.set('visible', true);
                    let parent = node.parentNode;
                    while (parent && parent !== root) {
                        parent.set('visible', true);
                        parent = parent.parentNode;
                    }
                }
            }
        });
    },

    // ---- ИНИЦИАЛИЗАЦИЯ КАРТЫ В ВЕРХНЕЙ ПАНЕЛИ ----
    initMap: function() {
        let container = document.getElementById('duplicate-online-map');
        if (!container) {
            console.error('[duplicate_online] Контейнер карты не найден');
            return;
        }

        // Проверяем, загружена ли карта PILOT
        if (window.MapContainer && typeof MapContainer === 'function') {
            try {
                this.map = new MapContainer('dup_map');
                this.map.init(55.75, 37.65, 10, 'duplicate-online-map', {
                    withControls: true,
                    withOutPlugins: false
                });
                console.log('[duplicate_online] Карта создана через MapContainer');
            } catch(e) {
                console.error('[duplicate_online] Ошибка при создании MapContainer:', e);
                this.createFallbackMap(container);
            }
        } 
        // Если MapContainer нет, создаем фоллбэк
        else {
            console.warn('[duplicate_online] MapContainer не определен, используется фоллбэк');
            this.createFallbackMap(container);
        }
    },

    // Фоллбэк карты на Leaflet
    createFallbackMap: function(container) {
        if (typeof L !== 'undefined') {
            this.map = L.map('duplicate-online-map').setView([55.75, 37.65], 10);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB',
                subdomains: 'abcd',
                maxZoom: 19,
                minZoom: 1
            }).addTo(this.map);
            console.log('[duplicate_online] Карта создана через Leaflet');
        } else {
            container.innerHTML = '<div style="padding:20px;text-align:center;">⚠️ Карта не доступна (нет MapContainer или Leaflet)</div>';
            console.error('[duplicate_online] Leaflet также не загружен');
        }
    }
});
