Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // ---- Левая панель (дубликат Онлайн) ----
        var navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 750,
            layout: 'vbox',
            border: true,
            items: [
                me.buildToolbar(),       // точная копия тулбара Онлайн
                me.buildTree()           // дерево объектов с колонками
            ]
        });

        // ---- Правая панель: верхняя часть - карта, нижняя - пусто ----
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
            items: [{
                xtype: 'panel',
                flex: 1,
                layout: 'fit',
                // здесь будет карта
                items: [{
                    xtype: 'component',
                    itemId: 'mapPlaceholder',
                    html: '<div id="duplicate-online-map" style="width:100%;height:100%;"></div>'
                }]
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Нижняя панель (пусто)</div>'
            }]
        });

        // Создаём карту после рендера правой панели
        mainPanel.on('afterrender', function() {
            me.initMap();
        }, me, { single: true });

        // Связываем левую вкладку с правой панелью
        navTab.map_frame = mainPanel;

        // Добавляем в интерфейс PILOT
        skeleton.navigation.add(navTab);
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);
    },

    // Создание тулбара (полное копирование вкладки Онлайн)
    buildToolbar: function() {
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

    // Дерево объектов (как в Онлайн)
    buildTree: function() {
        var me = this;

        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: {
                    vehs: 1,
                    state: 1
                },
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
                text: l('Объекты'),
                dataIndex: 'text',
                flex: 2,
                renderer: function(v, m, rec) {
                    return v || rec.get('name') || rec.get('id') || '—';
                }
            }, {
                text: l('Статус'),
                dataIndex: 'state',
                width: 110,
                renderer: function(v, m, rec) {
                    if (!rec.isLeaf()) return '';
                    switch(v) {
                        case 1: return '<i class="fa fa-play-circle" style="color:green;"></i> ' + l('Активен');
                        case 2: return '<i class="fa fa-exclamation-triangle" style="color:red;"></i> ' + l('Авария');
                        case 3: return '<i class="fa fa-pause-circle" style="color:orange;"></i> ' + l('Стоянка');
                        case 4: return '<i class="fa fa-hourglass-half" style="color:gray;"></i> ' + l('Холостой ход');
                        default: return l('Неизвестно');
                    }
                }
            }, {
                text: l('Обновлено'),
                dataIndex: 'last_update',
                width: 140,
                renderer: function(v) {
                    if (!v) return '—';
                    if (typeof v === 'number') return Ext.Date.format(new Date(v * 1000), 'd.m.Y H:i:s');
                    return v;
                }
            }, {
                text: l('Тип оборудования'),
                dataIndex: 'equip_type',
                width: 120,
                renderer: function(v) { return v || '—'; }
            }, {
                text: l('Скорость'),
                dataIndex: 'speed',
                width: 90,
                renderer: function(v, m, rec) {
                    if (!rec.isLeaf() || v === undefined) return '—';
                    return v + ' ' + (window.uom ? window.uom.speed : 'км/ч');
                }
            }],
            viewConfig: { stripeRows: true, loadMask: true, emptyText: l('Загрузка данных...') }
        });

        return me.tree;
    },

    // Инициализация карты в верхней панели
    initMap: function() {
        // Проверяем, что контейнер существует
        var container = document.getElementById('duplicate-online-map');
        if (!container) {
            console.error('Контейнер для карты не найден');
            return;
        }
        // Создаём карту через глобальный MapContainer (если доступен)
        if (typeof MapContainer !== 'undefined') {
            this.map = new MapContainer('duplicate_online_map');
            // Инициализация: центр, зум, id контейнера, скрыть управление?
            this.map.init(55.75, 37.65, 10, 'duplicate-online-map', false);
        } else {
            console.warn('MapContainer не определён, используем fallback Leaflet');
            // Fallback: если Leaflet загружен
            if (window.L) {
                this.map = L.map('duplicate-online-map').setView([55.75, 37.65], 10);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(this.map);
            } else {
                container.innerHTML = '<div style="padding:20px;text-align:center;">Карта не доступна</div>';
            }
        }
    },

    // Фильтрация по состоянию (перезагрузка дерева)
    filterByState: function(btn, stateValue) {
        var me = this;
        var proxy = me.treeStore.getProxy();
        if (stateValue === 'all') {
            proxy.setExtraParam('state', 1);
        } else {
            proxy.setExtraParam('state', stateValue);
        }
        me.treeStore.load();
    },

    // Клиентский поиск по тексту
    applySearchFilter: function(query) {
        var root = this.treeStore.getRootNode();
        if (!root) return;

        // Сбрасываем видимость
        root.cascadeBy(function(node) { node.set('visible', true); });

        if (!query || query.length < 2) return;

        var lower = query.toLowerCase();
        // Скрываем все
        root.cascadeBy(function(node) { if (node !== root) node.set('visible', false); });
        // Показываем совпадающие и их предков
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = (node.get('text') || node.get('name') || '').toLowerCase();
                if (text.indexOf(lower) !== -1) {
                    node.set('visible', true);
                    var parent = node.parentNode;
                    while (parent && parent !== root) {
                        parent.set('visible', true);
                        parent = parent.parentNode;
                    }
                }
            }
        });
    }
});
